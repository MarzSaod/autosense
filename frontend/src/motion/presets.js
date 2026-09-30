import { useEffect, useState } from 'react'

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
}

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
}

export const pageTransition = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.3, ease: 'easeOut' } },
}

export const maskReveal = {
  hidden: { opacity: 0, scale: 1.15, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

function stripState(state) {
  const next = { opacity: state.opacity }
  if (state.transition) next.transition = state.transition
  return next
}

function stripMotion(variants) {
  const stripped = {}
  for (const key of Object.keys(variants)) {
    const state = variants[key]
    stripped[key] = typeof state === 'function' ? (custom) => stripState(state(custom)) : stripState(state)
  }
  return stripped
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const listener = (event) => setReduced(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  return reduced
}

export function useReducedMotionSafe(variants) {
  const reduced = usePrefersReducedMotion()
  return reduced ? stripMotion(variants) : variants
}
