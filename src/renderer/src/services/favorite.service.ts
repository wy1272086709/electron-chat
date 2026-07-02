/**
 * 收藏服务（本地占位实现）
 *
 * 后端收藏接口尚未提供，这里先用 localStorage 做本地持久化，
 * 形态上对齐其它 service（async + ElectronResponse），便于后续直接替换为真实 HTTP 调用。
 *
 * TODO（接口就绪后）：
 *   1. 将下列方法改为经 request 调用后端收藏接口；
 *   2. 与 Favorites 面板打通：让 LayoutProvider 的收藏列表改由本服务读取，
 *      而不再使用本地 mock。
 */

import type { ElectronResponse } from './request'

/** 收藏项：在 LayoutProvider/Favorites 的 Favorite 结构基础上增加 messageId，用于判断「某条消息是否已收藏」 */
export interface FavoriteItem {
  id: string
  type: 'message' | 'file'
  title: string
  content?: string
  fileName?: string
  time: string
  chatId?: string
  /** 来源消息 ID（消息类收藏必填，作为去重 / 取消收藏的依据） */
  messageId?: string
}

const STORAGE_KEY = 'ec_favorites'

function loadAll(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : []
  } catch {
    return []
  }
}

function saveAll(list: FavoriteItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 写入失败（如隐私模式 / 配额）静默忽略，避免阻断交互
  }
}

/** 生成稳定且唯一的收藏 id（渲染进程下可用 Date.now） */
function genId(): string {
  return `fav_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export const favoriteService = {
  /** 获取全部收藏（新的在前） */
  async list(): Promise<ElectronResponse<FavoriteItem[]>> {
    return { result: true, data: loadAll(), code: 0 }
  },

  /** 某条消息是否已收藏（同步读，便于组装右键菜单时即时判断） */
  isFavoritedSync(messageId: string): boolean {
    return loadAll().some((f) => f.messageId === messageId)
  },

  /** 新增收藏（同一条消息按 messageId 去重） */
  async add(
    item: Omit<FavoriteItem, 'id'> & { id?: string }
  ): Promise<ElectronResponse<FavoriteItem>> {
    const list = loadAll()
    if (item.messageId) {
      const existed = list.find((f) => f.messageId === item.messageId)
      if (existed) return { result: true, data: existed, code: 0 }
    }
    const created: FavoriteItem = { ...item, id: item.id ?? genId() }
    list.unshift(created)
    saveAll(list)
    return { result: true, data: created, code: 0 }
  },

  /** 按来源消息 ID 移除收藏 */
  async removeByMessage(messageId: string): Promise<ElectronResponse<null>> {
    saveAll(loadAll().filter((f) => f.messageId !== messageId))
    return { result: true, data: null, code: 0 }
  }
}
