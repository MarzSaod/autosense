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

// "2026-11-04" -> { year: 2026, month: 10, day: 4 }. month is 0-based to match
// the Date constructor used for the grid cells.
function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month: month - 1, day }
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
  // The shop's own current date ("YYYY-MM-DD"), from the month endpoint. This
  // is what decides which days are past, which day gets the "today" ring, and
  // how far back the month navigation goes. The device clock cannot answer
  // that: a visitor east of Eastern time is already on tomorrow's date while
  // the shop is still open today, which used to grey out the shop's real
  // current day and hide same-day slots it would still accept.
  const [shopToday, setShopToday] = useState(null)
  // Which month is on screen. Seeded from the device clock purely so the grid
  // has something to render before the first response; corrected below once
  // the shop's date arrives.
  const [viewMonth, setViewMonth] = useState(() => {
    const deviceNow = new Date()
    return new Date(deviceNow.getFullYear(), deviceNow.getMonth(), 1)
  })
  // date key -> { isOpen, isAvailable, openSlotCount } from the backend.
  const [monthDays, setMonthDays] = useState(new Map())

  const shopTodayParts = useMemo(
    () => (shopToday ? parseDateKey(shopToday) : null),
    [shopToday],
  )

  // If the device's month is behind the shop's (a visitor west of Eastern on
  // the last day of a month), the seeded view would start on a month that is
  // entirely in the past. Derive the month actually shown rather than storing
  // the correction, so there is one source of truth for what is on screen.
  const shownMonth = useMemo(() => {
    if (!shopTodayParts) {
      return viewMonth
    }
    const isBeforeShopMonth =
      viewMonth.getFullYear() < shopTodayParts.year ||
      (viewMonth.getFullYear() === shopTodayParts.year &&
        viewMonth.getMonth() < shopTodayParts.month)
    return isBeforeShopMonth
      ? new Date(shopTodayParts.year, shopTodayParts.month, 1)
      : viewMonth
  }, [viewMonth, shopTodayParts])

  const cells = useMemo(
    () => getMonthCells(shownMonth.getFullYear(), shownMonth.getMonth()),
    [shownMonth],
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
        const { shopToday: currentShopDate, days } = await getMonthAvailability(
          shownMonth.getFullYear(),
          shownMonth.getMonth() + 1,
          stableServiceIds,
        )
        if (!cancelled) {
          setMonthDays(new Map(days.map((day) => [day.date, day])))
          if (currentShopDate) {
            setShopToday(currentShopDate)
          }
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
  }, [shownMonth, stableServiceIds, refreshKey])

  // Before the shop's date is known, keep the back button closed rather than
  // letting the visitor page into months that may turn out to be past.
  const isAtEarliestMonth = shopTodayParts
    ? shownMonth.getFullYear() === shopTodayParts.year &&
      shownMonth.getMonth() === shopTodayParts.month
    : true

  function goToPrevMonth() {
    setViewMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1))
  }

  function goToNextMonth() {
    setViewMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1))
  }

  // Until the month's availability arrives, days are left clickable rather
  // than flashing as disabled.
  const monthLoaded = monthDays.size > 0

  const monthLabel = shownMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null

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
          // Plain string comparison: both sides are YYYY-MM-DD, which sorts
          // chronologically. Until the shop's date arrives nothing is treated
          // as past, rather than guessing from the device clock.
          const isPast = shopToday ? key < shopToday : false
          const isClosed = dayInfo ? !dayInfo.isOpen : false
          // Open that weekday, but nothing left to book.
          const isFullyBooked = Boolean(dayInfo?.isOpen) && !dayInfo.isAvailable && !isPast
          const isSelected = cell.inMonth && key === selectedKey
          const isToday = cell.inMonth && key === shopToday
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
