import {
  PROVIDER_DEFINITIONS,
  type AgentHistoryMessage,
  type AgentReferenceImage,
  type DesignMemoryEntry,
  type DesignMode,
  type DesignSelection,
  type ModelInfo,
  type ProviderId,
  type RecentDesignSummary,
  type ReferenceVisualSummary,
  type TokenUsage
} from '../shared/types'
import { buildSystemPrompt } from '../shared/assistant-protocol'
import { filterModelCatalog } from '../shared/model-catalog'
import {
  geminiThinkingBudget,
  getEffortSupport,
  normalizeEffort,
  type EffortLevel
} from '../shared/effort'
import { randomUUID } from 'node:crypto'

type JsonRecord = Record<string, unknown>

interface StreamRequest {
  provider: ProviderId
  model: string
  effort?: EffortLevel
  apiKey: string
  history: AgentHistoryMessage[]
  currentDesign: string
  designMode?: DesignMode
  externalContext?: string
  purpose?: 'design' | 'targeted-edit'
  mode?: 'design' | 'polish' | 'targeted-edit'
  reviewNotes?: string
  target?: DesignSelection
  recentDesigns?: RecentDesignSummary[]
  referenceVisuals?: ReferenceVisualSummary[]
  designMemory?: DesignMemoryEntry[]
  signal: AbortSignal
  onDelta: (delta: string) => void
  onProviderEvent?: (event: ProviderRuntimeEvent) => void
}

export interface ProviderRuntimeEvent {
  type: 'attempt' | 'connected' | 'retry'
  attempt: number
  status?: number
  delayMs?: number
}

export interface AgentToolDefinition {
  name: string
  description: string
  inputSchema: JsonRecord
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: JsonRecord
  providerItemId?: string
}

export interface AgentConversationMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  referenceImages?: AgentReferenceImage[]
  toolCalls?: AgentToolCall[]
  toolCallId?: string
  toolName?: string
}

export interface AgentTurnRequest {
  provider: ProviderId
  model: string
  effort?: EffortLevel
  apiKey: string
  currentDesign: string
  designMode?: DesignMode
  externalContext?: string
  purpose?: 'design' | 'targeted-edit'
  mode?: 'design' | 'polish' | 'targeted-edit'
  reviewNotes?: string
  target?: DesignSelection
  recentDesigns?: RecentDesignSummary[]
  referenceVisuals?: ReferenceVisualSummary[]
  designMemory?: DesignMemoryEntry[]
  messages: AgentConversationMessage[]
  tools: AgentToolDefinition[]
  signal: AbortSignal
  onDelta: (delta: string) => void
  onProviderEvent?: (event: ProviderRuntimeEvent) => void
}

export interface AgentTurnResult {
  text: string
  toolCalls: AgentToolCall[]
  usage: TokenUsage
}

export class ProviderRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderRequestError'
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function friendlyModelName(id: string): string {
  if (id.startsWith('gpt-')) return `GPT-${id.slice(4)}`
  if (/^o\d/i.test(id)) return id.toUpperCase()
  return id
}

async function providerError(response: Response): Promise<ProviderRequestError> {
  let detail = ''
  try {
    const text = await response.text()
    if (text) {
      try {
        const payload = asRecord(JSON.parse(text))
        const nestedError = asRecord(payload.error)
        detail =
          (typeof nestedError.message === 'string' && nestedError.message) ||
          (typeof payload.message === 'string' && payload.message) ||
          (Array.isArray(payload) ? JSON.stringify(payload[0]) : '')
      } catch {
        detail = text
      }
    }
  } catch {
    detail = ''
  }

  const concise = detail.replace(/\s+/g, ' ').trim().slice(0, 500)
  return new ProviderRequestError(
    concise
      ? `The provider rejected the request (${response.status}): ${concise}`
      : `The provider rejected the request (${response.status}).`
  )
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 30_000): Promise<JsonRecord> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ProviderRequestError('The provider did not answer in time.')
    }
    throw new ProviderRequestError('The provider could not be reached. Check your connection.')
  }

  if (!response.ok) throw await providerError(response)
  return asRecord(await response.json())
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Request cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener(
      'abort',
      onAbort,
      { once: true }
    )
  })
}

