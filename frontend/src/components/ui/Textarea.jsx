function Textarea({ error = false, className = '', ...rest }) {
  const borderClasses = error ? 'border-red-500' : 'border-line'

  return (
    <textarea
      className={`min-h-28 w-full rounded-lg border ${borderClasses} bg-white px-3 py-2 text-slate placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...rest}
    />
  )
}

export default Textarea
