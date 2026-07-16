import React, { useState } from 'react'
import {
  CloseOutlined,
  CopyOutlined,
  FormOutlined,
  ReloadOutlined,
  RobotOutlined
} from '@ant-design/icons'
import { chatAiService } from '@renderer/services/chat-ai.service'
import type {
  ChatAiMode,
  ChatReplySuggestionsResult,
  ChatSummaryResult
} from '@renderer/types/chat-ai.types'

interface ChatAiPanelProps {
  roomId: string
  draft: string
  mode: ChatAiMode
  onModeChange: (mode: ChatAiMode) => void
  onUseSuggestion: (suggestion: string) => void
  onClose: () => void
  onFeedback: (text: string) => void
}

const ChatAiPanel: React.FC<ChatAiPanelProps> = ({
  roomId,
  draft,
  mode,
  onModeChange,
  onUseSuggestion,
  onClose,
  onFeedback
}) => {
  const [summary, setSummary] = useState<ChatSummaryResult | null>(null)
  const [replies, setReplies] = useState<ChatReplySuggestionsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      if (mode === 'summary') {
        const response = await chatAiService.summarize(roomId)
        if (!response.result || !response.data) {
          setError(response.message || '生成聊天总结失败')
          return
        }
        setSummary(response.data)
      } else {
        const response = await chatAiService.suggestReplies(roomId, { draft })
        if (!response.result || !response.data) {
          setError(response.message || '生成回复建议失败')
          return
        }
        setReplies(response.data)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'AI 服务暂时不可用')
    } finally {
      setLoading(false)
    }
  }

  const currentResult = mode === 'summary' ? summary : replies

  const changeMode = (nextMode: ChatAiMode): void => {
    setError(null)
    onModeChange(nextMode)
  }

  const copySummary = async (): Promise<void> => {
    if (!summary) return
    const sections = [summary.summary]
    if (summary.keyPoints.length > 0) {
      sections.push(`要点\n${summary.keyPoints.map((item) => `- ${item}`).join('\n')}`)
    }
    if (summary.actionItems.length > 0) {
      sections.push(`待办\n${summary.actionItems.map((item) => `- ${item}`).join('\n')}`)
    }
    try {
      await navigator.clipboard.writeText(sections.join('\n\n'))
      onFeedback('总结已复制')
    } catch {
      onFeedback('复制失败')
    }
  }

  return (
    <section className="chat-ai-panel" aria-label="AI 聊天助手">
      <header className="chat-ai-header">
        <div className="chat-ai-title">
          <RobotOutlined />
          <span>AI 助手</span>
        </div>
        <button type="button" className="chat-ai-icon-button" title="关闭" onClick={onClose}>
          <CloseOutlined />
        </button>
      </header>

      <div className="chat-ai-tabs" role="tablist" aria-label="AI 功能">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'summary'}
          className={mode === 'summary' ? 'active' : ''}
          onClick={() => changeMode('summary')}
        >
          聊天总结
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'reply-suggestions'}
          className={mode === 'reply-suggestions' ? 'active' : ''}
          onClick={() => changeMode('reply-suggestions')}
        >
          回复建议
        </button>
      </div>

      <div className="chat-ai-content" aria-live="polite">
        {loading && (
          <div className="chat-ai-state">
            <span className="chat-ai-spinner" />
            <span>{mode === 'summary' ? '正在梳理聊天记录...' : '正在生成回复建议...'}</span>
          </div>
        )}

        {!loading && error && (
          <div className="chat-ai-state is-error">
            <span>{error}</span>
            <button type="button" onClick={() => void generate()}>
              <ReloadOutlined /> 重试
            </button>
          </div>
        )}

        {!loading && !error && !currentResult && (
          <div className="chat-ai-state is-empty">
            <span>
              {mode === 'summary'
                ? '整理最近聊天内容，提取关键要点和待办事项'
                : '根据最近对话生成几条可编辑的回复'}
            </span>
            <button type="button" onClick={() => void generate()}>
              {mode === 'summary' ? '生成总结' : '生成回复建议'}
            </button>
          </div>
        )}

        {!loading && !error && mode === 'summary' && summary && (
          <div className="chat-ai-summary">
            <p>{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <div>
                <h4>关键要点</h4>
                <ul>
                  {summary.keyPoints.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.actionItems.length > 0 && (
              <div>
                <h4>待办事项</h4>
                <ul>
                  {summary.actionItems.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!loading && !error && mode === 'reply-suggestions' && replies && (
          <div className="chat-ai-suggestions">
            {replies.suggestions.length > 0 ? (
              replies.suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  className="chat-ai-suggestion"
                  key={`${index}-${suggestion}`}
                  onClick={() => onUseSuggestion(suggestion)}
                >
                  <span>{suggestion}</span>
                  <FormOutlined title="填入输入框" />
                </button>
              ))
            ) : (
              <div className="chat-ai-state">暂时没有合适的回复建议</div>
            )}
          </div>
        )}
      </div>

      {!loading && !error && currentResult && (
        <footer className="chat-ai-footer">
          <span>参考最近 {currentResult.messageCount} 条消息</span>
          <div>
            {mode === 'summary' && (
              <button type="button" title="复制总结" onClick={() => void copySummary()}>
                <CopyOutlined /> 复制
              </button>
            )}
            <button type="button" title="重新生成" onClick={() => void generate()}>
              <ReloadOutlined /> 重新生成
            </button>
          </div>
        </footer>
      )}
    </section>
  )
}

export default ChatAiPanel
