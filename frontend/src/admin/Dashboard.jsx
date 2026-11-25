import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Button from '../components/ui/Button.jsx'
import { getAdminStats, getAdminBookings, getChartData, getActivity } from '../api/admin.js'

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-teal-soft text-teal-dark',
  completed: 'bg-surface text-muted',
  cancelled: 'bg-red-50 text-red-600',
}

const statusBarColors = {
  pending: 'bg-amber-400',
  confirmed: 'bg-teal',
  completed: 'bg-muted',
  cancelled: 'bg-danger',
}

const activityDotColors = {
  booking_created: 'bg-teal',
  booking_updated: 'bg-amber-400',
  contact_received: 'bg-navy',
}

function StatCard({ label, value, loading, highlight }) {
  return (
    <Card className={highlight ? '!bg-amber-50' : ''}>
      {loading ? (
        <>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold text-navy">{value}</p>
          <p className="text-sm text-muted mt-1">{label}</p>
        </>
      )}
    </Card>
  )
}

function formatRelativeTime(timestamp) {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays === 1) return 'Yesterday'

  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatChartDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

function BookingTrendChart({ data, loading }) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-48 w-full" />
      </Card>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-navy">Booking Trend</h2>
        <span className="text-xs text-muted">{maxCount}</span>
      </div>
      <div className="flex items-end gap-0.5" style={{ height: '200px' }}>
        {data.map((d, i) => {
          const pct = d.count === 0 ? 0 : (d.count / maxCount) * 100
          const minH = d.count === 0 ? '2px' : undefined
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full bg-teal rounded-t"
                style={{ height: minH || `${pct}%` }}
                title={`${formatChartDate(d.date)}: ${d.count}`}
              />
              {i % 7 === 0 && (
                <span className="text-[10px] text-muted mt-1 whitespace-nowrap">
                  {formatChartDate(d.date)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function StatusBreakdownChart({ data, loading }) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    )
  }

  const total = data.reduce((sum, d) => sum + d.count, 0)
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <Card>
      <h2 className="text-lg font-semibold text-navy mb-4">By Status</h2>
      <div className="flex flex-col gap-4">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
          const barPct = (d.count / maxCount) * 100
          return (
            <div key={d.status} className="flex items-center gap-3">
              <span className="text-sm font-medium text-navy w-24 capitalize">{d.status}</span>
              <div className="flex-1 h-6 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${statusBarColors[d.status] || 'bg-muted'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="text-sm text-muted w-16 text-right">
                {d.count} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ActivityFeed({ data, loading }) {
  if (loading) {
    return (
      <Card>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-navy mb-4">Recent Activity</h2>
      <div className="max-h-[400px] overflow-y-auto">
        <div className="flex flex-col divide-y divide-line">
          {data.map((event, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span
                className={`shrink-0 h-2.5 w-2.5 rounded-full ${activityDotColors[event.type] || 'bg-muted'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy">{event.title}</p>
                <p className="text-xs text-muted truncate">{event.detail}</p>
              </div>
              <span className="text-xs text-muted whitespace-nowrap shrink-0">
                {formatRelativeTime(event.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [bookings, setBookings] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chartsLoading, setChartsLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => {})

    getAdminBookings({ limit: 5 })
      .then((res) => setBookings(res.bookings))
      .catch(() => {})
      .finally(() => setLoading(false))

    getChartData()
      .then(setChartData)
      .catch(() => {})
      .finally(() => setChartsLoading(false))

    getActivity()
      .then(setActivity)
      .catch(() => {})
      .finally(() => setActivityLoading(false))
  }, [])

  const statsLoading = !stats

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-navy">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Active Services" value={stats?.services} loading={statsLoading} />
        <StatCard label="Total Bookings" value={stats?.totalBookings} loading={statsLoading} />
        <StatCard label="Pending Bookings" value={stats?.pendingBookings} loading={statsLoading} />
        <StatCard label="Gallery Images" value={stats?.galleryImages} loading={statsLoading} />
        <StatCard
          label="Unread Messages"
          value={stats?.unreadMessages}
          loading={statsLoading}
          highlight={stats?.unreadMessages > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BookingTrendChart data={chartData?.bookingsByDay || []} loading={chartsLoading} />
        <StatusBreakdownChart data={chartData?.bookingsByStatus || []} loading={chartsLoading} />
      </div>

      <ActivityFeed data={activity || []} loading={activityLoading} />

      <Card>
        <h2 className="text-lg font-semibold text-navy mb-4">Recent Bookings</h2>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-line">
              {(bookings || []).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-navy">{b.customerName}</p>
                    <p className="text-xs text-muted">{b.appointmentDate}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[b.status] || ''}`}
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
            <Link
              to="/admin/bookings"
              className="inline-block mt-4 text-sm font-medium text-teal hover:text-teal-dark transition-colors"
            >
              View all
            </Link>
          </>
        )}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" as="link" to="/admin/services" size="sm">
          Add a service
        </Button>
        <Button variant="ghost" as="link" to="/admin/bookings" size="sm">
          View bookings
        </Button>
        <Button variant="ghost" as="link" to="/admin/gallery" size="sm">
          Add gallery image
        </Button>
      </div>
    </div>
  )
}

export default Dashboard
