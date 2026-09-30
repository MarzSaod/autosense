import FormField from '../ui/FormField.jsx'
import Input from '../ui/Input.jsx'
import BookingSectionHeader from './BookingSectionHeader.jsx'

function ContactSection({ values, errors, onChange, onBlur }) {
  return (
    <div className="flex flex-col gap-4">
      <BookingSectionHeader number={3} title="Your contact info" />

      <div className="flex flex-col gap-4">
        <FormField id="booking-full-name" label="Full name" error={errors.fullName}>
          <Input
            value={values.fullName}
            onChange={(event) => onChange('fullName', event.target.value)}
            onBlur={() => onBlur('fullName')}
            error={Boolean(errors.fullName)}
          />
        </FormField>
        <FormField id="booking-email" label="Email address" error={errors.email}>
          <Input
            type="email"
            value={values.email}
            onChange={(event) => onChange('email', event.target.value)}
            onBlur={() => onBlur('email')}
            error={Boolean(errors.email)}
          />
        </FormField>
        <FormField id="booking-phone" label="Phone number" error={errors.phone}>
          <Input
            type="tel"
            value={values.phone}
            onChange={(event) => onChange('phone', event.target.value)}
            onBlur={() => onBlur('phone')}
            error={Boolean(errors.phone)}
          />
        </FormField>
      </div>
    </div>
  )
}

export default ContactSection
