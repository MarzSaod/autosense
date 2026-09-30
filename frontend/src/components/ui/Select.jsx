function Select({ error = false, className = '', children, ...rest }) {
  const borderClasses = error ? 'border-red-500' : 'border-line'

  return (
    <select
      className={`h-11 w-full rounded-lg border ${borderClasses} bg-white px-3 text-slate focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}

export default Select
