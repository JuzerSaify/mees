import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AgentStreamEvent,
  type AppProject,
  type AppSnapshot,
  type DesignMode,
  type ExportResult,
  type KernApi,
  type PreferencesUpdate,
  type ProviderId,
  type StartAgentRequest
} from '../shared/types'

const api: KernApi = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState) as Promise<AppSnapshot>,
  connectProvider: (provider: ProviderId, apiKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.connectProvider, provider, apiKey) as Promise<AppSnapshot>,
  disconnectProvider: (provider: ProviderId) =>
    ipcRenderer.invoke(IPC_CHANNELS.disconnectProvider, provider) as Promise<AppSnapshot>,
  refreshModels: (provider: ProviderId) =>
    ipcRenderer.invoke(IPC_CHANNELS.refreshModels, provider) as Promise<AppSnapshot>,
  selectModel: (provider: ProviderId, model: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectModel, provider, model) as Promise<AppSnapshot>,
  savePreferences: (update: PreferencesUpdate) =>
    ipcRenderer.invoke(IPC_CHANNELS.savePreferences, update) as Promise<AppSnapshot>,
  saveProject: (project: AppProject) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProject, project) as Promise<AppProject>,
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteProject, projectId) as Promise<void>,
  startAgent: (request: StartAgentRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.startAgent, request) as Promise<{ requestId: string }>,
  cancelAgent: (requestId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelAgent, requestId) as Promise<void>,
  onAgentEvent: (listener: (event: AgentStreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentStreamEvent): void => {
      listener(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.agentEvent, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler)
  },
  exportHtml: (html: string, title: string, designMode: DesignMode) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.exportHtml,
      html,
      title,
      designMode
    ) as Promise<ExportResult>,
  exportMotion: (html: string, title: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportMotion, html, title) as Promise<ExportResult>,
  openPreview: (html: string, title: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPreview, html, title) as Promise<void>,
  openDataFolder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openDataFolder) as Promise<void>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternal, url) as Promise<void>
}

contextBridge.exposeInMainWorld('kern', api)
