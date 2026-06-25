import React, { useState } from 'react';
import { Input, Avatar, List, Checkbox, Empty } from 'antd';
import { UserOutlined, GroupOutlined } from '@ant-design/icons';

interface User {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
}

interface AddGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onAddGroup: (selectedUsers: User[], groupName: string) => void;
  allUsers: User[];
  currentUserId: string;
}

const AddGroupModal: React.FC<AddGroupModalProps> = ({
  visible,
  onClose,
  onAddGroup,
  allUsers,
  currentUserId,
}) => {
  const [groupName, setGroupName] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  // 过滤除自己外的用户
  const filteredUsers = allUsers.filter(user => user.id !== currentUserId);

  // 根据搜索词过滤用户
  const searchedUsers = filteredUsers.filter(user =>
    user.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // 处理用户选择
  const handleUserSelect = (user: User, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, user]);
    } else {
      setSelectedUsers(selectedUsers.filter(u => u.id !== user.id));
    }
  };


  // 处理创建群聊
  const handleCreateGroup = () => {
    if (selectedUsers.length < 2) {
      alert('请至少选择2个用户');
      return;
    }
    if (!groupName.trim()) {
      alert('请输入群聊名称');
      return;
    }
    onAddGroup(selectedUsers, groupName);
    // 重置状态
    setGroupName('');
    setSelectedUsers([]);
    setSearchText('');
    onClose();
  };

  if (!visible) return null;

  return (
    <div className="add-group-modal">
      <div className="add-group-modal-content">
        {/* Header */}
        <div className="add-group-header">
          <h2 className="add-group-title">创建群聊</h2>
          <button className="add-group-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Group Name Input */}
        <div className="group-name-section">
          <h3 className="section-title">群聊名称</h3>
          <div className="group-name-input">
            <GroupOutlined className="input-icon" />
            <Input
              placeholder="请输入群聊名称"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="group-name-text"
            />
          </div>
        </div>

        <div className="content-wrapper">
          {/* Left: User List */}
          <div className="user-list-section">
            <div className="search-input">
              <Input
                placeholder="搜索用户"
                prefix={<UserOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>

            <List
              className="user-list"
              dataSource={searchedUsers}
              renderItem={(user) => (
                <List.Item
                  className="user-item"
                  actions={[
                    <Checkbox
                      key="select"
                      checked={selectedUsers.some((u) => u.id === user.id)}
                      onChange={(e) => handleUserSelect(user, e.target.checked)}
                    />
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar src={user.avatar} icon={<UserOutlined />} />}
                    title={
                      <div className="user-item-title">
                        <span className="user-name">{user.name}</span>
                        {user.isOnline && (
                          <span className="online-status">在线</span>
                        )}
                      </div>
                    }
                    description={
                      <div className="user-info">
                        <span>ID: {user.id}</span>
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: <Empty description="暂无用户" /> }}
            />
          </div>

          {/* Right: Selected Preview */}
          <div className="selected-preview">
            <h3>已选用户 ({selectedUsers.length})</h3>
            <div className="selected-users">
              {selectedUsers.length === 0 ? (
                <Empty description="请选择用户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                selectedUsers.map((user) => (
                  <div key={user.id} className="selected-user-item">
                    <Avatar src={user.avatar} icon={<UserOutlined />} />
                    <div className="user-info">
                      <span className="user-name">{user.name}</span>
                      {user.isOnline && (
                        <span className="online-indicator" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="add-group-actions">
          <button
            className="action-button secondary"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="action-button primary"
            onClick={handleCreateGroup}
            disabled={selectedUsers.length < 2 || !groupName.trim()}
          >
            创建群聊
          </button>
        </div>
      </div>
      <style>{`
        .add-group-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(26, 27, 46, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }

        .add-group-modal-content {
          width: 90%;
          max-width: 800px;
          background-color: rgba(37, 38, 58, 0.85);
          border-radius: 16px;
          padding: 32px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .add-group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .add-group-title {
          font-size: 24px;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, var(--gradient-purple-start) 0%, var(--gradient-cyan-start) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .add-group-close {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #666;
          transition: all 0.3s ease;
          background-color: rgba(255, 255, 255, 0.05);
        }

        .add-group-close:hover {
          background-color: rgba(99, 102, 241, 0.2);
          color: white;
          transform: scale(1.05);
        }

        .content-wrapper {
          display: flex;
          gap: 32px;
          margin-bottom: 24px;
        }

        .user-list-section {
          flex: 1;
          min-width: 0;
        }

        .user-item-title {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-name {
          font-size: 14px;
          color: white;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }

        .search-input {
          margin-bottom: 24px;
        }

        .search-input .ant-input {
          height: 48px;
          background-color: #2a2b3a;
          border: none;
          border-radius: 12px;
          padding: 0 16px 0 48px;
          color: white;
          font-size: 16px;
          transition: all 0.3s ease;
        }

        .search-input .ant-input:focus {
          outline: none;
          border-color: var(--gradient-purple-start);
          background-color: rgba(42, 43, 58, 0.9);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
        }

        .search-input .ant-input::placeholder {
          color: #666;
        }

        .search-input .ant-input-prefix {
          left: 16px;
          color: #666;
        }

        .user-list {
          height: 400px;
          overflow-y: auto;
          margin-bottom: 24px;
        }

        .selected-preview {
          width: 320px;
          background-color: #2a2b3a;
          border-radius: 12px;
          padding: 20px;
        }

        .selected-users {
          margin-top: 16px;
        }

        .selected-user-item {
          display: flex;
          align-items: center;
          padding: 12px;
          background-color: rgba(42, 43, 58, 0.5);
          border-radius: 8px;
          margin-bottom: 8px;
          transition: all 0.3s ease;
        }

        .selected-user-item:hover {
          background-color: rgba(99, 102, 241, 0.1);
        }

        .selected-user-item .user-info {
          margin-left: 12px;
          flex: 1;
        }

        .selected-user-item .user-name {
          font-size: 14px;
          color: white;
          font-weight: 500;
        }

        .online-status {
          color: #10b981;
          font-size: 12px;
          margin-left: 8px;
        }

        .online-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #10b981;
          margin-left: 8px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        .add-group-actions {
          display: flex;
          gap: 16px;
          margin-top: 24px;
        }

        .action-button {
          flex: 1;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .action-button.primary {
          background: linear-gradient(135deg, var(--gradient-purple-start) 0%, var(--gradient-cyan-start) 100%);
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .action-button.primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .action-button.secondary {
          background-color: #2a2b3a;
          color: #666;
          border: 1px solid #33333c;
        }

        .action-button.secondary:hover {
          background-color: #33333c;
          color: white;
          border-color: var(--gradient-purple-start);
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .group-name-section {
          margin-bottom: 32px;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #ccc;
          margin-bottom: 12px;
        }

        .group-name-input {
          position: relative;
        }

        .group-name-input .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
          font-size: 18px;
          z-index: 1;
        }

        .group-name-input .ant-input {
          position: relative;
          height: 48px;
          background-color: #2a2b3a;
          border: none;
          border-radius: 12px;
          padding: 0 16px 0 48px;
          color: white;
          font-size: 16px;
          transition: all 0.3s ease;
        }

        .group-name-input .ant-input:focus {
          outline: none;
          border-color: var(--gradient-purple-start);
          background-color: rgba(42, 43, 58, 0.9);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
        }

        .group-name-input .ant-input::placeholder {
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default AddGroupModal;