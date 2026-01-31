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
