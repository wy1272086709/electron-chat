import React, { useState } from 'react'

interface FilePickerProps {
  onSelect: (filePath: string) => void
  onClose: () => void
}

const FilePicker: React.FC<FilePickerProps> = ({ onSelect, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)

  // 打开文件选择对话框
  const openFileDialog = async () => {
    console.log('FilePicker: 打开文件选择对话框')
    try {
      // @ts-ignore
      const result = await window.electronAPI.openFile()
      console.log('FilePicker: 文件选择结果:', result)
      if (result && result.length > 0) {
        onSelect(result[0])
        onClose()
      }
    } catch (error) {
      console.error('FilePicker: 文件选择失败:', error)
    }
  }

  const handleClose = () => {
    setIsVisible(false)
    onClose()
  }

  if (!isVisible) return null

  return (
    <div className="file-picker-overlay" onClick={handleClose}>
      <div className="file-picker" onClick={(e) => e.stopPropagation()}>
        <div className="file-picker-header">
          <div className="file-picker-title">选择文件</div>
          <button className="file-picker-close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="file-picker-content">
          <div className="file-list">
            <div className="loading">
              <button className="file-button" onClick={openFileDialog}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
                <div>点击选择文件</div>
                <div className="file-subtitle">支持所有文件类型</div>
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .file-picker-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .file-picker {
          background-color: #2a2a2a;
          border-radius: 12px;
          padding: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .file-picker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .file-picker-title {
          color: #fff;
          font-size: 16px;
          font-weight: 500;
          margin: 0;
        }

        .file-picker-close {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          padding: 4px;
          transition: color 0.2s;
        }

        .file-picker-close:hover {
          color: #fff;
        }

        .file-picker-content {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .file-list {
          flex: 1;
          overflow-y: auto;
        }

        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100px;
        }

        .file-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 24px;
          background: none;
          border: 2px dashed #4a4a4a;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }

        .file-button:hover {
          background-color: #3a3a3a;
          border-color: #666;
        }

        .file-button svg {
          color: #666;
        }

        .file-button div:first-child {
          font-size: 16px;
          font-weight: 500;
        }

        .file-subtitle {
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  )
}

export default FilePicker
