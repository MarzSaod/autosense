import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Button from '../components/ui/Button.jsx'
import { getAdminStats, getAdminBookings } from '../api/admin.js'

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-teal-soft text-teal-dark',
  completed: 'bg-surface text-muted',
  cancelled: 'bg-red-50 text-red-600',
}

function StatCard({ label, value, loading }) {
  return (
    <Card>
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

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [bookings, setBookings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminBookings()])
      .then(([s, b]) => {
        setStats(s)
        setBookings(b.slice(0, 5))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-navy">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Services" value={stats?.services} loading={loading} />
        <StatCard label="Total Bookings" value={stats?.totalBookings} loading={loading} />
        <StatCard label="Pending Bookings" value={stats?.pendingBookings} loading={loading} />
        <StatCard label="Gallery Images" value={stats?.galleryImages} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <Card>
          <h2 className="text-lg font-semibold text-navy mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Button variant="secondary" as="link" to="/admin/services" className="w-full">
              Add a service
            </Button>
            <Button variant="secondary" as="link" to="/admin/bookings" className="w-full">
              Manage bookings
            </Button>
            <Button variant="secondary" as="link" to="/admin/gallery" className="w-full">
              Add gallery image
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard
