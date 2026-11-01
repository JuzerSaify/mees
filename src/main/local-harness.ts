import { spawn } from 'node:child_process'
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { buildSystemPrompt } from '../shared/assistant-protocol'
import {
  EFFORT_LEVELS,
  normalizeEffort,
  type EffortLevel
} from '../shared/effort'
import {
  HARNESS_PROVIDER_IDS,
  type HarnessProviderId,
  type ModelInfo
} from '../shared/types'
import type {
  AgentConversationMessage,
  AgentToolCall,
  AgentTurnRequest,
  AgentTurnResult
} from './providers'

interface HarnessDefinition {
  provider: HarnessProviderId
  commands: string[]
  versionArgs: string[]
}

export interface LocalHarnessDetection {
  provider: HarnessProviderId
  available: boolean
  commandPath?: string
  version?: string
  models: ModelInfo[]
  error?: string
}

interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
}

const HARNESS_DEFINITIONS: Record<HarnessProviderId, HarnessDefinition> = {
  codex: {
    provider: 'codex',
    commands: ['codex'],
    versionArgs: ['--version']
  },
  opencode: {
    provider: 'opencode',
    commands: ['opencode', 'opencode2'],
    versionArgs: ['--version']
  }
}

const HARNESS_CACHE = new Map<HarnessProviderId, LocalHarnessDetection>()
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,220}$/
const EFFORT_SET = new Set<string>(EFFORT_LEVELS)

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveWindowsCommandShim(path: string): Promise<string> {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(path)) {
    return path
  }

  try {
    const wrapper = await readFile(path, 'utf8')
    const match = /"%dp0%\\([^"]+\.exe)"/i.exec(wrapper)
    if (!match?.[1]) return path
    const candidate = join(dirname(path), match[1])
    return (await isFile(candidate)) ? candidate : path
  } catch {
    return path
  }
}

async function fallbackExecutables(command: string): Promise<string[]> {
  const candidates: string[] = []
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    if (command === 'codex') {
      const binDirectory = join(
        process.env.LOCALAPPDATA,
        'OpenAI',
        'Codex',
        'bin'
      )
      try {
        const versions = await readdir(binDirectory, { withFileTypes: true })
        for (const entry of versions) {
          if (entry.isDirectory()) {
            candidates.push(join(binDirectory, entry.name, 'codex.exe'))
          }
        }
      } catch {
        // The CLI may be installed only on PATH or in a user-selected folder.
      }
      candidates.push(
        join(process.env.LOCALAPPDATA, 'Programs', 'Codex', 'codex.exe')
      )
    }
    if (command === 'opencode') {
      candidates.push(
        join(
          process.env.LOCALAPPDATA,
          'Programs',
          'OpenCode',
          'OpenCode.exe'
        ),
        join(process.env.LOCALAPPDATA, 'Programs', 'opencode', 'opencode.exe')
      )
    }
  }
  if (process.platform !== 'win32') {
    candidates.push(
      join(homedir(), '.local', 'bin', command),
      join('/usr/local/bin', command),
      join('/opt/homebrew/bin', command)
    )
  }
  return candidates
}

export async function findHarnessExecutable(
  commands: string[]
): Promise<string | null> {
  const pathDirectories = (process.env.PATH ?? '')
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
  const extensions =
    process.platform === 'win32'
      ? ['.exe', '.cmd', '.bat']
      : ['']

  for (const command of commands) {
    for (const directory of pathDirectories) {
      for (const extension of extensions) {
        const candidate = join(directory, `${command}${extension}`)
        if (!(await isFile(candidate))) continue
        return resolveWindowsCommandShim(candidate)
      }
    }
    for (const candidate of await fallbackExecutables(command)) {
      if (await isFile(candidate)) {
        return resolveWindowsCommandShim(candidate)
      }
    }
  }
  return null
}

function commandForPlatform(
  executable: string,
  args: string[]
): { command: string; args: string[] } {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(executable)) {
    return { command: executable, args }
  }

  const quoted = [executable, ...args]
    .map((value) => `"${value.replace(/"/g, '\\"')}"`)
    .join(' ')
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', quoted]
  }
}

