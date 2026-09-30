import { motion } from 'framer-motion'
import Button from '../ui/Button.jsx'
import { Check } from '../ui/Icon.jsx'
import { scaleIn, useReducedMotionSafe } from '../../motion/presets.js'

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTimeLabel(time24) {
  const [hourStr, minuteStr] = time24.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function BookingConfirmation({ confirmation, serviceNames, onBookAnother }) {
  const variants = useReducedMotionSafe(scaleIn)

  return (
    <div className="max-w-[560px] mx-auto flex flex-col items-center text-center gap-4">
      <motion.span
        variants={variants}
        initial="hidden"
        animate="visible"
        className="h-16 w-16 rounded-full bg-teal text-white flex items-center justify-center"
      >
        <Check className="h-8 w-8" />
      </motion.span>

      <h1 className="text-section-title text-navy">Your appointment is booked</h1>

      <p className="text-slate">
        We&apos;ve sent the details to{' '}
        <span className="font-bold text-navy">{confirmation.contact.email}</span>
      </p>

      <div className="w-full bg-surface border border-line/60 rounded-xl shadow-card p-6 text-left flex flex-col gap-3 mt-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Reference</span>
          <span className="font-bold text-navy">{confirmation.referenceId}</span>
        </div>
        {serviceNames.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">Services</span>
            <span className="font-semibold text-navy text-right">{serviceNames.join(', ')}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Vehicle</span>
          <span className="font-semibold text-navy">
            {confirmation.vehicle.year} {confirmation.vehicle.make} {confirmation.vehicle.model}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Date</span>
          <span className="font-semibold text-navy">{formatLongDate(confirmation.date)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Time</span>
          <span className="font-semibold text-navy">{formatTimeLabel(confirmation.time)}</span>
        </div>
      </div>

      <p className="text-sm text-muted mt-2">The shop will confirm your appointment shortly.</p>

      <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
        <Button variant="secondary" as="link" to="/" className="w-full sm:w-auto">
          Back to home
        </Button>
        <Button variant="ghost" onClick={onBookAnother} className="w-full sm:w-auto">
          Book another appointment
        </Button>
      </div>
    </div>
  )
}

export default BookingConfirmation