function outputTokenLimit(purpose: StreamRequest['purpose']): number {
  if (purpose === 'targeted-edit') return 8_000
  return 16_384
}

async function fetchProvider(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  onEvent?: (event: ProviderRuntimeEvent) => void
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    onEvent?.({ type: 'attempt', attempt: attempt + 1 })
    try {
      const response = await fetch(url, { ...init, signal })
      if (
        attempt === 0 &&
        (response.status === 429 || response.status >= 500)
      ) {
        await response.body?.cancel().catch(() => undefined)
        const retryAfter = Number(response.headers.get('retry-after'))
        await waitForRetry(
          Number.isFinite(retryAfter)
            ? Math.min(2_000, Math.max(350, retryAfter * 1_000))
            : 500,
          signal
        )
        onEvent?.({
          type: 'retry',
          attempt: attempt + 2,
          status: response.status,
          delayMs: Number.isFinite(retryAfter)
            ? Math.min(2_000, Math.max(350, retryAfter * 1_000))
            : 500
        })
        continue
      }
      onEvent?.({
        type: 'connected',
        attempt: attempt + 1,
        status: response.status
      })
      return response
    } catch (error) {
      if (signal.aborted) throw error
      if (attempt === 1) throw error
      await waitForRetry(350, signal)
      onEvent?.({ type: 'retry', attempt: attempt + 2, delayMs: 350 })
    }
  }
  throw new ProviderRequestError('The provider could not be reached.')
}

async function listOpenAiModels(apiKey: string): Promise<ModelInfo[]> {
  const payload = await fetchJson('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  })

  const records = asArray(payload.data)
    .map(asRecord)
    .filter((model) => {
      const id = typeof model.id === 'string' ? model.id : ''
      return id.length > 0
    })
    .sort((a, b) => (toNumber(b.created) ?? 0) - (toNumber(a.created) ?? 0))

  const models = records.map((model) => {
    const id = String(model.id)
    return {
      id,
      name: friendlyModelName(id),
      provider: 'openai',
      releasedAt:
        toNumber(model.created) !== undefined
          ? new Date((toNumber(model.created) as number) * 1000).toISOString()
          : undefined,
      supportsImages: !/(?:^text-|audio|realtime|transcri|tts|whisper|embedding)/i.test(
        id
      ),
      shutdownDate:
        typeof model.shutdown_date === 'string' ? model.shutdown_date : undefined
    } satisfies ModelInfo
  })
  return filterModelCatalog('openai', models)
}

async function listAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const url = new URL('https://api.anthropic.com/v1/models')
  url.searchParams.set('limit', '1000')
  url.searchParams.append('lifecycle[]', 'active')

  let payload: JsonRecord
  try {
    payload = await fetchJson(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2026-10-21',
        Accept: 'application/json'
      }
    })
  } catch {
    payload = await fetchJson('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2026-10-21',
        Accept: 'application/json'
      }
    })
  }

  const records = asArray(payload.data)
    .map(asRecord)
    .filter((model) => typeof model.id === 'string')
    .filter((model) => !model.lifecycle || model.lifecycle === 'active')
    .sort((a, b) => {
      const aDate = typeof a.created_at === 'string' ? a.created_at : ''
      const bDate = typeof b.created_at === 'string' ? b.created_at : ''
      return bDate.localeCompare(aDate)
    })

  return filterModelCatalog('anthropic', records.map((model) => ({
    id: String(model.id),
    name: typeof model.display_name === 'string' ? model.display_name : String(model.id),
    provider: 'anthropic',
    releasedAt: typeof model.created_at === 'string' ? model.created_at : undefined,
    contextWindow: toNumber(model.max_input_tokens),
      outputLimit: toNumber(model.max_tokens),
      supportsImages: true
  })))
}

