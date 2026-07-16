export type ChatAiMode = 'summary' | 'reply-suggestions'

export interface ChatAiUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface ChatSummaryResult {
  summary: string
  keyPoints: string[]
  actionItems: string[]
  messageCount: number
  generatedAt: string
  usage?: ChatAiUsage
}

export interface ChatReplySuggestionsResult {
  suggestions: string[]
  messageCount: number
  generatedAt: string
  usage?: ChatAiUsage
}

export interface GenerateChatSummaryParams {
  messageLimit?: number
}

export interface GenerateReplySuggestionsParams {
  messageLimit?: number
  draft?: string
}