async function runCommand(
  executable: string,
  args: string[],
  options: {
    cwd?: string
    input?: string
    signal?: AbortSignal
    timeoutMs?: number
    onStdoutLine?: (line: string) => void
  } = {}
): Promise<CommandResult> {
  const invocation = commandForPlatform(executable, args)
  const child = spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      CI: '1'
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  let stdoutBuffer = ''

  const timeout = setTimeout(() => {
    child.kill()
  }, options.timeoutMs ?? 120_000)
  const abort = (): void => {
    child.kill()
  }
  options.signal?.addEventListener('abort', abort, { once: true })

  const consumeStdout = (chunk: Buffer): void => {
    const text = chunk.toString('utf8')
    stdout += text
    if (stdout.length > 6_000_000) {
      child.kill()
      return
    }
    if (!options.onStdoutLine) return
    stdoutBuffer += text
    let newline = stdoutBuffer.indexOf('\n')
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '')
      stdoutBuffer = stdoutBuffer.slice(newline + 1)
      if (line.trim()) options.onStdoutLine(line)
      newline = stdoutBuffer.indexOf('\n')
    }
  }

  child.stdout.on('data', consumeStdout)
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })

  if (options.input !== undefined) {
    child.stdin.end(options.input)
  } else {
    child.stdin.end()
  }

  let code: number | null
  try {
    code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }

  if (options.onStdoutLine && stdoutBuffer.trim()) {
    options.onStdoutLine(stdoutBuffer.trim())
  }
  if (options.signal?.aborted) {
    throw new DOMException('Request cancelled', 'AbortError')
  }
  if (stdout.length > 6_000_000) {
    throw new Error('The local harness returned too much output.')
  }

  return { code, stdout, stderr }
}

async function readHarnessVersion(
  executable: string,
  definition: HarnessDefinition
): Promise<string | undefined> {
  try {
    const result = await runCommand(executable, definition.versionArgs, {
      timeoutMs: 15_000
    })
    if (result.code !== 0) return undefined
    const line = result.stdout.trim().split(/\r?\n/)[0]?.trim()
    return line ? line.slice(0, 160) : undefined
  } catch {
    return undefined
  }
}

async function codexConfiguredModel(): Promise<string | undefined> {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  try {
    const config = await readFile(join(codexHome, 'config.toml'), 'utf8')
    for (const line of config.split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) break
      const match = /^\s*model\s*=\s*["']([^"']+)["']/.exec(line)
      if (match?.[1]) return match[1]
    }
  } catch {
    return undefined
  }
  return undefined
}

function normalizedEffort(value: unknown): EffortLevel | undefined {
  return typeof value === 'string' && EFFORT_SET.has(value)
    ? (value as EffortLevel)
    : undefined
}

async function codexModels(executable: string): Promise<ModelInfo[]> {
  const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
    env: {
      ...process.env,
      NO_COLOR: '1'
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let buffer = ''
  let stderr = ''
  let nextRequestId = 1
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()

  const timeout = setTimeout(() => {
    for (const request of pending.values()) {
      request.reject(new Error('Codex model discovery timed out.'))
    }
    pending.clear()
    child.kill()
  }, 20_000)

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          const message = asRecord(JSON.parse(line))
          const id = typeof message.id === 'number' ? message.id : null
          if (id !== null) {
            const request = pending.get(id)
            if (request) {
              pending.delete(id)
              if (message.error) {
                request.reject(
                  new Error(
                    typeof asRecord(message.error).message === 'string'
                      ? String(asRecord(message.error).message)
                      : 'Codex model discovery failed.'
                  )
                )
              } else {
                request.resolve(message.result)
              }
            }
          }
        } catch {
          // Ignore non-JSON diagnostics from the app server.
        }
      }
      newline = buffer.indexOf('\n')
    }
  })

  const request = (method: string, params: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextRequestId
      nextRequestId += 1
      pending.set(id, { resolve, reject })
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params
        })}\n`
      )
    })

  try {
    await request('initialize', {
      clientInfo: {
        name: 'mees',
        title: 'Mees',
        version: '1.2.0'
      },
      capabilities: {
        experimentalApi: true
      }
    })
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized'
      })}\n`
    )

    const models: ModelInfo[] = []
    let cursor: string | null = null
    do {
      const page = asRecord(
        await request('model/list', {
          limit: 100,
          ...(cursor ? { cursor } : {})
        })
      )
      for (const rawModel of asArray(page.data)) {
        const model = asRecord(rawModel)
        const id = typeof model.id === 'string' ? model.id : ''
        if (!id || model.hidden === true) continue
        const reasoningEfforts = asArray(model.supportedReasoningEfforts)
          .map((item) => normalizedEffort(asRecord(item).reasoningEffort))
          .filter((item): item is EffortLevel => Boolean(item))
        const defaultEffort = normalizedEffort(model.defaultReasoningEffort)
        const inputModalities = asArray(model.inputModalities)
        models.push({
          id,
          name:
            typeof model.displayName === 'string' ? model.displayName : id,
          provider: 'codex',
          supportsImages: inputModalities.includes('image'),
          latest: model.isDefault === true,
          ...(reasoningEfforts.length
            ? {
                reasoningEfforts: Array.from(new Set(reasoningEfforts)),
                defaultEffort:
                  defaultEffort ?? reasoningEfforts[0]
              }
            : {})
        })
      }
      cursor =
        typeof page.nextCursor === 'string' && page.nextCursor
          ? page.nextCursor
          : null
    } while (cursor)

    if (models.length === 0) {
      throw new Error(
        stderr.trim().slice(0, 300) ||
          'Codex did not report an available model for this account.'
      )
    }
    return models
  } finally {
    clearTimeout(timeout)
    child.kill()
  }
}