async function listGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const payload = await fetchJson(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    {
      headers: {
        'x-goog-api-key': apiKey,
        Accept: 'application/json'
      }
    }
  )

  const records = asArray(payload.models)
    .map(asRecord)
    .filter((model) => {
      const methods = asArray(model.supportedGenerationMethods)
      return typeof model.name === 'string' && methods.includes('generateContent')
    })
    .sort((left, right) => {
      const leftVersion = Number.parseFloat(String(left.version ?? ''))
      const rightVersion = Number.parseFloat(String(right.version ?? ''))
      return (
        (Number.isFinite(rightVersion) ? rightVersion : 0) -
        (Number.isFinite(leftVersion) ? leftVersion : 0)
      )
    })

  const models = records.map((model) => {
    const rawName = String(model.name)
    const id = rawName.replace(/^models\//, '')
    return {
      id,
      name: typeof model.displayName === 'string' ? model.displayName : id,
      provider: 'google',
      contextWindow: toNumber(model.inputTokenLimit),
      outputLimit: toNumber(model.outputTokenLimit),
      supportsImages: /^gemini-/i.test(id)
    } satisfies ModelInfo
  })
  return filterModelCatalog('google', models)
}

async function listDeepSeekModels(apiKey: string): Promise<ModelInfo[]> {
  const payload = await fetchJson('https://api.deepseek.com/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  })

  const records = asArray(payload.data)
    .map(asRecord)
    .filter((model) => typeof model.id === 'string')

  return filterModelCatalog('deepseek', records.map((model) => ({
    id: String(model.id),
    name: typeof model.name === 'string' ? model.name : String(model.id),
    provider: 'deepseek',
    contextWindow: toNumber(model.context_window),
    outputLimit: toNumber(model.max_output_tokens),
    supportsImages:
      asArray(model.input_modalities).includes('image') ||
      asArray(model.inputModalities).includes('image')
  })))
}

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelInfo[]> {
  switch (provider) {
    case 'openai':
      return listOpenAiModels(apiKey)
    case 'anthropic':
      return listAnthropicModels(apiKey)
    case 'google':
      return listGeminiModels(apiKey)
    case 'deepseek':
      return listDeepSeekModels(apiKey)
    default:
      throw new ProviderRequestError('Unknown provider.')
  }
}

function parseSseData(frame: string): string | null {
  const lines = frame.split(/\r?\n/)
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  return data || null
}

async function consumeSse(
  response: Response,
  onData: (data: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) throw new ProviderRequestError('The provider returned an empty stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const drainFrames = (flush = false): void => {
    let boundary = buffer.search(/\r?\n\r?\n/)
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2))
      const data = parseSseData(frame)
      if (data) onData(data)
      boundary = buffer.search(/\r?\n\r?\n/)
    }
    if (flush && buffer.trim()) {
      const data = parseSseData(buffer)
      if (data) onData(data)
      buffer = ''
    }
  }

  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      drainFrames()
    }
    buffer += decoder.decode()
    drainFrames(true)
  } finally {
    reader.releaseLock()
  }
}

function imageParts(image: AgentReferenceImage): {
  mimeType: string
  base64: string
} | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(
    image.dataUrl
  )
  if (!match?.[1] || !match[2]) return null
  return {
    mimeType: match[1].toLocaleLowerCase('en'),
    base64: match[2].replace(/\s+/g, '')
  }
}

function referenceImageLabel(images?: AgentReferenceImage[]): string {
  if (!images?.length) return ''
  return `Reference images, in order: ${images
    .map(
      (image, index) =>
        `${index + 1}. ${image.name} (${image.width}x${image.height})`
    )
    .join('; ')}.`
}

function userMessageText(message: AgentConversationMessage): string {
  const label = referenceImageLabel(message.referenceImages)
  return [message.content.trim(), label].filter(Boolean).join('\n\n')
}

function parseToolArguments(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return {}
  }
}

function toolPayload(value: string): JsonRecord {
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return { result: value }
  }
}

function openAiResponseInput(
  messages: AgentConversationMessage[]
): unknown[] {
  const input: unknown[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: message.content
      })
      continue
    }
    if (message.role === 'assistant') {
      if (message.content.trim()) {
        input.push({ role: 'assistant', content: message.content })
      }
      for (const call of message.toolCalls ?? []) {
        input.push({
          type: 'function_call',
          ...(call.providerItemId ? { id: call.providerItemId } : {}),
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.arguments)
        })
      }
      continue
    }

    const images = message.referenceImages ?? []
    input.push({
      role: 'user',
      content: images.length
        ? [
            {
              type: 'input_text',
              text:
                userMessageText(message) ||
                'Inspect the attached reference images.'
            },
            ...images.flatMap((image) =>
              imageParts(image)
                ? [
                    {
                      type: 'input_image',
                      image_url: image.dataUrl,
                      detail: 'high'
                    }
                  ]
                : []
            )
          ]
        : message.content
    })
  }
  return input
}

