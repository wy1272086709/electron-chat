import { request, type ElectronResponse } from './request'
import type {
  ChatReplySuggestionsResult,
  ChatSummaryResult,
  GenerateChatSummaryParams,
  GenerateReplySuggestionsParams
} from '../types/chat-ai.types'

const DEFAULT_MESSAGE_LIMIT = 100

/** 房间级 AI 能力。后端校验房间权限并读取消息，客户端不传完整聊天记录。 */
export const chatAiService = {
  async summarize(
    roomId: string,
    params: GenerateChatSummaryParams = {}
  ): Promise<ElectronResponse<ChatSummaryResult>> {
    return request.post<ChatSummaryResult>(`/chat/rooms/${roomId}/ai/summary`, {
      messageLimit: params.messageLimit ?? DEFAULT_MESSAGE_LIMIT
    })
  },

  async suggestReplies(
    roomId: string,
    params: GenerateReplySuggestionsParams = {}
  ): Promise<ElectronResponse<ChatReplySuggestionsResult>> {
    return request.post<ChatReplySuggestionsResult>(`/chat/rooms/${roomId}/ai/reply-suggestions`, {
      messageLimit: params.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
      ...(params.draft?.trim() ? { draft: params.draft.trim() } : {})
    })
  }
}

export default chatAiService
