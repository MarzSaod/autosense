import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Section from '../components/layout/Section.jsx'
import ServiceSelect from '../components/booking/ServiceSelect.jsx'
import VehicleSection from '../components/booking/VehicleSection.jsx'
import ContactSection from '../components/booking/ContactSection.jsx'
import Calendar from '../components/booking/Calendar.jsx'
import TimeSlotPicker from '../components/booking/TimeSlotPicker.jsx'
import BookingSummary from '../components/booking/BookingSummary.jsx'
import BookingConfirmation from '../components/booking/BookingConfirmation.jsx'
import { getServices } from '../api/services.js'
import { SLOT_TAKEN, createBooking } from '../api/bookings.js'
import useApi from '../hooks/useApi.js'

const CURRENT_YEAR = new Date().getFullYear()

const EMPTY_FORM_STATE = {
  serviceIds: [],
  make: '',
  model: '',
  year: '',
  fullName: '',
  email: '',
  phone: '',
}

const FIELD_ELEMENT_IDS = {
  serviceIds: 'booking-services-section',
  make: 'booking-make',
  model: 'booking-model',
  year: 'booking-year',
  fullName: 'booking-full-name',
  email: 'booking-email',
  phone: 'booking-phone',
  date: 'booking-date-section',
  time: 'booking-time-section',
}

const FIELD_ORDER = ['serviceIds', 'make', 'model', 'year', 'fullName', 'email', 'phone']

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function validate(values) {
  const errors = {}

  if (values.serviceIds.length === 0) {
    errors.serviceIds = 'Pick at least one service.'
  }

  if (!values.make.trim()) {
    errors.make = 'Required.'
  }

  if (!values.model.trim()) {
    errors.model = 'Required.'
  }

  if (!values.year.trim()) {
    errors.year = 'Enter a valid year.'
  } else {
    const trimmedYear = values.year.trim()
    const yearNumber = Number(trimmedYear)
    const isFourDigits = /^\d{4}$/.test(trimmedYear)
    if (!isFourDigits || yearNumber < 1980 || yearNumber > CURRENT_YEAR + 1) {
      errors.year = 'Enter a valid year.'
    }
  }

  if (!values.fullName.trim()) {
    errors.fullName = 'Required.'
  }

  if (!values.email.trim()) {
    errors.email = 'Enter a valid email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (values.phone.trim()) {
    const digitCount = values.phone.replace(/\D/g, '').length
    if (digitCount < 7) {
      errors.phone = 'Enter a valid phone number.'
    }
  }

  return errors
}

