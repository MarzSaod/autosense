import { useState } from 'react'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Section from '../components/layout/Section.jsx'
import Card from '../components/ui/Card.jsx'
import FormField from '../components/ui/FormField.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import { cancelBooking, lookupBooking } from '../api/bookings.js'

const EMPTY_VALUES = { referenceId: '', email: '' }

const NOT_FOUND_MESSAGE = 'No booking found with that reference number and email.'

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Only an appointment that is still going to happen can be called off.
const CANCELLABLE_STATUSES = ['pending', 'confirmed']

const CANCEL_PROMPT =
  'Are you sure you want to cancel this appointment? This cannot be undone.'

function formatLongDate(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number)
  if (!year || !month || !day) return dateKey
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTimeLabel(time24) {
  const [hourStr, minuteStr] = String(time24).split(':')
  const hour = Number(hourStr)
  if (Number.isNaN(hour)) return time24
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function formatDuration(minutes) {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}

function validate(values) {
  const errors = {}

  if (!values.referenceId.trim()) {
    errors.referenceId = 'Enter the reference number from your booking.'
  }

  if (!values.email.trim()) {
    errors.email = 'Enter a valid email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  return errors
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="font-semibold text-navy text-right">{children}</span>
    </div>
  )
}

function BookingLookup() {
  const [values, setValues] = useState(EMPTY_VALUES)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [booking, setBooking] = useState(null)
  // Cancelling asks first, inline rather than through a browser dialog, so the
  // question is part of the page and cannot be dismissed by reflex.
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)

  const errors = validate(values)

  function fieldError(field) {
    return touched[field] || submitted ? errors[field] : undefined
  }

  function handleChange(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setLookupError(null)

    if (Object.keys(validate(values)).length > 0) {
      return
    }

    setLoading(true)
    setBooking(null)
    setConfirmingCancel(false)
    setCancelError(null)

    try {
      const found = await lookupBooking({
        referenceId: values.referenceId.trim(),
        email: values.email.trim(),
      })
      setBooking(found)
    } catch (error) {
      // 404 is the ordinary "those two do not go together" case and gets the
      // plain message; anything else is a real failure worth repeating.
      setLookupError(
        error?.status === 404
          ? NOT_FOUND_MESSAGE
          : error?.message || 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)

    try {
      const response = await cancelBooking({
        referenceId: booking.referenceId,
        email: values.email.trim(),
      })
      // Show the cancelled booking in place rather than clearing the card, so
      // the customer can see which appointment is now off.
      setBooking((prev) => ({ ...prev, status: response.booking.status }))
      setConfirmingCancel(false)
    } catch (error) {
      setCancelError(error?.message || 'Something went wrong. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  const serviceNames = (booking?.services || []).map((service) => service.name)
  const duration = formatDuration(booking?.totalDuration)
  const isCancelled = booking?.status === 'cancelled'
  const canCancel = booking ? CANCELLABLE_STATUSES.includes(booking.status) : false

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="Check My Booking"
          title="Find your appointment"
          subtitle="Enter the reference number from your booking along with the email you used, and we'll pull up the details."
        />
      </Section>

      <Section surface="white">
        <div className="max-w-[560px] mx-auto flex flex-col gap-8">
          <Card padding="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
              <FormField
                id="lookup-reference"
                label="Reference number"
                hint="Looks like AS-4K7B2Q."
                error={fieldError('referenceId')}
              >
                <Input
                  value={values.referenceId}
                  placeholder="AS-XXXXXX"
                  autoComplete="off"
                  onChange={(event) => handleChange('referenceId', event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, referenceId: true }))}
                  error={Boolean(fieldError('referenceId'))}
                />
              </FormField>

              <FormField id="lookup-email" label="Email address" error={fieldError('email')}>
                <Input
                  type="email"
                  value={values.email}
                  autoComplete="email"
                  onChange={(event) => handleChange('email', event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  error={Boolean(fieldError('email'))}
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={loading}
                disabled={loading}
              >
                Find My Booking
              </Button>

              {lookupError && (
                <p role="alert" className="text-sm text-red-500">
                  {lookupError}
                </p>
              )}
            </form>
          </Card>

          {booking && (
            <div className="w-full bg-surface border border-line/60 rounded-xl shadow-card p-6 text-left flex flex-col gap-3">
              <DetailRow label="Reference">{booking.referenceId}</DetailRow>

              <DetailRow label="Status">
                {isCancelled ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-sm font-semibold text-red-600">
                    Cancelled
                  </span>
                ) : (
                  STATUS_LABELS[booking.status] || booking.status
                )}
              </DetailRow>

              {serviceNames.length > 0 && (
                <DetailRow label="Services">{serviceNames.join(', ')}</DetailRow>
              )}

              <DetailRow label="Vehicle">
                {booking.vehicle.year} {booking.vehicle.make} {booking.vehicle.model}
              </DetailRow>

              <DetailRow label="Date">{formatLongDate(booking.appointmentDate)}</DetailRow>

              <DetailRow label="Time">{formatTimeLabel(booking.appointmentTime)}</DetailRow>

              {duration && <DetailRow label="Length">{duration}</DetailRow>}

              <DetailRow label="Name">{booking.contact.fullName}</DetailRow>

              <DetailRow label="Email">{booking.contact.email}</DetailRow>

              {booking.contact.phone && (
                <DetailRow label="Phone">{booking.contact.phone}</DetailRow>
              )}

              {canCancel && (
                <div className="border-t border-line/60 pt-4 mt-1 flex flex-col gap-3">
                  {confirmingCancel ? (
                    <>
                      <p className="text-sm text-navy font-semibold">{CANCEL_PROMPT}</p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={cancelling}
                          className="inline-flex items-center justify-center h-11 px-5 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
                        </button>
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmingCancel(false)}
                          disabled={cancelling}
                        >
                          Keep my appointment
                        </Button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(true)}
                      className="inline-flex items-center justify-center h-11 px-5 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                    >
                      Cancel This Booking
                    </button>
                  )}

                  {cancelError && (
                    <p role="alert" className="text-sm text-red-500">
                      {cancelError}
                    </p>
                  )}
                </div>
              )}

              {isCancelled && (
                <p className="border-t border-line/60 pt-4 mt-1 text-sm text-muted">
                  This appointment has been cancelled. Book again anytime from the Book Now
                  page.
                </p>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

export default BookingLookup