export function parseOpenCodeModelLines(output: string): ModelInfo[] {
  const seen = new Set<string>()
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    .filter(
      (line) =>
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:#-]+$/.test(line) &&
        !seen.has(line) &&
        Boolean(seen.add(line))
    )
    .map((id) => ({
      id,
      name: id,
      provider: 'opencode',
      supportsImages:
        /(?:vision|image|vl|multimodal|omni)/i.test(id) ? true : undefined
    }))
}

async function openCodeModels(executable: string): Promise<ModelInfo[]> {
  const result = await runCommand(executable, ['models'], {
    timeoutMs: 30_000
  })
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim().slice(0, 400) ||
        'OpenCode could not list its models.'
    )
  }
  const models = parseOpenCodeModelLines(result.stdout)
  if (models.length === 0) {
    throw new Error('OpenCode did not report an available model.')
  }
  return models
}

async function detectHarness(
  definition: HarnessDefinition
): Promise<LocalHarnessDetection> {
  const executable = await findHarnessExecutable(definition.commands)
  if (!executable) {
    return {
      provider: definition.provider,
      available: false,
      models: []
    }
  }

  try {
    const [version, discoveredModels, preferredModel] = await Promise.all([
      readHarnessVersion(executable, definition),
      definition.provider === 'codex'
        ? codexModels(executable)
        : openCodeModels(executable),
      definition.provider === 'codex'
        ? codexConfiguredModel()
        : Promise.resolve(undefined)
    ])
    const preferredIndex = preferredModel
      ? discoveredModels.findIndex((model) => model.id === preferredModel)
      : -1
    const models =
      preferredIndex > 0
        ? [
            discoveredModels[preferredIndex],
            ...discoveredModels.slice(0, preferredIndex),
            ...discoveredModels.slice(preferredIndex + 1)
          ]
        : discoveredModels
    const detection: LocalHarnessDetection = {
      provider: definition.provider,
      available: true,
      commandPath: executable,
      version,
      models
    }
    HARNESS_CACHE.set(definition.provider, detection)
    return detection
  } catch (error) {
    const failed: LocalHarnessDetection = {
      provider: definition.provider,
      available: false,
      commandPath: executable,
      models: [],
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'The local harness could not start.'
    }
    HARNESS_CACHE.set(definition.provider, failed)
    return failed
  }
}

export async function discoverLocalHarnesses(): Promise<
  LocalHarnessDetection[]
> {
  return Promise.all(
    HARNESS_PROVIDER_IDS.map((provider) =>
      detectHarness(HARNESS_DEFINITIONS[provider])
    )
  )
}

export async function refreshLocalHarness(
  provider: HarnessProviderId
): Promise<LocalHarnessDetection> {
  return detectHarness(HARNESS_DEFINITIONS[provider])
}

function conversationText(message: AgentConversationMessage): string {
  if (message.role === 'tool') {
    return [
      `<mees_tool_result name="${message.toolName ?? 'tool'}" call="${message.toolCallId ?? ''}">`,
      message.content,
      '</mees_tool_result>'
    ].join('\n')
  }
  if (message.role === 'assistant') {
    return [
      message.content.trim(),
      ...(message.toolCalls ?? []).map(
        (call) =>
          `<mees_tool_call>${JSON.stringify({
            name: call.name,
            arguments: call.arguments
          })}</mees_tool_call>`
      )
    ]
      .filter(Boolean)
      .join('\n')
  }
  const imageLine = message.referenceImages?.length
    ? `Attached reference images: ${message.referenceImages
        .map((image) => image.name)
        .join(', ')}.`
    : ''
  return [message.content.trim(), imageLine].filter(Boolean).join('\n\n')
}

