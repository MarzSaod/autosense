import { Link } from 'react-router-dom'
import Spinner from './Spinner.jsx'

const variantClasses = {
  primary: 'bg-teal text-white hover:bg-teal-dark',
  secondary: 'bg-white border border-line text-navy hover:bg-surface',
  dark: 'bg-navy text-white hover:bg-navy-soft',
  ghost: 'bg-transparent text-teal hover:bg-teal-soft',
}

const onDarkVariantClasses = {
  secondary: 'bg-white/10 text-white border border-white/40 hover:bg-white/20',
  ghost: 'bg-transparent text-white hover:bg-white/10',
}

const sizeClasses = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-base gap-2',
  lg: 'h-13 px-7 text-lg gap-2.5',
}

function Button({
  variant = 'primary',
  size = 'md',
  as = 'button',
  to,
  disabled = false,
  loading = false,
  onDark = false,
  children,
  className = '',
  ...rest
}) {
  const resolvedVariantClasses =
    onDark && onDarkVariantClasses[variant] ? onDarkVariantClasses[variant] : variantClasses[variant]

  const classes = [
    'inline-flex items-center justify-center rounded-lg font-semibold',
    'transition-transform duration-150 active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    resolvedVariantClasses,
    sizeClasses[size],
    className,
  ].join(' ')

  const content = (
    <>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </>
  )

  if (as === 'link') {
    return (
      <Link
        to={to}
        className={classes}
        aria-disabled={disabled || loading}
        onClick={(event) => {
          if (disabled || loading) event.preventDefault()
        }}
        {...rest}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {content}
    </button>
  )
}

export default Button
