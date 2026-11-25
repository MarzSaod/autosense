import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Section from '../components/layout/Section.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Card from '../components/ui/Card.jsx'
import FormField from '../components/ui/FormField.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import { Check, Clock, Close } from '../components/ui/Icon.jsx'
import { scaleIn, useReducedMotionSafe } from '../motion/presets.js'
import { lookupBooking } from '../api/bookingLookup.js'

const STATUS_CONFIG = {
  pending: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: Clock,
    heading: 'Waiting for confirmation',
    description: 'Your appointment request has been received. The shop will review and confirm it shortly.',
  },
  confirmed: {
    bg: 'bg-teal',
    text: 'text-white',
    icon: Check,
    heading: 'Your appointment is confirmed',
    description: "You're all set. Please arrive about 10 minutes before your scheduled time.",
  },
  completed: {
    bg: 'bg-surface',
    text: 'text-muted',
    icon: Check,
    heading: 'Appointment completed',
    description: 'Thanks for visiting AutoSense. We hope to see you again.',
  },
  cancelled: {
    bg: '',
    text: '',
    icon: Close,
    heading: 'This appointment was cancelled',
    description: "If you didn't request this cancellation, please contact the shop.",
  },
}

const STEPS = ['pending', 'confirmed', 'completed']

function formatFullDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  if (!year || !month || !day) return dateStr
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime12(time24) {
  const [hourStr, minuteStr] = String(time24).split(':')
  const hour = Number(hourStr)
  if (Number.isNaN(hour)) return time24
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function StatusBanner({ status }) {
  const config = STATUS_CONFIG[status]
  if (!config) return null

  const Icon = config.icon
  const isCancelled = status === 'cancelled'

  return (
    <div
      className={`rounded-t-xl px-6 py-5 flex items-start gap-3 ${isCancelled ? '' : config.bg} ${isCancelled ? '' : config.text}`}
      style={isCancelled ? { backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, white)', color: 'var(--color-danger)' } : undefined}
    >
      <Icon className="h-6 w-6 shrink-0 mt-0.5" />
      <div>
        <h3 className="text-lg font-bold">{config.heading}</h3>
        <p className="text-sm mt-1 opacity-90">{config.description}</p>
      </div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="font-semibold text-navy text-right">{children}</span>
    </div>
  )
}

function ProgressIndicator({ status }) {
  const isCancelled = status === 'cancelled'
  const activeIndex = STEPS.indexOf(status)

  function dotColor(step, index) {
    if (isCancelled) return 'border-2 border-line bg-white'
    if (index > activeIndex) return 'border-2 border-line bg-white'
    if (step === 'pending') return 'bg-amber-400 border-2 border-amber-400'
    if (step === 'confirmed') return 'bg-teal border-2 border-teal'
    if (step === 'completed') return 'bg-emerald-500 border-2 border-emerald-500'
    return 'border-2 border-line bg-white'
  }

  function lineColor(index) {
    if (isCancelled) return 'bg-line'
    if (index < activeIndex) return 'bg-teal'
    return 'bg-line'
  }

  return (
    <div className="px-6 py-5 border-t border-line/60">
      <div className="flex items-center justify-between relative">
        {STEPS.map((step, i) => (
          <div key={step} className="flex flex-col items-center z-10" style={{ flex: '0 0 auto' }}>
            <div className={`h-4 w-4 rounded-full ${dotColor(step, i)}`} />
            <span className="text-xs text-muted mt-1.5 capitalize">{step}</span>
          </div>
        ))}
        {isCancelled && (
          <div className="flex flex-col items-center z-10" style={{ flex: '0 0 auto' }}>
            <div className="h-4 w-4 rounded-full border-2" style={{ borderColor: 'var(--color-danger)', backgroundColor: 'var(--color-danger)' }} />
            <span className="text-xs mt-1.5 capitalize" style={{ color: 'var(--color-danger)' }}>cancelled</span>
          </div>
        )}
      </div>
      <div className="flex items-center mt-0 absolute" style={{ left: 0, right: 0, top: 0 }}>
      </div>
      <div className="flex items-center -mt-[22px] px-2 mx-6">
        {Array.from({ length: isCancelled ? STEPS.length : STEPS.length - 1 }, (_, i) => (
          <div key={i} className={`h-0.5 flex-1 ${lineColor(i)}`} />
        ))}
      </div>
    </div>
  )
}

function BookingStatus() {
  const [email, setEmail] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const resultRef = useRef(null)
  const variants = useReducedMotionSafe(scaleIn)

  const errors = {}
  if (!email.trim()) errors.email = 'Email is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!referenceId.trim()) errors.referenceId = 'Reference ID is required.'

  function fieldError(field) {
    return touched[field] || submitted ? errors[field] : undefined
  }

  useEffect(() => {
    if (booking && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [booking])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    setNotFound(false)
    setBooking(null)

    try {
      const result = await lookupBooking(email.trim(), referenceId.trim())
      if (result) {
        setBooking(result)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setEmail('')
    setReferenceId('')
    setTouched({})
    setSubmitted(false)
    setBooking(null)
    setNotFound(false)
  }

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="BOOKING STATUS"
          title="Check your appointment"
          subtitle="Enter your email and the reference ID from your booking confirmation to see where things stand."
        />
      </Section>

      <Section surface="white">
        <div className="max-w-[500px] mx-auto flex flex-col gap-8">
          {!booking ? (
            <Card padding="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
                <FormField id="status-email" label="Email Address" error={fieldError('email')}>
                  <Input
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (touched.email) setTouched((t) => ({ ...t, email: true }))
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    error={Boolean(fieldError('email'))}
                  />
                </FormField>

                <FormField id="status-ref" label="Reference ID" error={fieldError('referenceId')}>
                  <Input
                    value={referenceId}
                    placeholder="AS-XXXXX"
                    autoComplete="off"
                    onChange={(e) => {
                      setReferenceId(e.target.value)
                      if (touched.referenceId) setTouched((t) => ({ ...t, referenceId: true }))
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, referenceId: true }))}
                    error={Boolean(fieldError('referenceId'))}
                  />
                </FormField>

                <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={loading}>
                  Look Up Booking
                </Button>

                {notFound && (
                  <p className="text-sm text-muted text-center">
                    We couldn&apos;t find a booking with that information. Double-check your email and reference ID and try again.
                  </p>
                )}
              </form>
            </Card>
          ) : (
            <motion.div
              ref={resultRef}
              variants={variants}
              initial="hidden"
              animate="visible"
            >
              <div className="rounded-xl shadow-card bg-white border border-line/60 overflow-hidden">
                <StatusBanner status={booking.status} />

                <div className="px-6 py-5 flex flex-col gap-3">
                  <DetailRow label="Reference ID">
                    <span className="font-bold">{booking.referenceId}</span>
                  </DetailRow>
                  <DetailRow label="Date">{formatFullDate(booking.appointmentDate)}</DetailRow>
                  <DetailRow label="Time">{formatTime12(booking.appointmentTime)}</DetailRow>
                  <DetailRow label="Vehicle">{booking.vehicle}</DetailRow>
                  <DetailRow label="Services">{(booking.services || []).join(', ')}</DetailRow>
                </div>

                <ProgressIndicator status={booking.status} />
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
                <Button variant="secondary" onClick={handleReset}>
                  Look up another booking
                </Button>
                <Button as="link" to="/booking">
                  Book another appointment
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </Section>
    </div>
  )
}

export default BookingStatus