function harnessPrompt(request: AgentTurnRequest): string {
  const system = buildSystemPrompt({
    currentDesign: request.currentDesign,
    designMode: request.designMode,
    mode: request.mode,
    reviewNotes: request.reviewNotes,
    externalContext: request.externalContext,
    purpose: request.purpose,
    target: request.target,
    recentDesigns: request.recentDesigns,
    referenceVisuals: request.referenceVisuals,
    designMemory: request.designMemory
  })
  const tools = request.tools.length
    ? JSON.stringify(request.tools, null, 2)
    : '[]'

  return [
    system,
    '',
    'LOCAL HARNESS BRIDGE',
    'You are running through the user\'s installed paid CLI harness. Work only from the conversation and files supplied here.',
    'Do not inspect the repository, run terminal commands, edit files, invoke the CLI built-in tools, or request approvals.',
    'Mees owns the tool loop. The only tools available are listed below.',
    'When you need one or more Mees tools, respond with only one or more blocks in this exact form:',
    '<mees_tool_call>{"name":"tool_name","arguments":{}}</mees_tool_call>',
    'You may emit several tool blocks together. After Mees returns the tool results, continue in the same task.',
    'Do not output a plan, progress update, internal reasoning, or a description of what you are about to do.',
    'When no more tools are needed, return the normal response protocol for this task, including the required design or patch block.',
    '',
    'MEES TOOLS',
    tools,
    '',
    'CONVERSATION',
    request.messages.map(conversationText).filter(Boolean).join('\n\n')
  ].join('\n')
}

export function parseToolCallBlocks(
  text: string,
  allowedToolNames: string[]
): {
  text: string
  toolCalls: AgentToolCall[]
  usage: AgentTurnResult['usage']
} {
  const allowed = new Set(allowedToolNames)
  const calls: AgentToolCall[] = []
  const ranges: Array<{ start: number; end: number }> = []
  const openingPattern = /<mees_tool_call>/gi
  let match: RegExpExecArray | null

  while ((match = openingPattern.exec(text))) {
    const start = match.index
    const jsonStart = text.indexOf('{', openingPattern.lastIndex)
    const closingIndex = text.indexOf(
      '</mees_tool_call>',
      openingPattern.lastIndex
    )
    if (closingIndex >= 0 && (jsonStart < 0 || jsonStart > closingIndex)) {
      const end = closingIndex + '</mees_tool_call>'.length
      ranges.push({ start, end })
      openingPattern.lastIndex = end
      continue
    }
    if (jsonStart < 0) break

    let depth = 0
    let inString = false
    let escaped = false
    let jsonEnd = -1
    for (let index = jsonStart; index < text.length; index += 1) {
      const character = text[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (character === '\\') {
          escaped = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }
      if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          jsonEnd = index + 1
          break
        }
      }
    }

    if (jsonEnd < 0) break
    let end = jsonEnd
    const trailing = /^(?:\s*<\/(?:mees_tool_call|arg_value|tool_call)>)+/i
    const trailingMatch = trailing.exec(text.slice(end))
    if (trailingMatch) end += trailingMatch[0].length
    ranges.push({ start, end })
    openingPattern.lastIndex = end

    try {
      const payload = asRecord(JSON.parse(text.slice(jsonStart, jsonEnd)))
      const name =
        typeof payload.name === 'string'
          ? payload.name
          : typeof payload.tool === 'string'
            ? payload.tool
            : ''
      if (!allowed.has(name)) continue
      calls.push({
        id: randomUUID(),
        name,
        arguments: asRecord(payload.arguments)
      })
    } catch {
      // Ignore malformed tool blocks rather than executing an unknown action.
    }
  }

  let visibleText = text
  for (const range of ranges.reverse()) {
    visibleText =
      visibleText.slice(0, range.start) + visibleText.slice(range.end)
  }
  visibleText = visibleText
    .replace(/<\/?(?:mees_tool_call|arg_value|tool_call)>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text: visibleText,
    toolCalls: calls,
    usage: {}
  }
}