function openAiTools(tools: AgentToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false
  }))
}

async function runOpenAiAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
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
  const effort = normalizeEffort('openai', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model: request.model,
          instructions: system,
          input: openAiResponseInput(request.messages),
          stream: true,
          store: false,
          ...(effort ? { reasoning: { effort } } : {}),
          ...(request.tools.length
            ? {
                tools: openAiTools(request.tools),
                tool_choice: 'auto',
                parallel_tool_calls: true
              }
            : {}),
          ...(request.purpose === 'targeted-edit'
            ? { max_output_tokens: 8_000 }
            : {})
        })
      },
      request.signal,
      request.onProviderEvent
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError(
      'OpenAI could not be reached. Check your connection.'
    )
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  let text = ''
  const calls = new Map<
    string,
    {
      id: string
      name: string
      arguments: string
      providerItemId?: string
    }
  >()

  const rememberItem = (rawItem: unknown): void => {
    const item = asRecord(rawItem)
    if (item.type !== 'function_call') return
    const providerItemId =
      typeof item.id === 'string' ? item.id : undefined
    const callId =
      typeof item.call_id === 'string'
        ? item.call_id
        : providerItemId ?? randomUUID()
    const key = providerItemId ?? callId
    const current = calls.get(key)
    calls.set(key, {
      id: callId,
      name:
        typeof item.name === 'string'
          ? item.name
          : current?.name ?? 'unknown_tool',
      arguments:
        typeof item.arguments === 'string'
          ? item.arguments
          : current?.arguments ?? '{}',
      providerItemId
    })
  }

  await consumeSse(
    response,
    (data) => {
      if (data === '[DONE]') return
      const event = asRecord(JSON.parse(data))
      if (
        event.type === 'response.output_text.delta' &&
        typeof event.delta === 'string'
      ) {
        text += event.delta
        request.onDelta(event.delta)
        return
      }
      if (event.type === 'response.output_item.added') {
        rememberItem(event.item)
        return
      }
      if (event.type === 'response.output_item.done') {
        rememberItem(event.item)
        return
      }
      if (
        event.type === 'response.function_call_arguments.delta' &&
        typeof event.item_id === 'string' &&
        typeof event.delta === 'string'
      ) {
        const current = calls.get(event.item_id) ?? {
          id: event.item_id,
          name: 'unknown_tool',
          arguments: '',
          providerItemId: event.item_id
        }
        current.arguments += event.delta
        calls.set(event.item_id, current)
        return
      }
      if (event.type === 'response.completed') {
        const responsePayload = asRecord(event.response)
        for (const item of asArray(responsePayload.output)) rememberItem(item)
        const responseUsage = asRecord(responsePayload.usage)
        usage.inputTokens = toNumber(responseUsage.input_tokens)
        usage.outputTokens = toNumber(responseUsage.output_tokens)
        return
      }
      if (event.type === 'response.failed' || event.type === 'error') {
        const failure = asRecord(event.response)
        const nested = asRecord(failure.error)
        throw new ProviderRequestError(
          typeof nested.message === 'string'
            ? nested.message
            : 'OpenAI stopped before the agent turn completed.'
        )
      }
    },
    request.signal
  )

  return {
    text,
    toolCalls: [...calls.values()].map((call) => ({
      id: call.id,
      name: call.name,
      arguments: parseToolArguments(call.arguments),
      ...(call.providerItemId
        ? { providerItemId: call.providerItemId }
        : {})
    })),
    usage
  }
}

function anthropicMessages(
  messages: AgentConversationMessage[]
): JsonRecord[] {
  const converted: JsonRecord[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content
      }
      const last = converted.at(-1)
      if (
        last?.role === 'user' &&
        Array.isArray(last.content) &&
        (last.content as JsonRecord[]).some(
          (entry) => entry.type === 'tool_result'
        )
      ) {
        ;(last.content as JsonRecord[]).push(block)
      } else {
        converted.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (message.role === 'assistant') {
      const content: JsonRecord[] = []
      if (message.content.trim()) {
        content.push({ type: 'text', text: message.content })
      }
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.arguments
        })
      }
      if (content.length) converted.push({ role: 'assistant', content })
      continue
    }

    const images = message.referenceImages ?? []
    if (!images.length) {
      converted.push({ role: 'user', content: message.content })
      continue
    }
    const content: JsonRecord[] = [
      {
        type: 'text',
        text:
          userMessageText(message) || 'Inspect the attached reference images.'
      }
    ]
    for (const image of images) {
      const parts = imageParts(image)
      if (!parts) continue
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: parts.mimeType,
          data: parts.base64
        }
      })
    }
    converted.push({ role: 'user', content })
  }
  return converted
}

