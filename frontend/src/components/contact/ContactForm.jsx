import { useState } from 'react'
import { motion } from 'framer-motion'
import FormField from '../ui/FormField.jsx'
import Input from '../ui/Input.jsx'
import Textarea from '../ui/Textarea.jsx'
import Button from '../ui/Button.jsx'
import { Check } from '../ui/Icon.jsx'
import { scaleIn, useReducedMotionSafe } from '../../motion/presets.js'

const EMPTY_VALUES = { fullName: '', email: '', message: '' }

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
  const successVariants = useReducedMotionSafe(scaleIn)

  const errors = validate(values)

  function fieldError(field) {
    return touched[field] || submitted ? errors[field] : undefined
  }

  function handleChange(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  function handleBlur(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length > 0) {
      return
    }
    setStatus('sending')
    await new Promise((resolve) => setTimeout(resolve, 700))
    setStatus('sent')
  }

  function resetForm() {
    setValues(EMPTY_VALUES)
    setTouched({})
    setSubmitted(false)
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FormField id="contact-full-name" label="Full name" error={fieldError('fullName')}>
        <Input
          placeholder="Jane Doe"
          value={values.fullName}
          onChange={(event) => handleChange('fullName', event.target.value)}
          onBlur={() => handleBlur('fullName')}
          error={Boolean(fieldError('fullName'))}
        />
      </FormField>

      <FormField id="contact-email" label="Email address" error={fieldError('email')}>
        <Input
          type="email"
          placeholder="jane@example.com"
          value={values.email}
          onChange={(event) => handleChange('email', event.target.value)}
          onBlur={() => handleBlur('email')}
          error={Boolean(fieldError('email'))}
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