async function materializeReferenceImages(
  messages: AgentConversationMessage[],
  directory: string
): Promise<string[]> {
  const files: string[] = []
  const seen = new Set<string>()
  for (const message of messages) {
    for (const image of message.referenceImages ?? []) {
      if (files.length >= 8 || seen.has(image.id)) continue
      const match =
        /^data:(image\/(png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(
          image.dataUrl
        )
      if (!match?.[2] || !match[3]) continue
      seen.add(image.id)
      const extension = match[2].toLowerCase()
      const path = join(directory, `reference-${files.length + 1}.${extension}`)
      await writeFile(path, Buffer.from(match[3].replace(/\s+/g, ''), 'base64'))
      files.push(path)
    }
  }
  return files
}

async function runCodexHarness(
  request: AgentTurnRequest,
  executable: string,
  directory: string,
  images: string[],
  modelInfo: ModelInfo | undefined,
  prompt: string
): Promise<AgentTurnResult> {
  if (!SAFE_MODEL_ID.test(request.model)) {
    throw new Error('The selected Codex model identifier is invalid.')
  }
  const effort = normalizeEffort(
    'codex',
    request.model,
    request.effort,
    modelInfo
  )
  const args = [
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color',
    'never',
    '-C',
    directory,
    '-m',
    request.model,
    ...(effort
      ? ['-c', `model_reasoning_effort="${effort}"`]
      : []),
    ...images.flatMap((image) => ['-i', image]),
    '-'
  ]
  let text = ''
  let failure = ''
  let usage: AgentTurnResult['usage'] = {}
  request.onProviderEvent?.({ type: 'attempt', attempt: 1 })

  const result = await runCommand(executable, args, {
    cwd: directory,
    input: prompt,
    signal: request.signal,
    timeoutMs: 10 * 60_000,
    onStdoutLine: (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) return
      let event: Record<string, unknown>
      try {
        event = asRecord(JSON.parse(trimmed))
      } catch {
        return
      }
      if (event.type === 'thread.started' || event.type === 'turn.started') {
        request.onProviderEvent?.({ type: 'connected', attempt: 1 })
        return
      }
      if (event.type === 'item.completed') {
        const item = asRecord(event.item)
        if (item.type === 'agent_message' && typeof item.text === 'string') {
          text += item.text
        } else if (item.type === 'error' && typeof item.message === 'string') {
          failure = item.message
        }
        return
      }
      if (event.type === 'turn.completed') {
        const rawUsage = asRecord(event.usage)
        usage = {
          inputTokens:
            typeof rawUsage.input_tokens === 'number'
              ? rawUsage.input_tokens
              : undefined,
          outputTokens:
            typeof rawUsage.output_tokens === 'number'
              ? rawUsage.output_tokens
              : undefined
        }
        return
      }
      if (event.type === 'turn.failed' || event.type === 'error') {
        const nested = asRecord(event.error)
        failure =
          (typeof event.message === 'string' && event.message) ||
          (typeof nested.message === 'string' && nested.message) ||
          'Codex stopped before returning a response.'
      }
    }
  })

  if (result.code !== 0 && !text) {
    throw new Error(
      failure ||
        result.stderr.trim().slice(0, 600) ||
        'Codex stopped before returning a response.'
    )
  }
  if (failure && !text) throw new Error(failure)
  const parsed = parseToolCallBlocks(
    text,
    request.tools.map((tool) => tool.name)
  )
  if (/<mees_tool_call>/i.test(text) && parsed.toolCalls.length === 0) {
    throw new Error(
      'Codex returned a tool request that Mees could not validate.'
    )
  }
  return { ...parsed, usage }
}

async function runOpenCodeHarness(
  request: AgentTurnRequest,
  executable: string,
  directory: string,
  images: string[],
  prompt: string
): Promise<AgentTurnResult> {
  if (!SAFE_MODEL_ID.test(request.model)) {
    throw new Error('The selected OpenCode model identifier is invalid.')
  }
  let text = ''
  let failure = ''
  let usage: AgentTurnResult['usage'] = {}
  request.onProviderEvent?.({ type: 'attempt', attempt: 1 })

  const result = await runCommand(
    executable,
    [
      'run',
      '--format',
      'json',
      '--model',
      request.model,
      ...images.flatMap((image) => ['--file', image])
    ],
    {
      cwd: directory,
      input: prompt,
      signal: request.signal,
      timeoutMs: 10 * 60_000,
      onStdoutLine: (line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('{')) return
        let event: Record<string, unknown>
        try {
          event = asRecord(JSON.parse(trimmed))
        } catch {
          return
        }
        if (event.type === 'step_start') {
          request.onProviderEvent?.({ type: 'connected', attempt: 1 })
          return
        }
        if (event.type === 'text') {
          const part = asRecord(event.part)
          if (typeof part.text === 'string') {
            text += part.text
          }
          return
        }
        if (event.type === 'step_finish') {
          const part = asRecord(event.part)
          const tokens = asRecord(part.tokens)
          const input = typeof tokens.input === 'number' ? tokens.input : undefined
          const output = typeof tokens.output === 'number' ? tokens.output : undefined
          if (input !== undefined || output !== undefined) {
            usage = {
              inputTokens: input,
              outputTokens: output
            }
          }
          return
        }
        if (event.type === 'error') {
          const nested = asRecord(event.error)
          failure =
            (typeof nested.message === 'string' && nested.message) ||
            (typeof event.message === 'string' && event.message) ||
            'OpenCode stopped before returning a response.'
        }
      }
    }
  )

  if (result.code !== 0 && !text) {
    throw new Error(
      failure ||
        result.stderr.trim().slice(0, 600) ||
        'OpenCode stopped before returning a response.'
    )
  }
  if (failure && !text) throw new Error(failure)
  const parsed = parseToolCallBlocks(
    text,
    request.tools.map((tool) => tool.name)
  )
  if (/<mees_tool_call>/i.test(text) && parsed.toolCalls.length === 0) {
    throw new Error(
      'OpenCode returned a tool request that Mees could not validate.'
    )
  }
  return { ...parsed, usage }
}

