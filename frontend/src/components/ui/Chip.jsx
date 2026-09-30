import { Check } from './Icon.jsx'

function Chip({ selected = false, onClick, children }) {
  const stateClasses = selected
    ? 'bg-teal text-white border-teal'
    : 'bg-white text-slate border-line hover:border-line-strong'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 ${stateClasses}`}
    >
      {selected && <Check className="h-4 w-4" />}
      {children}
    </button>
  )
}

export default Chip
