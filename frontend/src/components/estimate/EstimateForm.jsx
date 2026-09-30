import { useState } from 'react'
import FormField from '../ui/FormField.jsx'
import Textarea from '../ui/Textarea.jsx'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'

const CURRENT_YEAR = new Date().getFullYear()

function validate(values) {
  const errors = {}

  if (!values.description || values.description.trim().length < 10) {
    errors.description = 'Tell us a bit more about the problem so we can match it properly.'
  }

  if (values.year) {
    const trimmedYear = values.year.trim()
    const yearNumber = Number(trimmedYear)
    const isFourDigits = /^\d{4}$/.test(trimmedYear)
    if (!isFourDigits || yearNumber < 1980 || yearNumber > CURRENT_YEAR + 1) {
      errors.year = 'Enter a valid year.'
    }
  }

  return errors
}

function EstimateForm({ onSubmit, submitting }) {
  const [values, setValues] = useState({ description: '', make: '', model: '', year: '' })
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)

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
    await onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FormField
        id="description"
        label="What's happening with your car?"
        error={fieldError('description')}
      >
        <Textarea
          rows={4}
          placeholder="There's a grinding noise when I brake, mostly in the mornings..."
          value={values.description}
          onChange={(event) => handleChange('description', event.target.value)}
          onBlur={() => handleBlur('description')}
          error={Boolean(fieldError('description'))}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField id="make" label="Make">
          <Input
            placeholder="Honda"
            value={values.make}
            onChange={(event) => handleChange('make', event.target.value)}
            onBlur={() => handleBlur('make')}
          />
        </FormField>
        <FormField id="model" label="Model">
          <Input
            placeholder="Civic"
            value={values.model}
            onChange={(event) => handleChange('model', event.target.value)}
            onBlur={() => handleBlur('model')}
          />
        </FormField>
        <FormField id="year" label="Year" error={fieldError('year')}>
          <Input
            placeholder="2018"
            value={values.year}
            onChange={(event) => handleChange('year', event.target.value)}
            onBlur={() => handleBlur('year')}
            error={Boolean(fieldError('year'))}
          />
        </FormField>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={submitting}
      >
        Get My Estimate
      </Button>
    </form>
  )
}

export default EstimateForm
