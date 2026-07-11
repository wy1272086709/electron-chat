import React from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Profile } from '@renderer/hooks/useProfile'

interface ProfileModalProps {
  onClose: () => void
  profile: Profile
  handleInputChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (e: FormEvent) => void
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  onClose,
  profile,
  handleInputChange,
  handleAvatarChange,
  handleSubmit
}) => {
  return (
    <div className="profile-modal">
      <div className="profile-modal-content">
        {/* Header */}
        <div className="profile-header">
          <h2 className="profile-title">编辑个人资料</h2>
          <button className="profile-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Avatar Section */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-large">
            <img src={profile.avatar} alt="Avatar" />
          </div>
          <div className="avatar-change-wrapper">
            <div className="avatar-change-text">点击更换头像</div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
              id="avatar-upload"
            />
            <label htmlFor="avatar-upload" className="avatar-upload-button">
              选择文件
            </label>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="profile-form">
            {/* Name */}
            <div className="form-group">
              <label className="form-label">用户名</label>
              <input
                type="text"
                className="form-input"
                name="name"
                value={profile.username}
                readOnly
                required
                placeholder="请输入用户名"
              />
            </div>

            {/* Nickname */}
            <div className="form-group">
              <label className="form-label">昵称</label>
              <input
                type="text"
                className="form-input"
                name="nickname"
                value={profile.nickname}
                onChange={handleInputChange}
                required
                placeholder="请输入昵称"
              />
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">邮箱</label>
              <input
                type="email"
                className="form-input"
                name="email"
                value={profile.email}
                readOnly
                placeholder="请输入邮箱"
              />
            </div>

            {/* Actions */}
            <div className="form-actions">
              <button type="button" className="action-button secondary" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="action-button primary">
                保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProfileModal
