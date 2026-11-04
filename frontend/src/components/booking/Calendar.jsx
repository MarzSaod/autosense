import { useEffect, useMemo, useState } from 'react'
import BookingSectionHeader from './BookingSectionHeader.jsx'
import { ChevronLeft, ChevronRight } from '../ui/Icon.jsx'
import { getMonthAvailability } from '../../api/bookings.js'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getMonthCells(year, month) {
  const firstDay = new Date(year, month, 1)
  const startWeekday = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []

  for (let i = 0; i < startWeekday; i += 1) {
    const day = daysInPrevMonth - startWeekday + 1 + i
    cells.push({ date: new Date(year, month - 1, day), inMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true })
  }

  const remainder = cells.length % 7
  const trailing = remainder === 0 ? 0 : 7 - remainder
  for (let day = 1; day <= trailing; day += 1) {
    cells.push({ date: new Date(year, month + 1, day), inMonth: false })
  }

  return cells
}

function Calendar({ selectedDate, onSelectDate, serviceIds = [], refreshKey = 0 }) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  // date key -> { isOpen, isAvailable, openSlotCount } from the backend.
  const [monthDays, setMonthDays] = useState(new Map())

  const cells = useMemo(
    () => getMonthCells(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  )

  // Stable identity for the selected services, so the month request re-runs
  // when the selection actually changes rather than on every parent render.
  const serviceIdsKey = serviceIds.join(',')
  const stableServiceIds = useMemo(
    () => (serviceIdsKey ? serviceIdsKey.split(',').map(Number) : []),
    [serviceIdsKey],
  )

  // One request per month: the backend works out, for every day, whether the
  // shop opens that weekday and whether any slot is still open for the
  // selected services.
  useEffect(() => {
    let cancelled = false

    async function loadMonth() {
      try {
        const days = await getMonthAvailability(
          viewMonth.getFullYear(),
          viewMonth.getMonth() + 1,
          stableServiceIds,
        )
        if (!cancelled) {
          setMonthDays(new Map(days.map((day) => [day.date, day])))
        }
      } catch {
        if (!cancelled) {
          setMonthDays(new Map())
        }
      }
    }

    loadMonth()

    return () => {
      cancelled = true
    }
  }, [viewMonth, stableServiceIds, refreshKey])

  const isAtEarliestMonth =
    viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth()

  function goToPrevMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  function goToNextMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  // Until the month's availability arrives, days are left clickable rather
  // than flashing as disabled.
  const monthLoaded = monthDays.size > 0

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null
  const todayKey = formatDateKey(today)

  return (
    <div
      id="booking-date-section"
      tabIndex={-1}
      className="border border-line/60 rounded-xl shadow-card bg-white p-6"
    >
      <BookingSectionHeader number={4} title="Pick a date" />

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={isAtEarliestMonth}
          aria-label="Previous month"
          className="h-11 w-11 flex items-center justify-center rounded-lg border border-line text-navy hover:bg-surface disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-bold text-navy">{monthLabel}</span>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Next month"
          className="h-11 w-11 flex items-center justify-center rounded-lg border border-line text-navy hover:bg-surface"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={`${label}-${index}`} className="text-sm font-semibold text-muted py-2">
            {label}
          </span>
        ))}

        {cells.map((cell) => {
          const key = formatDateKey(cell.date)
          const dayInfo = monthDays.get(key)
          const isPast = cell.date < today
          const isClosed = dayInfo ? !dayInfo.isOpen : false
          // Open that weekday, but nothing left to book.
          const isFullyBooked = Boolean(dayInfo?.isOpen) && !dayInfo.isAvailable && !isPast
          const isSelected = cell.inMonth && key === selectedKey
          const isToday = cell.inMonth && key === todayKey
          const hasAvailability = Boolean(dayInfo?.isAvailable)
          const disabled =
            !cell.inMonth || isPast || (monthLoaded && (isClosed || !hasAvailability))
          const struckThrough = cell.inMonth && (isPast || isFullyBooked)

          const stateClasses = !cell.inMonth
            ? 'text-line-strong pointer-events-none'
            : isSelected
              ? 'bg-teal text-white font-semibold'
              : isToday
                ? 'text-navy font-semibold ring-2 ring-teal'
                : disabled
                  ? 'text-muted cursor-not-allowed'
                  : 'text-navy hover:bg-surface'

          return (
            <button
              key={`${key}-${cell.inMonth}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(cell.date)}
              className={`h-11 w-11 mx-auto flex items-center justify-center rounded-full text-sm transition-colors duration-150 ${stateClasses} ${struckThrough ? 'line-through' : ''}`}
            >
              {cell.date.getDate()}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-6 text-sm text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-teal" />
          Selected
        </span>
        <span className="flex items-center gap-2">
          <span className="line-through">12</span>
          Fully booked
        </span>
      </div>
    </div>
  )
}

export default Calendar
