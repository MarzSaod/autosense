import Card from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimeLabel(time24) {
  const [hourStr, minuteStr] = time24.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function BookingSummary({
  services,
  formState,
  date,
  time,
  canSubmit,
  submitting,
  submitError,
  onSubmit,
}) {
  const selectedServices = (services || []).filter((service) =>
    formState.serviceIds.includes(service.id),
  )
  const hasVehicle = formState.make.trim() && formState.model.trim() && formState.year.trim()

  const rows = []

  if (selectedServices.length > 0) {
    rows.push({
      label: 'Services',
      value: selectedServices.map((service) => service.name).join(', '),
    })
  }

  if (hasVehicle) {
    rows.push({
      label: 'Vehicle',
      value: `${formState.year} ${formState.make} ${formState.model}`,
    })
  }

  if (date) {
    rows.push({ label: 'Date', value: formatShortDate(date) })
  }

  if (time) {
    rows.push({ label: 'Time', value: formatTimeLabel(time) })
  }

  return (
    <div className="mt-12 max-w-[600px]">
      {rows.length > 0 && (
        <Card padding="p-6" className="flex flex-col gap-3 mb-6">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">{row.label}</span>
              <span className="font-semibold text-navy text-right">{row.value}</span>
            </div>
          ))}
        </Card>
      )}

      {submitError && (
        <p role="alert" className="mb-4 text-sm font-semibold text-red-600">
          {submitError}
        </p>
      )}

      <Button
        variant="dark"
        className={`w-full ${!canSubmit ? 'opacity-50' : ''}`}
        loading={submitting}
        disabled={submitting}
        onClick={onSubmit}
      >
        Confirm Appointment
      </Button>
    </div>
  )
}

export default BookingSummary
