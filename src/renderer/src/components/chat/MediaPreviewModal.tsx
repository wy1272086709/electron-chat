import React, { useEffect, useState } from 'react'

interface MediaPreviewModalProps {
  /** send：发送前预览（带备注 + 发送）；view：放大查看已收/发的图片 */
  mode: 'send' | 'view'
  /** send 模式：被预览的文件 */
  file?: File
  /** view 模式：图片地址（预签名 GET / blob:） */
  src?: string
  fileName?: string
  onSend?: (caption: string) => void
  onClose: () => void
}

/**
 * 图片预览弹层：
 * - send 模式（微信式）：大图 + 可选备注 + 发送按钮。
 * - view 模式：放大查看，点击空白或 Esc 关闭。
 */
const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  mode,
  file,
  src,
  fileName,
  onSend,
  onClose
}) => {
  const [caption, setCaption] = useState('')
  const [filePreview, setFilePreview] = useState<{
    file?: File
    src: string
    failed: boolean
  }>({ src: '', failed: false })
  const [imageLoadState, setImageLoadState] = useState<{
    src: string
    failed: boolean
  }>({ src: '', failed: false })
  const previewSrc =
    mode === 'send' ? (filePreview.file === file ? filePreview.src : '') : src || ''
  const previewFailed =
    (mode === 'send' && filePreview.file === file && filePreview.failed) ||
    (Boolean(previewSrc) && imageLoadState.src === previewSrc && imageLoadState.failed)

  // send 模式：用 data URL 预览，避免开发模式下 blob URL 被 effect cleanup 提前回收。
  useEffect(() => {
    if (mode !== 'send' || !file) return undefined

    let cancelled = false
    const reader = new FileReader()
    reader.onload = (): void => {
      if (cancelled) return
      const result = typeof reader.result === 'string' ? reader.result : ''
      setFilePreview({ file, src: result, failed: !result })
    }
    reader.onerror = (): void => {
      if (!cancelled) setFilePreview({ file, src: '', failed: true })
    }
    reader.readAsDataURL(file)

    return () => {
      cancelled = true
      if (reader.readyState === FileReader.LOADING) {
        reader.abort()
      }
    }
  }, [file, mode])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const isSend = mode === 'send'
  const alt = isSend ? file?.name : fileName || '图片'

  return (
    <div className="media-preview-overlay" onClick={onClose}>
      <div
        className={`media-preview ${isSend ? 'is-send' : 'is-view'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="media-preview-close" onClick={onClose} title="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>

        <div className="media-preview-image-wrap">
          {previewSrc && !previewFailed ? (
            <img
              src={previewSrc}
              alt={alt}
              onLoad={() => setImageLoadState({ src: previewSrc, failed: false })}
              onError={() => setImageLoadState({ src: previewSrc, failed: true })}
            />
          ) : previewFailed ? (
            <div className="media-preview-placeholder">图片暂不可预览</div>
          ) : (
            <div className="media-preview-placeholder">图片加载中…</div>
          )}
        </div>

        {isSend && (
          <div className="media-preview-footer">
            <input
              className="media-preview-caption"
              placeholder="给朋友说点什么（可选）"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSend?.(caption)
                }
              }}
            />
            <button
              className="media-preview-send"
              onClick={() => onSend?.(caption)}
              disabled={!previewSrc || previewFailed}
            >
              发送
            </button>
          </div>
        )}
      </div>
      <style>{`
        .media-preview-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1200;
        }

        .media-preview {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          max-width: 90vw;
          max-height: calc(90vh - 20px);
        }

        .media-preview.is-view {
          cursor: zoom-out;
        }

        .media-preview.is-send {
          background: #1f1f29;
          border-radius: 12px;
          padding: 16px;
          gap: 12px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
        }

        .media-preview-image-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 120px;
        }

        .media-preview-image-wrap img {
          display: block;
          width: auto;
          height: auto;
          object-fit: contain;
          max-width: 70vw;
          max-height: 60vh;
          border-radius: 8px;
        }

        .media-preview.is-view .media-preview-image-wrap img {
          max-width: 90vw;
          max-height: 90vh;
          border-radius: 0;
        }

        .media-preview-placeholder {
          color: #aaa;
          font-size: 14px;
        }

        .media-preview-close {
          position: absolute;
          top: -40px;
          right: 0;
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .media-preview-close:hover {
          opacity: 1;
        }

        .media-preview-footer {
          display: flex;
          gap: 8px;
          width: 100%;
          max-width: 520px;
        }

        .media-preview-caption {
          flex: 1;
          height: 36px;
          background: #2a2b3a;
          border: 1px solid #3a3b4a;
          border-radius: 18px;
          padding: 0 16px;
          color: #fff;
          font-size: 14px;
          outline: none;
        }

        .media-preview-send {
          height: 36px;
          padding: 0 20px;
          border: none;
          border-radius: 18px;
          background: linear-gradient(135deg, #7c5cff 0%, #4cd2c0 100%);
          color: #fff;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.15s;
        }

        .media-preview-send:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .media-preview-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}

export default MediaPreviewModal