function hasFinalArtifact(text: string): boolean {
  return /:::\s*(?:design|patch)\b|<svg\b|<!doctype\s+html\b|<html\b/i.test(
    text
  )
}

async function emitHarnessText(
  text: string,
  request: AgentTurnRequest
): Promise<void> {
  if (!text) return
  if (request.purpose === 'visual-inspection') {
    request.onDelta(text)
    return
  }

  const characters = Array.from(text)
  const chunks = Math.max(12, Math.min(120, Math.ceil(characters.length / 180)))
  const chunkSize = Math.max(1, Math.ceil(characters.length / chunks))
  const delayMs = Math.max(8, Math.min(18, Math.floor(1_100 / chunks)))
  for (let start = 0; start < characters.length; start += chunkSize) {
    if (request.signal.aborted) {
      throw new DOMException('Request cancelled', 'AbortError')
    }
    request.onDelta(characters.slice(start, start + chunkSize).join(''))
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  }
}

export async function runLocalHarnessAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
  if (request.provider !== 'codex' && request.provider !== 'opencode') {
    throw new Error('The local harness provider is invalid.')
  }

  let detection = HARNESS_CACHE.get(request.provider)
  if (!detection?.available || !detection.commandPath) {
    detection = await refreshLocalHarness(request.provider)
  }
  if (!detection.available || !detection.commandPath) {
    throw new Error(
      detection.error ||
        'The selected local harness is no longer available.'
    )
  }

  const directory = await mkdtemp(join(tmpdir(), 'mees-harness-'))
  try {
    const images = await materializeReferenceImages(request.messages, directory)
    const modelInfo = detection.models.find(
      (model) => model.id === request.model
    )
    const runAttempt = (prompt: string): Promise<AgentTurnResult> =>
      request.provider === 'codex'
        ? runCodexHarness(
            request,
            detection.commandPath!,
            directory,
            images,
            modelInfo,
            prompt
          )
        : runOpenCodeHarness(
            request,
            detection.commandPath!,
            directory,
            images,
            prompt
          )

    let result = await runAttempt(harnessPrompt(request))
    if (
      request.purpose !== 'visual-inspection' &&
      result.toolCalls.length === 0 &&
      !hasFinalArtifact(result.text)
    ) {
      const correctionRequest: AgentTurnRequest = {
        ...request,
        messages: [
          ...request.messages,
          {
            role: 'user',
            content: [
              'Your previous response was rejected because it contained commentary only.',
              'Continue now with either a valid Mees tool call or the complete required design or patch block.',
              'Do not return another plan, status update or description of your process.'
            ].join(' ')
          }
        ]
      }
      result = await runAttempt(harnessPrompt(correctionRequest))
    }
    if (
      request.purpose !== 'visual-inspection' &&
      result.toolCalls.length === 0 &&
      !hasFinalArtifact(result.text)
    ) {
      throw new Error(
        'The local harness returned commentary without the required design artifact.'
      )
    }
    if (result.text && result.toolCalls.length === 0) {
      await emitHarnessText(result.text, request)
    }
    return result
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
