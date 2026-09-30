const SURFACE_CLASSES = {
  white: 'bg-white',
  tint: 'bg-gradient-to-b from-surface to-white',
  dark: 'bg-navy text-white',
}

const SIZE_CLASSES = {
  md: 'py-14 md:py-24',
  lg: 'py-18 md:py-32',
}

function Section({ surface = 'white', size = 'md', id, className = '', backdrop = null, children }) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden ${SURFACE_CLASSES[surface]} ${className}`}
    >
      {backdrop}
      {surface === 'dark' && (
        <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-teal opacity-20 blur-3xl pointer-events-none" />
      )}
      <div className={`relative max-w-[1200px] mx-auto px-4 ${SIZE_CLASSES[size]}`}>
        {children}
      </div>
    </section>
  )
}

export default Section
