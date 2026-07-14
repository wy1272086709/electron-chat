import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeleteOutlined, LoadingOutlined } from '@ant-design/icons'
import {
  favoriteService,
  toFavoriteApiType,
  type FavoriteApiType,
  type FavoriteItem,
  type FavoriteItemType
} from '@renderer/services/favorite.service'
import { getFileTone } from '@renderer/utils/file-meta'
import { resolveMediaUrl } from '@renderer/utils/media-url'

type FavoriteTab = 'all' | FavoriteItemType

const tabs: Array<{
  id: FavoriteTab
  label: string
  icon: React.ReactNode
}> = [
  {
    id: 'all',
    label: '全部收藏',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
      </svg>
    )
  },
  {
    id: 'text',
    label: '文字',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14v2H5V5Zm0 4h14v2H5V9Zm0 4h10v2H5v-2Zm0 4h7v2H5v-2Z" />
      </svg>
    )
  },
  {
    id: 'image',
    label: '图片与视频',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v14H4V5Zm2 2v8.2l3.2-3.2 2.8 2.8 4.2-4.8L18 12.1V7H6Zm1.5 3.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
    )
  },
  {
    id: 'file',
    label: '文件',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h7l2 2h9v11H3V6Zm2 4v7h14v-7H5Z" />
      </svg>
    )
  }
]

