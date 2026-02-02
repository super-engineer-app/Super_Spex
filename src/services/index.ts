export {
  sendToBackend,
  sendText,
  sendImage,
  sendTextAndImage,
  getSessionUserId,
  getConversationId,
  setConversationId,
  resetSession,
} from './backendApi';

export type { SendToBackendOptions, BackendResponse } from './backendApi';

export {
  initializeErrorReporting,
  reportError,
  sendErrorToDiscord,
  handleNativeError,
} from './errorReporting';

export type { ErrorSeverity } from './errorReporting';
