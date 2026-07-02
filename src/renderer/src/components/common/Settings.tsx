import React, { useState } from 'react'

interface SettingsProps {
  // Props if needed
}

const Settings: React.FC<SettingsProps> = () => {
  const [settings, setSettings] = useState({
    notifications: {
      messageSound: true,
      desktopNotification: true,
      messagePreview: true
    },
    privacy: {
      onlineStatus: true,
      readReceipts: true,
      lastSeen: false
    },
    appearance: {
      darkMode: true,
      messageBubbles: true,
      compactMode: false
    },
    storage: {
      autoDownload: true,
      cacheSize: 100, // MB
      clearCache: false
    }
  } as const)

  const handleToggle = (sectionKey: string, key: string) => {
    setSettings((prev) => {
      const section = prev[sectionKey as keyof typeof settings] as any
      return {
        ...prev,
        [sectionKey]: {
          ...section,
          [key]: !section[key]
        }
      }
    })
  }

  const handleInputChange = (section: string, key: string, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [key]: value
      }
    }))
  }

  const handleClearCache = () => {
    // In a real app, this would clear actual cache
    console.log('Clearing cache...')
    alert('缓存已清理')
  }

  const handleExportData = () => {
    // In a real app, this would export data
    console.log('Exporting data...')
    alert('数据导出功能开发中...')
  }

  const handleDeleteAccount = () => {
    if (confirm('确定要删除账户吗？此操作不可恢复。')) {
      // In a real app, this would delete the account
      console.log('Deleting account...')
      alert('账户删除功能开发中...')
    }
  }

  const settingsSections = [
    {
      title: '通知设置',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      ),
      items: [
        {
          key: 'messageSound',
          label: '消息提示音',
          type: 'toggle'
        },
        {
          key: 'desktopNotification',
          label: '桌面通知',
          type: 'toggle'
        },
        {
          key: 'messagePreview',
          label: '消息预览',
          type: 'toggle'
        }
      ]
    },
    {
      title: '隐私设置',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
        </svg>
      ),
      items: [
        {
          key: 'onlineStatus',
          label: '显示在线状态',
          type: 'toggle'
        },
        {
          key: 'readReceipts',
          label: '已读回执',
          type: 'toggle'
        },
        {
          key: 'lastSeen',
          label: '显示最后在线时间',
          type: 'toggle'
        }
      ]
    },
    {
      title: '外观设置',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
          <path d="M12 22.96c0 .55-.45 1-1 1H9c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zM4 13.04c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zm18 0c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zM4 7.04c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zm18 0c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1zm-7-6c0 .55-.45 1-1 1H8c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1z" />
        </svg>
      ),
      items: [
        {
          key: 'darkMode',
          label: '深色模式',
          type: 'toggle'
        },
        {
          key: 'messageBubbles',
          label: '消息气泡',
          type: 'toggle'
        },
        {
          key: 'compactMode',
          label: '紧凑模式',
          type: 'toggle'
        }
      ]
    },
    {
      title: '存储管理',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
        </svg>
      ),
      items: [
        {
          key: 'autoDownload',
          label: '自动下载文件',
          type: 'toggle'
        },
        {
          key: 'cacheSize',
          label: '缓存大小',
          type: 'slider',
          min: 10,
          max: 500,
          step: 10,
          value: settings.storage.cacheSize,
          onChange: (value: number) => handleInputChange('storage', 'cacheSize', value)
        },
        {
          key: 'clearCache',
          label: '清理缓存',
          type: 'button',
          action: handleClearCache
        }
      ]
    },
    {
      title: '账号管理',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ),
      items: [
        {
          key: 'exportData',
          label: '导出数据',
          type: 'button',
          action: handleExportData
        },
        {
          key: 'deleteAccount',
          label: '删除账户',
          type: 'button',
          action: handleDeleteAccount,
          danger: true
        }
      ]
    }
  ]

  return (
    <div className="settings-panel">
      {/* Header */}
      <div className="panel-header">
        <h2>设置</h2>
      </div>

      {/* Settings List */}
      <div className="settings-list">
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="settings-section">
            <h3 className="settings-title">
              {section.icon}
              <span>{section.title}</span>
            </h3>
            <div className="setting-groups">
              <div className="setting-group">
                {section.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className={`setting-item ${item.danger ? 'danger' : ''}`}
                    onClick={() => {
                      if (item.type === 'button' && item.action) {
                        item.action()
                      } else if (item.type === 'toggle') {
                        handleToggle(section.title.toLowerCase(), item.key)
                      }
                    }}
                  >
                    <div className="setting-label">{item.label}</div>
                    {item.type === 'toggle' ? (
                      <div
                        className={`setting-toggle ${settings?.[section?.title.toLowerCase()?.replace('设置', '') as keyof typeof settings]?.[item?.key] ? 'active' : ''}`}
                      >
                        <div className="setting-toggle-handle" />
                      </div>
                    ) : item.type === 'slider' ? (
                      <div className="setting-slider">
                        <input
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={item.value}
                          onChange={(e) => item.onChange?.(parseInt(e.target.value))}
                          style={{
                            width: '150px',
                            height: '4px',
                            background: '#444',
                            borderRadius: '2px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ marginLeft: '8px', fontSize: '14px', color: '#666' }}>
                          {item.value} MB
                        </span>
                      </div>
                    ) : (
                      <div className="setting-button">
                        <span style={{ fontSize: '14px', color: item.danger ? '#ef4444' : '#666' }}>
                          {item.danger ? '删除' : '管理'}
                        </span>
                        {item.danger && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            style={{ marginLeft: '4px' }}
                          >
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="settings-footer">
        <p>版本 1.0.0</p>
      </div>

      <style>{`
        .settings-title {
          font-size: 18px;
          font-weight: 600;
          color: white;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .settings-title svg {
          width: 20px;
          height: 20px;
          fill: #6366f1;
        }

        .setting-group {
          background-color: #2a2b3a;
          border-radius: 12px;
          padding: 20px;
        }

        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          cursor: pointer;
          transition: all 0.3s ease;
          border-bottom: 1px solid #33333c;
        }

        .setting-item:last-child {
          border-bottom: none;
        }

        .setting-item:hover {
          color: var(--gradient-purple-start);
        }

        .setting-item.danger:hover {
          color: #ef4444;
        }

        .setting-label {
          font-size: 15px;
          color: white;
        }

        .setting-slider {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        input[type="range"]::-webkit-slider-thumb {
          width: 16px;
          height: 16px;
          background: var(--gradient-purple-start);
          border-radius: 50%;
          cursor: pointer;
          -webkit-appearance: none;
        }

        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: var(--gradient-purple-start);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .setting-button {
          display: flex;
          align-items: center;
          color: #666;
        }

        .settings-footer {
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 14px;
          border-top: 1px solid #33333c;
        }
      `}</style>
    </div>
  )
}

export default Settings