function formatFavoriteTime(time: string): string {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return time

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function formatSourceDate(time: string): string {
  return formatFavoriteTime(time)
}

function isExpired(time?: string): boolean {
  if (!time) return false
  const date = new Date(time)
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

function getFavoriteBody(favorite: FavoriteItem): string {
  return favorite.content || favorite.title
}

function getFavoriteSourceText(favorite: FavoriteItem): string {
  return `来自 ${favorite.source} ${formatSourceDate(favorite.time)}`
}

function downloadFavoriteFile(favorite: FavoriteItem): void {
  if (!favorite.fileUrl || isExpired(favorite.expiresAt)) return
  const anchor = document.createElement('a')
  anchor.href = favorite.fileUrl
  anchor.download = favorite.fileName || favorite.title
  anchor.target = '_blank'
  anchor.rel = 'noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

const PAGE_SIZE = 20
const MAX_TAKE = 100

const getLoadSize = (page: number): number => Math.min(page * PAGE_SIZE, MAX_TAKE)

function getFavoriteApiTypes(tab: FavoriteTab): FavoriteApiType[] | undefined {
  if (tab === 'all') return undefined
  if (tab === 'image') return ['IMAGE', 'VIDEO']
  return [toFavoriteApiType(tab as FavoriteItemType)]
}

function sortFavoritesByTime(list: FavoriteItem[]): FavoriteItem[] {
  return [...list].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
}

const FavoriteImageThumb: React.FC<{ favorite: FavoriteItem; className?: string }> = ({
  favorite,
  className = 'favorite-image-thumb'
}) => {
  const rawSrc = favorite.thumbnail || favorite.fileUrl || ''
  const [resolvedThumb, setResolvedThumb] = useState({ key: '', url: '' })
  const directSrc = /^(https?:|data:|blob:|\/)/i.test(rawSrc) ? rawSrc : ''
  const src = resolvedThumb.key === rawSrc ? resolvedThumb.url : directSrc

  useEffect(() => {
    let active = true
    if (!rawSrc) return undefined

    void resolveMediaUrl(rawSrc).then((url) => {
      if (active) setResolvedThumb({ key: rawSrc, url: url || directSrc })
    })

    return () => {
      active = false
    }
  }, [directSrc, rawSrc])

  return src ? (
    <img className={className} src={src} alt="收藏图片" />
  ) : (
    <div className={`${className} is-empty`} aria-label="图片暂不可预览">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v14H4V5Zm2 2v8.2l3.2-3.2 2.8 2.8 4.2-4.8L18 12.1V7H6Z" />
      </svg>
    </div>
  )
}

const Favorites: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FavoriteTab>('all')
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [selectedFavorite, setSelectedFavorite] = useState<FavoriteItem | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestSeqRef = useRef(0)

  const loadFavorites = useCallback(
    async (nextPage: number, options: { reset?: boolean } = {}): Promise<void> => {
      const requestSeq = requestSeqRef.current + 1
      requestSeqRef.current = requestSeq
      setLoading(true)
      setError(null)

      const take = getLoadSize(nextPage)
      const apiTypes = getFavoriteApiTypes(activeTab)
      const res: {
        result: boolean
        code: number
        message?: string
        data: FavoriteItem[] | null
        hasMore: boolean
      } = apiTypes
        ? await Promise.all(apiTypes.map((type) => favoriteService.list({ take, type }))).then(
            (responses) => {
              const failed = responses.find((response) => !response.result)
              const merged = new Map<string, FavoriteItem>()
              responses.forEach((response) => {
                response.data?.forEach((item) => merged.set(item.id, item))
              })
              return {
                result: !failed,
                code: failed?.code || 0,
                message: failed?.message,
                data: sortFavoritesByTime(Array.from(merged.values())),
                hasMore:
                  responses.some((response) => (response.data?.length || 0) >= take) &&
                  take < MAX_TAKE
              }
            }
          )
        : await favoriteService.list({ take }).then((response) => ({
            ...response,
            data: response.data,
            hasMore: (response.data?.length || 0) >= take && take < MAX_TAKE
          }))

      if (requestSeq !== requestSeqRef.current) return

      if (res.result && res.data) {
        setFavorites(res.data)
        setPage(nextPage)
        setHasMore(res.hasMore)
      } else {
        if (options.reset) setFavorites([])
        setError(res.message || '收藏列表加载失败')
      }

      setLoading(false)
    },
    [activeTab]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFavorites(1, { reset: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeTab, loadFavorites])

  const handleTabChange = (tab: FavoriteTab): void => {
    if (tab === activeTab) return
    setFavorites([])
    setPage(1)
    setHasMore(true)
    setError(null)
    setActiveTab(tab)
  }

  useEffect(() => {
    const el = listRef.current
    if (!el || loading || !hasMore || favorites.length === 0) return
    if (el.scrollHeight <= el.clientHeight + 8) {
      const timer = window.setTimeout(() => {
        void loadFavorites(page + 1)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [favorites.length, hasMore, loadFavorites, loading, page])

  const loadNextPage = useCallback((): void => {
    if (loading || !hasMore) return
    void loadFavorites(page + 1)
  }, [hasMore, loadFavorites, loading, page])

  const handleListScroll = useCallback((): void => {
    const el = listRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceToBottom < 120) {
      loadNextPage()
    }
  }, [loadNextPage])

  useEffect(() => {
    const root = listRef.current
    const target = loadMoreRef.current
    if (!root || !target || favorites.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadNextPage()
        }
      },
      {
        root,
        rootMargin: '0px 0px 160px 0px',
        threshold: 0.01
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [favorites.length, loadNextPage])

  const currentTabLabel = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label,
    [activeTab]
  )

  const closeDetail = (): void => {
    setSelectedFavorite(null)
  }

  const handleDelete = async (favorite: FavoriteItem): Promise<void> => {
    if (deletingIds.has(favorite.id)) return
    if (!window.confirm('确定要删除这条收藏吗？')) return

    setDeletingIds((current) => new Set(current).add(favorite.id))
    setError(null)

    try {
      const response = await favoriteService.remove(favorite.apiType, favorite.targetId)
      if (!response.result) {
        setError(response.message || '删除收藏失败')
        return
      }

      setFavorites((current) => current.filter((item) => item.id !== favorite.id))
      setSelectedFavorite((current) => (current?.id === favorite.id ? null : current))
    } catch {
      setError('删除收藏失败，请稍后重试')
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(favorite.id)
        return next
      })
    }
  }

  return (
    <div className="favorites-panel">
      <aside className="favorites-sidebar" aria-label="收藏分类">
        <nav className="favorites-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`favorites-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              type="button"
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="favorites-nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="favorites-content">
        <header className="favorites-content-header">
          <h2>{currentTabLabel}</h2>
        </header>

        <div className="favorites-list" ref={listRef} onScroll={handleListScroll}>
          {favorites.length === 0 && !loading ? (
            <div className="empty-favorites">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4h16v11H8l-4 4V4Zm4 4v2h8V8H8Zm0 4v2h5v-2H8Z" />
              </svg>
              <p>{error || '暂无收藏内容'}</p>
            </div>
          ) : (
            <>
              {favorites.map((favorite) => (
                <article
                  key={favorite.id}
                  className={`favorite-card ${favorite.type === 'file' ? 'has-media' : ''} ${
                    favorite.type === 'image' ? 'is-image' : ''
                  }`}
                  onClick={() => setSelectedFavorite(favorite)}
                >
                  <button
                    className="favorite-card-delete"
                    type="button"
                    aria-label="删除收藏"
                    title="删除收藏"
                    disabled={deletingIds.has(favorite.id)}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDelete(favorite)
                    }}
                  >
                    {deletingIds.has(favorite.id) ? <LoadingOutlined spin /> : <DeleteOutlined />}
                  </button>
                  <div className="favorite-card-main">
                    {favorite.type === 'image' && <FavoriteImageThumb favorite={favorite} />}
                    <div className="favorite-text">
                      {favorite.type !== 'image' && (
                        <h3>
                          {favorite.type === 'file'
                            ? favorite.fileName || favorite.title
                            : favorite.title}
                        </h3>
                      )}
                      {favorite.type === 'file' && (
                        <p className="favorite-file-meta">
                          {[favorite.fileExt, favorite.fileSize].filter(Boolean).join(' ')}
                        </p>
                      )}
                      {favorite.content &&
                        favorite.type !== 'file' &&
                        favorite.content.trim() !== favorite.title.trim() && (
                          <p className="favorite-description">{favorite.content}</p>
                        )}
                      <footer className="favorite-card-footer">
                        <span>{favorite.source}</span>
                        <time dateTime={favorite.time}>{formatFavoriteTime(favorite.time)}</time>
                      </footer>
                    </div>
                  </div>

                  {favorite.type === 'file' && (
                    <div className="favorite-card-media" aria-hidden="true">
                      <div className={`favorite-file-icon ${getFileTone(favorite.fileExt)}`}>
                        <span>{favorite.fileExt?.slice(0, 1).toUpperCase() || 'F'}</span>
                      </div>
                    </div>
                  )}
                </article>
              ))}

              <div className="favorites-load-state" ref={loadMoreRef}>
                {loading ? '加载中...' : hasMore ? '继续下拉加载更多' : '已加载全部收藏'}
              </div>
              {error && <div className="favorites-load-error">{error}</div>}
            </>
          )}
        </div>
      </section>

      {selectedFavorite && (
        <div className="favorite-detail-backdrop" role="dialog" aria-modal="true">
          <section className={`favorite-detail favorite-detail-${selectedFavorite.type}`}>
            <header className="favorite-detail-header">
              <button className="favorite-detail-back" type="button" onClick={closeDetail}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <h3>{selectedFavorite.type === 'file' ? '文件预览' : '收藏详情'}</h3>
              <button className="favorite-detail-close" type="button" onClick={closeDetail}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </header>

            {selectedFavorite.type === 'image' ? (
              <div className="favorite-image-preview">
                <FavoriteImageThumb
                  favorite={selectedFavorite}
                  className="favorite-detail-image-content"
                />
                <p className="favorite-detail-source">{getFavoriteSourceText(selectedFavorite)}</p>
              </div>
            ) : selectedFavorite.type === 'file' ? (
              <div className="favorite-file-preview">
                <div
                  className={`favorite-file-preview-icon ${getFileTone(selectedFavorite.fileExt)}`}
                >
                  <span>{selectedFavorite.fileExt || 'FILE'}</span>
                </div>
                <h4>{selectedFavorite.fileName || selectedFavorite.title}</h4>
                <p className="favorite-file-preview-size">
                  文件大小: {selectedFavorite.fileSize || '未知'}
                </p>
                {selectedFavorite.expiresAt && (
                  <p
                    className={`favorite-file-preview-expiry ${
                      isExpired(selectedFavorite.expiresAt) ? 'expired' : ''
                    }`}
                  >
                    有效期至: {formatFavoriteTime(selectedFavorite.expiresAt)}
                  </p>
                )}
                <p className="favorite-detail-source">{getFavoriteSourceText(selectedFavorite)}</p>
                <button
                  className="favorite-file-download"
                  type="button"
                  disabled={!selectedFavorite.fileUrl || isExpired(selectedFavorite.expiresAt)}
                  onClick={() => downloadFavoriteFile(selectedFavorite)}
                >
                  {isExpired(selectedFavorite.expiresAt) ? '文件已过期' : '接收文件'}
                </button>
              </div>
            ) : (
              <div className="favorite-text-detail">
                <p>{getFavoriteBody(selectedFavorite)}</p>
                <p className="favorite-detail-source">{getFavoriteSourceText(selectedFavorite)}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default Favorites