async function runAnthropicAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
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
  const effort = normalizeEffort('anthropic', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'anthropic-version': '2026-10-21',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: outputTokenLimit(request.purpose),
          system,
          messages: anthropicMessages(request.messages),
          stream: true,
          ...(request.tools.length
            ? {
                tools: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.inputSchema
                })),
                tool_choice: { type: 'auto' }
              }
            : {}),
          ...(effort ? { output_config: { effort } } : {})
        })
      },
      request.signal,
      request.onProviderEvent
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError(
      'Claude could not be reached. Check your connection.'
    )
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  let text = ''
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >()

  await consumeSse(
    response,
    (data) => {
      const event = asRecord(JSON.parse(data))
      if (event.type === 'message_start') {
        const message = asRecord(event.message)
        const payloadUsage = asRecord(message.usage)
        usage.inputTokens = toNumber(payloadUsage.input_tokens)
        return
      }
      if (event.type === 'content_block_start') {
        const index = toNumber(event.index) ?? 0
        const block = asRecord(event.content_block)
        if (block.type === 'tool_use') {
          const input = asRecord(block.input)
          calls.set(index, {
            id:
              typeof block.id === 'string' ? block.id : randomUUID(),
            name:
              typeof block.name === 'string' ? block.name : 'unknown_tool',
            arguments: Object.keys(input).length ? JSON.stringify(input) : ''
          })
        }
        return
      }
      if (event.type === 'content_block_delta') {
        const index = toNumber(event.index) ?? 0
        const delta = asRecord(event.delta)
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          text += delta.text
          request.onDelta(delta.text)
          return
        }
        if (
          delta.type === 'input_json_delta' &&
          typeof delta.partial_json === 'string'
        ) {
          const current = calls.get(index)
          if (current) current.arguments += delta.partial_json
        }
        return
      }
      if (event.type === 'content_block_stop') {
        const index = toNumber(event.index) ?? 0
        const current = calls.get(index)
        if (current && !current.arguments.trim()) current.arguments = '{}'
        return
      }
      if (event.type === 'message_delta') {
        const payloadUsage = asRecord(event.usage)
        usage.outputTokens = toNumber(payloadUsage.output_tokens)
        return
      }
      if (event.type === 'error') {
        const nested = asRecord(event.error)
        throw new ProviderRequestError(
          typeof nested.message === 'string'
            ? nested.message
            : 'Claude stopped before the agent turn completed.'
        )
      }
    },
    request.signal
  )

  return {
    text,
    toolCalls: [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: call.id,
        name: call.name,
        arguments: parseToolArguments(call.arguments)
      })),
    usage
  }
}

function geminiContents(
  messages: AgentConversationMessage[]
): JsonRecord[] {
  const contents: JsonRecord[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      const part = {
        functionResponse: {
          name: message.toolName ?? 'tool',
          response: toolPayload(message.content)
        }
      }
      const last = contents.at(-1)
      const lastParts = Array.isArray(last?.parts)
        ? (last.parts as JsonRecord[])
        : null
      if (
        last?.role === 'user' &&
        lastParts?.some((entry) => entry.functionResponse)
      ) {
        lastParts.push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
      continue
    }

    if (message.role === 'assistant') {
      const parts: JsonRecord[] = []
      if (message.content.trim()) parts.push({ text: message.content })
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: {
            name: call.name,
            args: call.arguments
          }
        })
      }
      if (parts.length) contents.push({ role: 'model', parts })
      continue
    }

    const images = message.referenceImages ?? []
    const parts: JsonRecord[] = [
      {
        text:
          userMessageText(message) ||
          'Inspect the attached reference images.'
      }
    ]
    for (const image of images) {
      const imageData = imageParts(image)
      if (!imageData) continue
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64
        }
      })
    }
    contents.push({ role: 'user', parts })
  }
  return contents
}

