import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import Card from '../components/ui/Card.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import FormField from '../components/ui/FormField.jsx'
import { useAuth } from './AuthContext.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Login() {
  const { user, loading: authLoading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authLoading) return null
  if (user) return <Navigate to="/admin" replace />

  function validate(fields = { email, password }) {
    const next = {}
    if (!fields.email.trim()) next.email = 'Email is required.'
    else if (!EMAIL_PATTERN.test(fields.email.trim())) next.email = 'Enter a valid email address.'
    if (!fields.password) next.password = 'Password is required.'
    return next
  }

  function handleEmailChange(e) {
    setEmail(e.target.value)
    setServerError('')
    if (touched.email) {
      setErrors((prev) => {
        const next = { ...prev }
        if (!e.target.value.trim()) next.email = 'Email is required.'
        else if (!EMAIL_PATTERN.test(e.target.value.trim())) next.email = 'Enter a valid email address.'
        else delete next.email
        return next
      })
    }
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value)
    setServerError('')
    if (touched.password) {
      setErrors((prev) => {
        const next = { ...prev }
        if (!e.target.value) next.password = 'Password is required.'
        else delete next.password
        return next
      })
    }
  }

  function handleBlur(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors(validate())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    const v = validate()
    setErrors(v)
    if (Object.keys(v).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      await login(email.trim(), password)
      navigate('/admin')
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold text-navy tracking-widest">AutoSense</h1>
            <p className="text-sm text-muted mt-1">Staff Login</p>
          </div>

          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {serverError}
            </div>
          )}

          <FormField id="login-email" label="Email" error={touched.email ? errors.email : undefined}>
            <Input
              type="email"
              placeholder="admin@autosense.com"
              value={email}
              onChange={handleEmailChange}
              onBlur={() => handleBlur('email')}
              error={touched.email && !!errors.email}
            />
          </FormField>

          <FormField id="login-password" label="Password" error={touched.password ? errors.password : undefined}>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => handleBlur('password')}
              error={touched.password && !!errors.password}
            />
          </FormField>

          <Button type="submit" loading={submitting} disabled={submitting} className="w-full">
            Sign In
          </Button>

          <Link to="/" className="text-sm text-muted hover:text-teal text-center transition-colors">
            Back to site
          </Link>
        </form>
      </Card>
    </div>
  )
}

export default Login
