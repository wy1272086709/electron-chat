import React, { useEffect, useState } from 'react'
import type { LayoutMessage } from '@renderer/types/layout.types'
import { resolveMediaUrl } from '@renderer/utils/media-url'
import {
  formatFileSize,
  getFileBadge,
  getFileExt,
  getFileTone,
  isImageFile
} from '@renderer/utils/file-meta'

interface MessageMediaProps {
  message: LayoutMessage
  /** 点击图片放大查看 */
  onPreviewImage?: (src: string) => void
}

const downloadedFilePaths = new Map<string, string>()

/**
 * 消息气泡内的媒体渲染：IMAGE → 图片（点击放大）；FILE → 文件卡片（点击下载）。
 *
 * - 上传中的「我」的图片：用 attachment.localPreviewUrl（blob:）即时预览，叠 uploading 蒙层。
 * - 其它：用 attachment.objectName 经 /minio/previewUrl 解析出预签名 GET 展示。
 */
const MessageMedia: React.FC<MessageMediaProps> = ({ message, onPreviewImage }) => {
  const attachment = message.attachment
  const [resolvedImage, setResolvedImage] = useState({ key: '', url: '', attempted: false })
  const [downloading, setDownloading] = useState(false)
  const downloadKey = attachment?.objectName || message.id
  const [downloadedPath, setDownloadedPath] = useState(downloadedFilePaths.get(downloadKey) || '')
  const [fileActionMessage, setFileActionMessage] = useState(downloadedPath ? '已保存到本地' : '')
  const [showFilePreview, setShowFilePreview] = useState(false)
  const remoteImageKey = attachment?.localPreviewUrl ? '' : attachment?.objectName || ''
  const resolvedSrc = resolvedImage.key === remoteImageKey ? resolvedImage.url : ''
  const resolveAttempted =
    !remoteImageKey || (resolvedImage.key === remoteImageKey && resolvedImage.attempted)
  const src = attachment?.localPreviewUrl || resolvedSrc

  useEffect(() => {
    let active = true
    if (attachment?.localPreviewUrl) return undefined
    if (!remoteImageKey) return undefined
    void resolveMediaUrl(remoteImageKey).then((url) => {
      if (active) {
        setResolvedImage({ key: remoteImageKey, url, attempted: true })
      }
    })
    return () => {
      active = false
    }
  }, [attachment?.localPreviewUrl, remoteImageKey])

  if (!attachment) return null

  const ext = getFileExt(attachment.fileName, attachment.fileType)
  const tone = getFileTone(ext)
  const isUploading = message.status === 'uploading'
  const shouldRenderImage =
    attachment.messageType === 'IMAGE' ||
    message.messageType === 'IMAGE' ||
    isImageFile(attachment.fileName, attachment.fileType)

  const handleReceiveFile = async (): Promise<void> => {
    if (downloadedPath) {
      const res = await window.electronAPI.openLocalFile({ path: downloadedPath })
      if (!res.result) {
        setFileActionMessage(res.message || '打开文件失败')
        console.warn('[MessageMedia] 打开文件失败:', res.message)
      } else {
        setFileActionMessage('已打开文件')
      }
      return
    }

    if (!attachment.objectName || downloading) return
    setDownloading(true)
    setFileActionMessage('')
    try {
      const previewUrl = await resolveMediaUrl(attachment.objectName)
      if (!previewUrl) {
        setFileActionMessage('文件地址获取失败')
        return
      }
      const res = await window.electronAPI.downloadFile({
        previewUrl,
        fileName: attachment.fileName
      })
      if (!res.result) {
        setFileActionMessage(res.message || '接收文件失败')
        console.warn('[MessageMedia] 下载失败:', res.message)
        return
      }
      const localPath = res.data?.path || ''
      if (localPath) {
        downloadedFilePaths.set(downloadKey, localPath)
        setDownloadedPath(localPath)
        setFileActionMessage('已保存到本地')
      }
    } finally {
      setDownloading(false)
    }
  }

  if (shouldRenderImage) {
    return (
      <div className={`message-media is-image ${isUploading ? 'is-uploading' : ''}`}>
        {src ? (
          <img
            src={src}
            alt={attachment.fileName || '图片'}
            onClick={() => !isUploading && src && onPreviewImage?.(src)}
          />
        ) : (
          <div className="message-media-placeholder">
            {!resolveAttempted && (attachment.objectName || isUploading)
              ? '图片加载中...'
              : '图片暂不可预览'}
          </div>
        )}
        {isUploading && <span className="message-media-spinner" aria-label="上传中" />}
      </div>
    )
  }

  // FILE
  return (
    <>
      <div
        className={`message-media is-file ${downloading ? 'is-busy' : ''} ${
          isUploading ? 'is-uploading' : ''
        }`}
        onClick={() => {
          if (!isUploading) setShowFilePreview(true)
        }}
        role="button"
        title={isUploading ? '上传中…' : '点击预览'}
      >
        <div className={`message-media-file-icon tone-${tone}`}>
          <span>{getFileBadge(ext)}</span>
        </div>
        <div className="message-media-file-info">
          <div className="message-media-file-name">{attachment.fileName || '未命名文件'}</div>
          <div className="message-media-file-meta">
            {[ext, formatFileSize(attachment.fileSize)].filter(Boolean).join(' · ')}
            {isUploading ? ' · 上传中' : ''}
          </div>
        </div>
        <div className="message-media-file-action">
          {downloading ? (
            <span className="message-media-spinner small" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M9 18h6M10 2h5l5 5v15H4V2h6z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          )}
        </div>
      </div>

      {showFilePreview && (
        <div className="message-file-preview-overlay" onClick={() => setShowFilePreview(false)}>
          <section className="message-file-preview" onClick={(e) => e.stopPropagation()}>
            <header className="message-file-preview-header">
              <button type="button" onClick={() => setShowFilePreview(false)}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <h3>文件预览</h3>
              <span />
            </header>
            <div className="message-file-preview-body">
              <div className={`message-file-preview-icon tone-${tone}`}>
                <span>{ext || 'FILE'}</span>
              </div>
              <h4>{attachment.fileName || '未命名文件'}</h4>
              <p>文件大小: {formatFileSize(attachment.fileSize) || '未知'}</p>
              <button
                type="button"
                className="message-file-preview-download"
                disabled={!attachment.objectName || downloading}
                onClick={() => void handleReceiveFile()}
              >
                {downloading ? '接收中…' : downloadedPath ? '打开文件' : '接收文件'}
              </button>
              {fileActionMessage && (
                <p className="message-file-preview-action-tip">{fileActionMessage}</p>
              )}
            </div>
          </section>
          <style>{`
            .message-file-preview-overlay {
              position: fixed;
              inset: 0;
              z-index: 1200;
              background: rgba(10, 10, 18, 0.72);
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .message-file-preview {
              width: min(720px, calc(100vw - 48px));
              max-height: calc(100vh - 32px);
              background: #1a1b2e;
              color: #f5f7fb;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 20px 70px rgba(0, 0, 0, 0.45);
              display: flex;
              flex-direction: column;
            }

            .message-file-preview-header {
              height: 68px;
              flex: 0 0 68px;
              display: grid;
              grid-template-columns: 48px 1fr 48px;
              align-items: center;
              padding: 0 22px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .message-file-preview-header h3 {
              margin: 0;
              text-align: center;
              font-size: 22px;
              font-weight: 700;
            }

            .message-file-preview-header button {
              width: 44px;
              height: 44px;
              border: 0;
              background: transparent;
              color: #f5f7fb;
              cursor: pointer;
            }

            .message-file-preview-header svg {
              width: 28px;
              height: 28px;
            }

            .message-file-preview-body {
              min-height: 0;
              flex: 1 1 auto;
              padding: 32px 48px 34px;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              overflow-y: auto;
            }

            .message-file-preview-icon {
              width: 168px;
              height: 208px;
              flex: 0 0 auto;
              border-radius: 18px;
              background: #e6484f;
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              overflow: hidden;
              font-size: 44px;
              font-weight: 800;
            }

            .message-file-preview-icon::after {
              content: '';
              position: absolute;
              top: 0;
              right: 0;
              width: 64px;
              height: 64px;
              background: rgba(90, 20, 24, 0.28);
              clip-path: polygon(0 0, 100% 100%, 100% 0);
            }

            .message-file-preview-icon.tone-ppt {
              background: #f15c3f;
            }

            .message-file-preview-icon.tone-word {
              background: #2f5a9f;
            }

            .message-file-preview-icon.tone-zip {
              background: #925d2c;
            }

            .message-file-preview-body h4 {
              max-width: 620px;
              margin: 24px 0 0;
              color: #f5f7fb;
              font-size: 24px;
              line-height: 1.35;
              overflow-wrap: anywhere;
            }

            .message-file-preview-body p {
              margin: 10px 0 0;
              color: #a6adb8;
              font-size: 18px;
            }

            .message-file-preview-download {
              width: min(100%, 640px);
              min-height: 58px;
              flex: 0 0 auto;
              margin-top: 30px;
              border: 0;
              border-radius: 8px;
              background: #10c469;
              color: white;
              font-size: 22px;
              font-weight: 700;
              cursor: pointer;
            }

            .message-file-preview-download:disabled {
              background: #b8c0cc;
              cursor: not-allowed;
            }

            .message-file-preview-action-tip {
              min-height: 22px;
              margin: 12px 0 0;
              color: #a6adb8;
              font-size: 15px;
            }

            @media (max-width: 768px) {
              .message-file-preview {
                width: 100vw;
                height: 100vh;
                max-height: 100vh;
                border-radius: 0;
              }

              .message-file-preview-header {
                height: 60px;
                flex-basis: 60px;
              }

              .message-file-preview-body {
                min-height: 0;
                padding: 24px 24px 28px;
              }

              .message-file-preview-icon {
                width: 132px;
                height: 164px;
                font-size: 34px;
              }

              .message-file-preview-body h4 {
                margin-top: 20px;
                font-size: 20px;
              }

              .message-file-preview-body p {
                font-size: 16px;
              }

              .message-file-preview-download {
                min-height: 54px;
                margin-top: 24px;
                font-size: 20px;
              }

              .message-file-preview-action-tip {
                font-size: 14px;
              }
            }
          `}</style>
        </div>
      )}
    </>
  )
}

export default MessageMedia