async function runGeminiAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
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
  const model = request.model.replace(/^models\//, '')
  const effort = normalizeEffort('google', model, request.effort)
  const effortSupport = getEffortSupport('google', model)
  const thinkingConfig =
    effort && effortSupport.transport === 'gemini-level'
      ? { thinkingLevel: effort }
      : effort && effortSupport.transport === 'gemini-budget'
        ? { thinkingBudget: geminiThinkingBudget(model, effort) }
        : null
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`

  let response: Response
  try {
    response = await fetchProvider(
      endpoint,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': request.apiKey,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents: geminiContents(request.messages),
          ...(request.tools.length
            ? {
                tools: [
                  {
                    functionDeclarations: request.tools.map((tool) => ({
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.inputSchema
                    }))
                  }
                ],
                toolConfig: {
                  functionCallingConfig: { mode: 'AUTO' }
                }
              }
            : {}),
          generationConfig: {
            maxOutputTokens: outputTokenLimit(request.purpose),
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        })
      },
      request.signal,
      request.onProviderEvent
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError(
      'Gemini could not be reached. Check your connection.'
    )
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  let text = ''
  const toolCalls: AgentToolCall[] = []
  await consumeSse(
    response,
    (data) => {
      const event = asRecord(JSON.parse(data))
      const feedback = asRecord(event.promptFeedback)
      if (typeof feedback.blockReason === 'string') {
        throw new ProviderRequestError(
          `Gemini blocked the request: ${feedback.blockReason}.`
        )
      }

      const candidate = asRecord(asArray(event.candidates)[0])
      const content = asRecord(candidate.content)
      for (const rawPart of asArray(content.parts)) {
        const part = asRecord(rawPart)
        const functionCall = asRecord(part.functionCall)
        if (typeof functionCall.name === 'string') {
          toolCalls.push({
            id:
              typeof functionCall.id === 'string'
                ? functionCall.id
                : `gemini-${randomUUID()}`,
            name: functionCall.name,
            arguments: asRecord(functionCall.args)
          })
          continue
        }
        if (part.thought !== true && typeof part.text === 'string') {
          text += part.text
          request.onDelta(part.text)
        }
      }

      const payloadUsage = asRecord(event.usageMetadata)
      usage.inputTokens =
        toNumber(payloadUsage.promptTokenCount) ?? usage.inputTokens
      usage.outputTokens =
        toNumber(payloadUsage.candidatesTokenCount) ?? usage.outputTokens
    },
    request.signal
  )

  return { text, toolCalls, usage }
}

function deepSeekMessages(
  system: string,
  messages: AgentConversationMessage[]
): JsonRecord[] {
  const converted: JsonRecord[] = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'tool') {
      converted.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content
      })
      continue
    }
    if (message.role === 'assistant') {
      converted.push({
        role: 'assistant',
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments)
                }
              }))
            }
          : {})
      })
      continue
    }

    const images = message.referenceImages ?? []
    converted.push({
      role: 'user',
      content: images.length
        ? [
            {
              type: 'text',
              text:
                userMessageText(message) ||
                'Inspect the attached reference images.'
            },
            ...images.flatMap((image) =>
              imageParts(image)
                ? [
                    {
                      type: 'image_url',
                      image_url: { url: image.dataUrl }
                    }
                  ]
                : []
            )
          ]
        : message.content
    })
  }
  return converted
}

async function runDeepSeekAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
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
  const effort = normalizeEffort('deepseek', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model: request.model,
          messages: deepSeekMessages(system, request.messages),
          stream: true,
          ...(request.tools.length
            ? {
                tools: request.tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema
                  }
                })),
                tool_choice: 'auto'
              }
            : {}),
          ...(effort
            ? {
                reasoning_effort: effort,
                thinking: { type: 'enabled' }
              }
            : {}),
          ...(request.purpose === 'targeted-edit'
            ? { max_tokens: 8_000 }
            : {})
        })
      },
      request.signal,
      request.onProviderEvent
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError(
      'DeepSeek could not be reached. Check your connection.'
    )
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  let text = ''
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >()

  await consumeSse(
    response,
    (data) => {
      if (data === '[DONE]') return
      const event = asRecord(JSON.parse(data))
      const error = asRecord(event.error)
      if (typeof error.message === 'string') {
        throw new ProviderRequestError(error.message)
      }

      const choice = asRecord(asArray(event.choices)[0])
      const delta = asRecord(choice.delta)
      if (typeof delta.content === 'string') {
        text += delta.content
        request.onDelta(delta.content)
      }
      for (const rawCall of asArray(delta.tool_calls)) {
        const toolCall = asRecord(rawCall)
        const index = toNumber(toolCall.index) ?? 0
        const fn = asRecord(toolCall.function)
        const current = calls.get(index) ?? {
          id: randomUUID(),
          name: '',
          arguments: ''
        }
        if (typeof toolCall.id === 'string') current.id = toolCall.id
        if (typeof fn.name === 'string' && fn.name) current.name = fn.name
        if (typeof fn.arguments === 'string') {
          current.arguments += fn.arguments
        }
        calls.set(index, current)
      }

      const payloadUsage = asRecord(event.usage)
      usage.inputTokens =
        toNumber(payloadUsage.prompt_tokens) ?? usage.inputTokens
      usage.outputTokens =
        toNumber(payloadUsage.completion_tokens) ?? usage.outputTokens
    },
    request.signal
  )

  return {
    text,
    toolCalls: [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: call.id,
        name: call.name || 'unknown_tool',
        arguments: parseToolArguments(call.arguments)
      })),
    usage
  }
}

export async function runAgentTurn(
  request: AgentTurnRequest
): Promise<AgentTurnResult> {
  switch (request.provider) {
    case 'openai':
      return runOpenAiAgentTurn(request)
    case 'anthropic':
      return runAnthropicAgentTurn(request)
    case 'google':
      return runGeminiAgentTurn(request)
    case 'deepseek':
      return runDeepSeekAgentTurn(request)
    default:
      throw new ProviderRequestError(
        `Unsupported provider: ${String((request as AgentTurnRequest).provider)}`
      )
  }
}

async function streamOpenAi(request: StreamRequest): Promise<TokenUsage> {
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
  const effort = normalizeEffort('openai', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: request.model,
        instructions: system,
        input: request.history,
        stream: true,
        store: false,
        ...(effort ? { reasoning: { effort } } : {}),
        ...(request.purpose === 'targeted-edit'
          ? { max_output_tokens: 8_000 }
          : {})
      })
    }, request.signal, request.onProviderEvent)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError('OpenAI could not be reached. Check your connection.')
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  await consumeSse(
    response,
    (data) => {
      if (data === '[DONE]') return
      const event = asRecord(JSON.parse(data))
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        request.onDelta(event.delta)
        return
      }
      if (event.type === 'response.completed') {
        const responsePayload = asRecord(event.response)
        const responseUsage = asRecord(responsePayload.usage)
        usage.inputTokens = toNumber(responseUsage.input_tokens)
        usage.outputTokens = toNumber(responseUsage.output_tokens)
        return
      }
      if (event.type === 'response.failed' || event.type === 'error') {
        const failure = asRecord(event.response)
        const nested = asRecord(failure.error)
        throw new ProviderRequestError(
          typeof nested.message === 'string'
            ? nested.message
            : 'OpenAI stopped before the design was complete.'
        )
      }
    },
    request.signal
  )

  return usage
}

async function streamAnthropic(request: StreamRequest): Promise<TokenUsage> {
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
  const effort = normalizeEffort('anthropic', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'anthropic-version': '2026-10-21',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: outputTokenLimit(request.purpose),
        system,
        messages: request.history,
        stream: true,
        ...(effort ? { output_config: { effort } } : {})
      })
    }, request.signal, request.onProviderEvent)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError('Claude could not be reached. Check your connection.')
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  await consumeSse(
    response,
    (data) => {
      const event = asRecord(JSON.parse(data))
      if (event.type === 'message_start') {
        const message = asRecord(event.message)
        const payloadUsage = asRecord(message.usage)
        usage.inputTokens = toNumber(payloadUsage.input_tokens)
        return
      }
      if (event.type === 'content_block_delta') {
        const delta = asRecord(event.delta)
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          request.onDelta(delta.text)
        }
        return
      }
      if (event.type === 'message_delta') {
        const payloadUsage = asRecord(event.usage)
        usage.outputTokens = toNumber(payloadUsage.output_tokens)
        return
      }
      if (event.type === 'error') {
        const nested = asRecord(event.error)
        throw new ProviderRequestError(
          typeof nested.message === 'string'
            ? nested.message
            : 'Claude stopped before the design was complete.'
        )
      }
    },
    request.signal
  )

  return usage
}

async function streamGemini(request: StreamRequest): Promise<TokenUsage> {
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

  const model = request.model.replace(/^models\//, '')
  const effort = normalizeEffort('google', model, request.effort)
  const effortSupport = getEffortSupport('google', model)
  const thinkingConfig =
    effort && effortSupport.transport === 'gemini-level'
      ? { thinkingLevel: effort }
      : effort && effortSupport.transport === 'gemini-budget'
        ? { thinkingBudget: geminiThinkingBudget(model, effort) }
        : null
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`

  let response: Response
  try {
    response = await fetchProvider(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': request.apiKey,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }]
        },
        contents: request.history.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })),
        generationConfig: {
          maxOutputTokens: outputTokenLimit(request.purpose),
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      })
    }, request.signal, request.onProviderEvent)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError('Gemini could not be reached. Check your connection.')
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  await consumeSse(
    response,
    (data) => {
      const event = asRecord(JSON.parse(data))
      const feedback = asRecord(event.promptFeedback)
      if (typeof feedback.blockReason === 'string') {
        throw new ProviderRequestError(`Gemini blocked the request: ${feedback.blockReason}.`)
      }

      const candidate = asRecord(asArray(event.candidates)[0])
      const content = asRecord(candidate.content)
      for (const rawPart of asArray(content.parts)) {
        const part = asRecord(rawPart)
        if (part.thought !== true && typeof part.text === 'string') {
          request.onDelta(part.text)
        }
      }

      const payloadUsage = asRecord(event.usageMetadata)
      usage.inputTokens = toNumber(payloadUsage.promptTokenCount) ?? usage.inputTokens
      usage.outputTokens =
        toNumber(payloadUsage.candidatesTokenCount) ?? usage.outputTokens
    },
    request.signal
  )

  return usage
}

