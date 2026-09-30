import BookingSectionHeader from './BookingSectionHeader.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import Button from '../ui/Button.jsx'
import { getAvailability } from '../../api/bookings.js'
import useApi from '../../hooks/useApi.js'

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimeLabel(time24) {
  const [hourStr, minuteStr] = time24.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function TimeSlotPicker({ date, time, onSelectTime }) {
  const dateKey = date ? formatDateKey(date) : null
  const { data: slots, loading, error, refetch } = useApi(
    () => (dateKey ? getAvailability(dateKey) : Promise.resolve([])),
    [dateKey],
  )

  const title = date ? `Pick a time, ${formatShortDate(date)}` : 'Pick a time'

  return (
    <div id="booking-time-section" tabIndex={-1} className="flex flex-col gap-4">
      <BookingSectionHeader number={5} title={title} />

      {!date && <p className="text-sm text-muted">Choose a date first.</p>}

      {date && loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      )}

      {date && !loading && error && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted text-sm">Something went wrong loading availability.</p>
          <Button variant="secondary" onClick={refetch}>
            Try Again
          </Button>
        </div>
      )}

      {date && !loading && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(slots || []).map((slot) => {
              const isSelected = time === slot.time
              const stateClasses = !slot.isAvailable
                ? 'bg-surface border border-line text-muted cursor-not-allowed'
                : isSelected
                  ? 'bg-teal border border-teal text-white font-semibold'
                  : 'bg-white border border-line text-navy hover:border-teal'

              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.isAvailable}
                  onClick={() => onSelectTime(slot.time)}
                  className={`h-11 rounded-lg text-sm transition-colors duration-150 ${stateClasses}`}
                >
                  {formatTimeLabel(slot.time)}
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted">
            Greyed out times are already full, based on the shop&apos;s real availability.
          </p>
        </>
      )}
    </div>
  )
}

export default TimeSlotPicker
