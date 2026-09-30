function Input({ error = false, className = '', ...rest }) {
  const borderClasses = error ? 'border-red-500' : 'border-line'

  return (
    <input
      className={`h-11 w-full rounded-lg border ${borderClasses} bg-white px-3 text-slate placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...rest}
    />
  )
}

export default Input
