import { useState, useEffect, useCallback } from 'react'
import Card from '../components/ui/Card.jsx'
import Select from '../components/ui/Select.jsx'
import Input from '../components/ui/Input.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import { getAdminBookings, updateBooking } from '../api/admin.js'

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-teal-soft text-teal-dark',
  completed: 'bg-surface text-muted',
  cancelled: 'bg-red-50 text-red-600',
}

const transitions = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
}

function StatusBadge({ status }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[status] || ''}`}
    >
      {status}
    </span>
  )
}

function Bookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      setBookings(await getAdminBookings(params))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(bookingId, newStatus) {
    await updateBooking(bookingId, { status: newStatus })
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-navy">Bookings</h1>

      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="!w-44"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="!w-44"
          placeholder="To"
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <p className="text-center text-muted py-16">No bookings found.</p>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Vehicle</th>
                  <th className="pb-3 font-medium">Date & Time</th>
                  <th className="pb-3 font-medium">Services</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="py-3">
                      <p className="font-medium text-navy">{b.customerName}</p>
                      <p className="text-xs text-muted">{b.customerEmail}</p>
                    </td>
                    <td className="py-3 text-slate">
                      {b.vehicleYear} {b.vehicleMake} {b.vehicleModel}
                    </td>
                    <td className="py-3 text-slate">
                      {b.appointmentDate} {b.appointmentTime}
                    </td>
                    <td className="py-3 text-slate">{(b.services || []).join(', ')}</td>
                    <td className="py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="py-3 text-right">
                      {transitions[b.status] ? (
                        <Select
                          value=""
                          onChange={(e) => handleStatusChange(b.id, e.target.value)}
                          className="!w-36 !h-9 text-sm"
                        >
                          <option value="" disabled>
                            Change…
                          </option>
                          {transitions[b.status].map((s) => (
                            <option key={s} value={s} className="capitalize">
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden flex flex-col gap-4">
            {bookings.map((b) => (
              <Card key={b.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-navy">{b.customerName}</p>
                    <p className="text-xs text-muted">{b.customerEmail}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-sm text-slate">
                  {b.vehicleYear} {b.vehicleMake} {b.vehicleModel}
                </p>
                <p className="text-sm text-slate mt-1">
                  {b.appointmentDate} {b.appointmentTime}
                </p>
                <p className="text-sm text-muted mt-1">{(b.services || []).join(', ')}</p>
                {transitions[b.status] && (
                  <div className="mt-3">
                    <Select
                      value=""
                      onChange={(e) => handleStatusChange(b.id, e.target.value)}
                      className="!h-9 text-sm"
                    >
                      <option value="" disabled>
                        Change status…
                      </option>
                      {transitions[b.status].map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Bookings
