import { motion } from 'framer-motion'
import Button from '../ui/Button.jsx'
import { Check, Info } from '../ui/Icon.jsx'
import { scaleIn, useReducedMotionSafe } from '../../motion/presets.js'

function formatHours(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatHourRange(min, max) {
  if (min === max) {
    return `${formatHours(min)} hr`
  }
  return `${formatHours(min)} – ${formatHours(max)} hr`
}

function DiagnosisResultCard({ result, vehicle }) {
  const variants = useReducedMotionSafe(scaleIn)
  const isLowConfidence = result.confidence === 'low'

  if (result.outOfContext) {
    return (
      <motion.div
        variants={variants}
        initial="hidden"
        animate="visible"
        className="rounded-xl shadow-card p-6 sm:p-8 bg-surface border border-line-strong"
      >
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 bg-slate">
            <Info className="h-5 w-5" />
          </span>
          <p className="font-bold text-navy">That doesn't look like a car problem.</p>
        </div>

        <p className="mt-4 text-slate">
          Try describing what's going on with your vehicle, like a noise, a warning light, or
          something that doesn't feel right when you drive.
        </p>
      </motion.div>
    )
  }

  // Carries the estimate over to the booking page: the matched service arrives
  // preselected, the vehicle fields prefilled, and diagnosisRequestId travels
  // with the booking so the backend marks the estimate converted in the same
  // transaction. A result with no suggested service still books; it just opens
  // with nothing selected rather than an empty chip.
  const bookingState = {
    prefill: {
      serviceIds: result.suggestedServiceId ? [result.suggestedServiceId] : [],
      vehicle,
      diagnosisRequestId: result.id,
    },
  }

  const containerClasses = isLowConfidence
    ? 'bg-surface border border-line-strong'
    : 'bg-teal-soft border border-teal'

  const circleClasses = isLowConfidence ? 'bg-slate' : 'bg-teal'

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={`rounded-xl shadow-card p-6 sm:p-8 ${containerClasses}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 ${circleClasses}`}
        >
          {isLowConfidence ? <Info className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </span>
        <p className="text-navy">
          <span className="text-muted">Likely issue:</span>{' '}
          <span className="font-bold">{result.matchedIssue}</span>
        </p>
      </div>

      <p className="mt-4 text-slate">{result.summary}</p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 border border-line">
          <span className="text-eyebrow uppercase text-muted">Estimated cost</span>
          <p className="mt-1 font-bold text-navy text-lg">
            ${result.estCostMin} – ${result.estCostMax}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-line">
          <span className="text-eyebrow uppercase text-muted">Estimated time</span>
          <p className="mt-1 font-bold text-navy text-lg">
            {formatHourRange(result.estTimeMinHours, result.estTimeMaxHours)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">
        This range covers everything from a minor check to a more involved repair within this
        type of issue. Your mechanic will narrow it down once they take a look.
      </p>

      <Button
        variant="dark"
        as="link"
        to="/booking"
        className="w-full mt-6"
        state={bookingState}
      >
        Book This Service
      </Button>

      <p className="mt-4 text-sm text-muted">
        This is an estimate, not a confirmed diagnosis. Your mechanic will confirm the issue
        before any work starts.
      </p>
    </motion.div>
  )
}

export default DiagnosisResultCard