function Booking() {
  const location = useLocation()
  const [formState, setFormState] = useState(EMPTY_FORM_STATE)
  const [diagnosisRequestId, setDiagnosisRequestId] = useState(null)
  const [touched, setTouched] = useState({})
  const [date, setDate] = useState(null)
  const [time, setTime] = useState(null)
  const [status, setStatus] = useState('form')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // Bumped when a confirm loses a race, to force the pickers to re-read
  // availability so the slot that was just taken stops showing as open.
  const [availabilityVersion, setAvailabilityVersion] = useState(0)
  const [confirmation, setConfirmation] = useState(null)

  const { data: services } = useApi(getServices, [])

  useEffect(() => {
    const prefill = location.state?.prefill
    if (prefill) {
      setFormState((prev) => ({
        ...prev,
        serviceIds: prefill.serviceIds || [],
        make: prefill.vehicle?.make || '',
        model: prefill.vehicle?.model || '',
        year: prefill.vehicle?.year || '',
      }))
      if (prefill.diagnosisRequestId) {
        setDiagnosisRequestId(prefill.diagnosisRequestId)
      }
    }
  }, [])

  const errors = validate(formState)
  const canSubmit = Object.keys(errors).length === 0 && Boolean(date) && Boolean(time)

  function fieldError(field) {
    return touched[field] ? errors[field] : undefined
  }

  function updateField(field, value) {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  function markTouched(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function toggleService(id) {
    setTouched((prev) => ({ ...prev, serviceIds: true }))
    setFormState((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter((existing) => existing !== id)
        : [...prev.serviceIds, id],
    }))
  }

  function handleSelectDate(nextDate) {
    setDate(nextDate)
    setTime(null)
    setSubmitError(null)
  }

  function handleSelectTime(nextTime) {
    setTime(nextTime)
    setSubmitError(null)
  }

  function focusField(field) {
    const elementId = FIELD_ELEMENT_IDS[field]
    const element = elementId && document.getElementById(elementId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus({ preventScroll: true })
    }
  }

  async function handleConfirm() {
    setTouched(
      FIELD_ORDER.reduce((acc, field) => {
        acc[field] = true
        return acc
      }, {}),
    )

    const formErrors = validate(formState)
    const firstInvalidField = FIELD_ORDER.find((field) => formErrors[field])

    if (firstInvalidField) {
      focusField(firstInvalidField)
      return
    }

    if (!date) {
      focusField('date')
      return
    }

    if (!time) {
      focusField('time')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const payload = {
      serviceIds: formState.serviceIds,
      vehicle: { make: formState.make, model: formState.model, year: formState.year },
      contact: {
        fullName: formState.fullName,
        email: formState.email,
        phone: formState.phone,
      },
      date: formatDateKey(date),
      time,
      ...(diagnosisRequestId ? { diagnosisRequestId } : {}),
    }

    try {
      const response = await createBooking(payload)
      setConfirmation(response)
      setStatus('confirmed')
    } catch (error) {
      // A slot taken in the meantime is not the customer's mistake: say so and
      // send them back to the time picker, rather than showing a generic
      // failure as if the form were wrong.
      if (error?.reason === SLOT_TAKEN) {
        setSubmitError(
          'That time was just booked by someone else. Please pick another time.',
        )
        setTime(null)
        setAvailabilityVersion((version) => version + 1)
        focusField('time')
      } else {
        setSubmitError(error?.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function resetBooking() {
    setFormState(EMPTY_FORM_STATE)
    setDiagnosisRequestId(null)
    setTouched({})
    setDate(null)
    setTime(null)
    setSubmitError(null)
    setAvailabilityVersion(0)
    setConfirmation(null)
    setStatus('form')
  }

  if (status === 'confirmed' && confirmation) {
    const serviceNames = (services || [])
      .filter((service) => confirmation.serviceIds.includes(service.id))
      .map((service) => service.name)

    return (
      <div>
        <Section surface="white" size="lg">
          <BookingConfirmation
            confirmation={confirmation}
            serviceNames={serviceNames}
            onBookAnother={resetBooking}
          />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="Booking"
          title="Book your appointment"
          subtitle="Pick your services, choose a time that works, and you're set."
        />
      </Section>

      <Section surface="white">
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-10 items-start">
          <div className="flex flex-col gap-10">
            <ServiceSelect
              selectedIds={formState.serviceIds}
              onToggle={toggleService}
              error={fieldError('serviceIds')}
            />
            <VehicleSection
              values={formState}
              errors={{
                make: fieldError('make'),
                model: fieldError('model'),
                year: fieldError('year'),
              }}
              onChange={updateField}
              onBlur={markTouched}
            />
            <ContactSection
              values={formState}
              errors={{
                fullName: fieldError('fullName'),
                email: fieldError('email'),
                phone: fieldError('phone'),
              }}
              onChange={updateField}
              onBlur={markTouched}
            />
          </div>

          <div className="flex flex-col gap-10">
            <Calendar
              selectedDate={date}
              onSelectDate={handleSelectDate}
              serviceIds={formState.serviceIds}
              refreshKey={availabilityVersion}
            />
            <TimeSlotPicker
              date={date}
              time={time}
              onSelectTime={handleSelectTime}
              serviceIds={formState.serviceIds}
              refreshKey={availabilityVersion}
            />
          </div>
        </div>

        <BookingSummary
          services={services}
          formState={formState}
          date={date}
          time={time}
          canSubmit={canSubmit}
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleConfirm}
        />
      </Section>
    </div>
  )
}

export default Booking
