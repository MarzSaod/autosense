import { useState } from 'react'
import { motion } from 'framer-motion'
import FormField from '../ui/FormField.jsx'
import Input from '../ui/Input.jsx'
import Textarea from '../ui/Textarea.jsx'
import Button from '../ui/Button.jsx'
import { Check } from '../ui/Icon.jsx'
import { scaleIn, useReducedMotionSafe } from '../../motion/presets.js'
import { sendContactMessage } from '../../api/contact.js'

const EMPTY_VALUES = { fullName: '', email: '', phone: '', message: '' }

function validate(values) {
  const errors = {}

  if (!values.fullName.trim()) {
    errors.fullName = 'Required.'
  }

  if (!values.email.trim()) {
    errors.email = 'Enter a valid email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  // Phone is optional; only a filled-in one is checked, matching the rule the
  // booking form and the backend both apply.
  if (values.phone.trim() && values.phone.replace(/\D/g, '').length < 7) {
    errors.phone = 'Enter a valid phone number.'
  }

  if (!values.message || values.message.trim().length < 10) {
    errors.message = 'Enter at least 10 characters so we know how to help.'
  }

  return errors
}

function ContactForm() {
  const [values, setValues] = useState(EMPTY_VALUES)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState('form')
  const [submitError, setSubmitError] = useState(null)
  // Set when the server rejects a field the client thought was fine.
  const [serverFieldError, setServerFieldError] = useState(null)
  const successVariants = useReducedMotionSafe(scaleIn)

  const errors = validate(values)

  function fieldError(field) {
    if (serverFieldError?.field === field) {
      return serverFieldError.message
    }
    return touched[field] || submitted ? errors[field] : undefined
  }

  function handleChange(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Editing the field the server complained about clears that complaint.
    if (serverFieldError?.field === field) {
      setServerFieldError(null)
    }
  }

  function handleBlur(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setSubmitError(null)
    setServerFieldError(null)

    if (Object.keys(validate(values)).length > 0) {
      return
    }

    setStatus('sending')

    try {
      await sendContactMessage({
        name: values.fullName,
        email: values.email,
        phone: values.phone,
        message: values.message,
      })
      setStatus('sent')
    } catch (error) {
      setStatus('form')

      // The backend names the field it rejected; show the message there as
      // well as at the top, so the customer can see what to change.
      const field = error?.field === 'name' ? 'fullName' : error?.field
      if (field && Object.keys(EMPTY_VALUES).includes(field)) {
        setServerFieldError({
          field,
          message: error.fieldMessage || error.message,
        })
      }

      setSubmitError(error?.message || 'Something went wrong. Please try again.')
    }
  }

  function resetForm() {
    setValues(EMPTY_VALUES)
    setTouched({})
    setSubmitted(false)
    setSubmitError(null)
    setServerFieldError(null)
    setStatus('form')
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <motion.span
          variants={successVariants}
          initial="hidden"
          animate="visible"
          className="h-14 w-14 rounded-full bg-teal text-white flex items-center justify-center"
        >
          <Check className="h-7 w-7" />
        </motion.span>
        <h3 className="text-2xl font-bold text-navy">Message sent</h3>
        <p className="text-slate">
          Thanks for reaching out. We&apos;ll get back to you within one business day.
        </p>
        <Button variant="ghost" onClick={resetForm}>
          Send another message
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <FormField id="contact-full-name" label="Full name" error={fieldError('fullName')}>
        <Input
          value={values.fullName}
          onChange={(event) => handleChange('fullName', event.target.value)}
          onBlur={() => handleBlur('fullName')}
          error={Boolean(fieldError('fullName'))}
        />
      </FormField>

      <FormField id="contact-email" label="Email address" error={fieldError('email')}>
        <Input
          type="email"
          value={values.email}
          onChange={(event) => handleChange('email', event.target.value)}
          onBlur={() => handleBlur('email')}
          error={Boolean(fieldError('email'))}
        />
      </FormField>

      <FormField
        id="contact-phone"
        label="Phone number"
        hint="Optional, if you would rather we called."
        error={fieldError('phone')}
      >
        <Input
          type="tel"
          value={values.phone}
          onChange={(event) => handleChange('phone', event.target.value)}
          onBlur={() => handleBlur('phone')}
          error={Boolean(fieldError('phone'))}
        />
      </FormField>

      <FormField id="contact-message" label="Your message" error={fieldError('message')}>
        <Textarea
          rows={5}
          placeholder="How can we help?"
          value={values.message}
          onChange={(event) => handleChange('message', event.target.value)}
          onBlur={() => handleBlur('message')}
          error={Boolean(fieldError('message'))}
        />
      </FormField>

      {submitError && (
        <p role="alert" className="text-sm text-red-500">
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={status === 'sending'}
        disabled={status === 'sending'}
      >
        Send Message
      </Button>
    </form>
  )
}

export default ContactForm
