import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import Select from '../components/ui/Select.jsx'
import Input from '../components/ui/Input.jsx'
import Textarea from '../components/ui/Textarea.jsx'
import Button from '../components/ui/Button.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import { Search } from '../components/ui/Icon.jsx'
import { getAdminBookings, updateBooking } from '../api/admin.js'

const PAGE_SIZE = 20

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

function DetailPanel({ booking, onNotesUpdate }) {
  const [notes, setNotes] = useState(booking.notes || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSaveNotes() {
    setSaving(true)
    try {
      await updateBooking(booking.id, { notes })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
    if (onNotesUpdate) onNotesUpdate(booking.id, notes)
  }

  return (
    <div className="bg-surface rounded-b-xl px-6 py-5 border-t border-line">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <span className="text-xs text-muted">Reference ID</span>
          <p className="text-sm text-navy font-medium">{booking.referenceId}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Customer Name</span>
          <p className="text-sm text-navy font-medium">{booking.customerName}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Email</span>
          <p className="text-sm text-navy">{booking.customerEmail}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Phone</span>
          <p className="text-sm text-navy">{booking.customerPhone}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Vehicle</span>
          <p className="text-sm text-navy">
            {booking.vehicleYear} {booking.vehicleMake} {booking.vehicleModel}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted">Services</span>
          <p className="text-sm text-navy">{(booking.services || []).join(', ')}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Appointment Date</span>
          <p className="text-sm text-navy">{booking.appointmentDate}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Appointment Time</span>
          <p className="text-sm text-navy">{booking.appointmentTime}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Status</span>
          <p className="text-sm">
            <StatusBadge status={booking.status} />
          </p>
        </div>
        <div>
          <span className="text-xs text-muted">Created At</span>
          <p className="text-sm text-navy">{booking.createdAt}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm font-medium text-navy">Staff Notes</label>
          <Button
            size="sm"
            onClick={handleSaveNotes}
            loading={saving}
            className={saved ? '!bg-teal !text-white' : ''}
          >
            {saved ? 'Saved' : 'Save Notes'}
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="!min-h-20"
        />
      </div>
    </div>
  )
}

function Bookings() {
  const [bookings, setBookings] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [statusMessages, setStatusMessages] = useState({})
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (debouncedSearch) params.q = debouncedSearch
      const res = await getAdminBookings(params)
      setBookings(res.bookings || [])
      setTotal(res.total || 0)
      setTotalPages(res.totalPages || 1)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  function resetFilters() {
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
  }

  const hasActiveFilters = statusFilter || dateFrom || dateTo || search

  async function handleStatusChange(bookingId, newStatus) {
    const result = await updateBooking(bookingId, { status: newStatus })
    const msg = result.emailSent
      ? `Updated to ${newStatus}. Email sent.`
      : `Updated to ${newStatus}. Email not sent.`
    setStatusMessages((prev) => ({ ...prev, [bookingId]: msg }))
    setTimeout(() => {
      setStatusMessages((prev) => {
        const next = { ...prev }
        delete next[bookingId]
        return next
      })
    }, 3000)
    await load()
  }

  function handleRowClick(id) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function handleNotesUpdate(id, notes) {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, notes } : b)),
    )
  }

  const rangeStart = (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-navy">Bookings</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!pl-10"
          placeholder="Search by name, email, or reference ID..."
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
          >
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
          onChange={(e) => {
            setDateFrom(e.target.value)
            setPage(1)
          }}
          className="!w-44"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value)
            setPage(1)
          }}
          className="!w-44"
          placeholder="To"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
          >
            Clear filters
          </button>
        )}
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
                  <Fragment key={b.id}>
                    <tr
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                      onClick={() => handleRowClick(b.id)}
                    >
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
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {transitions[b.status] ? (
                          <div>
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
                            {statusMessages[b.id] && (
                              <p className="text-xs text-teal mt-1">{statusMessages[b.id]}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">&mdash;</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === b.id && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <DetailPanel booking={b} onNotesUpdate={handleNotesUpdate} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden flex flex-col gap-4">
            {bookings.map((b) => (
              <div key={b.id}>
                <div
                  className="cursor-pointer rounded-xl shadow-card bg-white border border-line/60 p-6"
                  onClick={() => handleRowClick(b.id)}
                >
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
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
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
                      {statusMessages[b.id] && (
                        <p className="text-xs text-teal mt-1">{statusMessages[b.id]}</p>
                      )}
                    </div>
                  )}
                </div>
                {expandedId === b.id && (
                  <DetailPanel booking={b} onNotesUpdate={handleNotesUpdate} />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted">
              Showing {rangeStart}–{rangeEnd} of {total} bookings
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
        </>
      )}
    </div>
  )
}

export default Bookings
