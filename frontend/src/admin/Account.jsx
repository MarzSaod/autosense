import { useState } from 'react'
import Card from '../components/ui/Card.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import FormField from '../components/ui/FormField.jsx'
import { changePassword } from '../api/admin.js'
import { useAuth } from './AuthContext.jsx'

function PasswordToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-navy transition-colors"
      onClick={onToggle}
      tabIndex={-1}
    >
      {visible ? 'Hide' : 'Show'}
    </button>
  )
}

function Account() {
  const { refreshUser } = useAuth()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate(fields) {
    const f = fields || { current, newPw, confirm }
    const next = {}
    if (!f.current) next.current = 'Current password is required.'
    if (!f.newPw) next.newPw = 'New password is required.'
    else if (f.newPw.length < 10) next.newPw = 'Must be at least 10 characters.'
    if (!f.confirm) next.confirm = 'Please confirm your new password.'
    else if (f.newPw && f.confirm !== f.newPw) next.confirm = 'Passwords do not match.'
    return next
  }

  function handleChange(field, value) {
    setServerError('')
    setSuccess('')
    if (field === 'current') setCurrent(value)
    if (field === 'newPw') setNewPw(value)
    if (field === 'confirm') setConfirm(value)

    if (touched[field]) {
      const updated = { current, newPw, confirm, [field]: value }
      setErrors(validate(updated))
    }
  }

  function handleBlur(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors(validate())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ current: true, newPw: true, confirm: true })
    const v = validate()
    setErrors(v)
    if (Object.keys(v).length > 0) return

    setSubmitting(true)
    setServerError('')
    setSuccess('')
    try {
      await changePassword(current, newPw)
      setCurrent('')
      setNewPw('')
      setConfirm('')
      setTouched({})
      setErrors({})
      setSuccess('Password changed successfully.')
      await refreshUser()
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy mb-6">Account</h1>
      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-navy">Change Password</h2>

          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {serverError}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <FormField id="current-password" label="Current password" error={touched.current ? errors.current : undefined}>
            <div className="relative">
              <Input
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={(e) => handleChange('current', e.target.value)}
                onBlur={() => handleBlur('current')}
                error={touched.current && !!errors.current}
                className="pr-14"
              />
              <PasswordToggle visible={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
            </div>
          </FormField>

          <FormField id="new-password" label="New password" error={touched.newPw ? errors.newPw : undefined} hint="At least 10 characters">
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => handleChange('newPw', e.target.value)}
                onBlur={() => handleBlur('newPw')}
                error={touched.newPw && !!errors.newPw}
                className="pr-14"
              />
              <PasswordToggle visible={showNew} onToggle={() => setShowNew((v) => !v)} />
            </div>
          </FormField>

          <FormField id="confirm-password" label="Confirm new password" error={touched.confirm ? errors.confirm : undefined}>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => handleChange('confirm', e.target.value)}
                onBlur={() => handleBlur('confirm')}
                error={touched.confirm && !!errors.confirm}
                className="pr-14"
              />
              <PasswordToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
            </div>
          </FormField>

          <Button type="submit" loading={submitting} disabled={submitting} className="w-full sm:w-auto">
            Save New Password
          </Button>
        </form>
      </Card>
    </>
  )
}

export default Account
