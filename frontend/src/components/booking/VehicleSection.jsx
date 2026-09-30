import FormField from '../ui/FormField.jsx'
import Input from '../ui/Input.jsx'
import BookingSectionHeader from './BookingSectionHeader.jsx'

function VehicleSection({ values, errors, onChange, onBlur }) {
  return (
    <div className="flex flex-col gap-4">
      <BookingSectionHeader number={2} title="Your vehicle" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField id="booking-make" label="Make" error={errors.make}>
          <Input
            placeholder="Honda"
            value={values.make}
            onChange={(event) => onChange('make', event.target.value)}
            onBlur={() => onBlur('make')}
            error={Boolean(errors.make)}
          />
        </FormField>
        <FormField id="booking-model" label="Model" error={errors.model}>
          <Input
            placeholder="Civic"
            value={values.model}
            onChange={(event) => onChange('model', event.target.value)}
            onBlur={() => onBlur('model')}
            error={Boolean(errors.model)}
          />
        </FormField>
        <FormField id="booking-year" label="Year" error={errors.year}>
          <Input
            placeholder="2018"
            value={values.year}
            onChange={(event) => onChange('year', event.target.value)}
            onBlur={() => onBlur('year')}
            error={Boolean(errors.year)}
          />
        </FormField>
      </div>
    </div>
  )
}

export default VehicleSection
