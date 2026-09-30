import { motion } from 'framer-motion'
import { fadeUp, useReducedMotionSafe } from '../../motion/presets.js'

function AnimatedSection({ as = 'section', className = '', children, ...rest }) {
  const MotionTag = motion[as]
  const variants = useReducedMotionSafe(fadeUp)

  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      {...rest}
    >
      {children}
    </MotionTag>
  )
}

export default AnimatedSection
