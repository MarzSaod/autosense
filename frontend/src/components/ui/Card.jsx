import { motion } from 'framer-motion'

function Card({ padding = 'p-6', hoverable = false, dark = false, children, className = '' }) {
  const surfaceClasses = dark
    ? 'bg-navy-soft border border-white/10'
    : 'bg-white border border-line/60'

  const hoverClasses = hoverable ? 'transition-shadow duration-300 hover:shadow-lift' : ''

  if (hoverable) {
    return (
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={`rounded-xl shadow-card ${surfaceClasses} ${hoverClasses} ${padding} ${className}`}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={`rounded-xl shadow-card ${surfaceClasses} ${padding} ${className}`}>
      {children}
    </div>
  )
}

export default Card
