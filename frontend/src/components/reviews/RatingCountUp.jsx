import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { usePrefersReducedMotion } from '../../motion/presets.js'

const DURATION_MS = 900

function RatingCountUp({ value, className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      return
    }
    if (!inView) return

    let frame = null
    const start = performance.now()

    function tick(now) {
      const progress = Math.min((now - start) / DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      if (progress < 1) {
        setDisplay(Math.round(value * eased * 10) / 10)
        frame = requestAnimationFrame(tick)
      } else {
        setDisplay(value)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [inView, reduced, value])

  return (
    <span ref={ref} className={`tabular-nums ${className || ''}`}>
      {display}
    </span>
  )
}

export default RatingCountUp