async function streamDeepSeek(request: StreamRequest): Promise<TokenUsage> {
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
  const effort = normalizeEffort('deepseek', request.model, request.effort)

  let response: Response
  try {
    response = await fetchProvider('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: 'system', content: system }, ...request.history],
        stream: true,
        ...(effort
          ? {
              reasoning_effort: effort,
              thinking: { type: 'enabled' }
            }
          : {}),
        ...(request.purpose === 'targeted-edit'
          ? { max_tokens: 8_000 }
          : {})
      })
    }, request.signal, request.onProviderEvent)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ProviderRequestError('DeepSeek could not be reached. Check your connection.')
  }

  if (!response.ok) throw await providerError(response)

  const usage: TokenUsage = {}
  await consumeSse(
    response,
    (data) => {
      if (data === '[DONE]') return
      const event = asRecord(JSON.parse(data))
      const error = asRecord(event.error)
      if (typeof error.message === 'string') {
        throw new ProviderRequestError(error.message)
      }

      const choice = asRecord(asArray(event.choices)[0])
      const delta = asRecord(choice.delta)
      if (typeof delta.content === 'string') request.onDelta(delta.content)

      const payloadUsage = asRecord(event.usage)
      usage.inputTokens = toNumber(payloadUsage.prompt_tokens) ?? usage.inputTokens
      usage.outputTokens =
        toNumber(payloadUsage.completion_tokens) ?? usage.outputTokens
    },
    request.signal
  )

  return usage
}

export async function streamAgent(request: StreamRequest): Promise<TokenUsage> {
  switch (request.provider) {
    case 'openai':
      return streamOpenAi(request)
    case 'anthropic':
      return streamAnthropic(request)
    case 'google':
      return streamGemini(request)
    case 'deepseek':
      return streamDeepSeek(request)
    default:
      throw new ProviderRequestError(
        `Unsupported provider: ${String((request as StreamRequest).provider)}`
      )
  }
}

export function providerLabel(provider: ProviderId): string {
  return PROVIDER_DEFINITIONS[provider]?.name ?? 'Provider'
}
