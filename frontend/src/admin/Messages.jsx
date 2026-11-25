import { useState, useEffect, useCallback } from 'react'
import Chip from '../components/ui/Chip.jsx'
import Button from '../components/ui/Button.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import { getContactMessages, updateContactMessage } from '../api/admin.js'

const PAGE_SIZE = 20

function formatRelativeTime(timestamp) {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMs = now - then
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just now'
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffHours < 48) return 'Yesterday'

  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Messages() {
  const [messages, setMessages] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (filter === 'unread') params.isRead = false
      const res = await getContactMessages(params)
      setMessages(res.messages || [])
      setTotal(res.total || 0)
      setTotalPages(res.totalPages || 1)
      setUnreadCount(res.unreadCount || 0)
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => {
    load()
  }, [load])

  async function handleExpand(msg) {
    if (expandedId === msg.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(msg.id)
    if (!msg.isRead) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      updateContactMessage(msg.id, { is_read: true }).catch(() => {})
    }
  }

  async function handleMarkUnread(id) {
    await updateContactMessage(id, { is_read: false })
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isRead: false } : m)),
    )
    setUnreadCount((c) => c + 1)
    setExpandedId(null)
  }

  const rangeStart = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Messages</h1>
        {unreadCount > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Chip
          selected={filter === 'all'}
          onClick={() => {
            setFilter('all')
            setPage(1)
          }}
        >
          All
        </Chip>
        <Chip
          selected={filter === 'unread'}
          onClick={() => {
            setFilter('unread')
            setPage(1)
          }}
        >
          Unread
        </Chip>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <p className="text-center text-muted py-16">No messages yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {messages.map((msg) => {
              const isExpanded = expandedId === msg.id
              const preview =
                msg.message && msg.message.length > 120
                  ? msg.message.slice(0, 120) + '...'
                  : msg.message

              return (
                <div
                  key={msg.id}
                  className="cursor-pointer rounded-xl shadow-card bg-white border border-line/60 p-6"
                  onClick={() => handleExpand(msg)}
                >
                  <div className="flex items-start gap-3">
                    {!msg.isRead && (
                      <span className="shrink-0 mt-1.5 h-2.5 w-2.5 rounded-full bg-teal" />
                    )}
                    {msg.isRead && <span className="shrink-0 mt-1.5 h-2.5 w-2.5" />}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-navy">{msg.name}</span>
                        <span className="text-xs text-muted">{msg.email}</span>
                      </div>

                      {!isExpanded && (
                        <p className="text-sm text-slate truncate">{preview}</p>
                      )}

                      {isExpanded && (
                        <div>
                          <p className="text-base text-slate whitespace-pre-wrap mt-2">
                            {msg.message}
                          </p>
                          <div className="flex gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkUnread(msg.id)}
                            >
                              Mark as unread
                            </Button>
                            <a
                              href={`mailto:${msg.email}?subject=${encodeURIComponent('Re: Your message to AutoSense')}`}
                              className="inline-flex items-center justify-center rounded-lg font-semibold transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 bg-transparent text-teal hover:bg-teal-soft h-9 px-3 text-sm"
                            >
                              Reply via email
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-xs text-muted whitespace-nowrap shrink-0">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted">
                Showing {rangeStart}–{rangeEnd} of {total} messages
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Messages
