import { useEffect, useRef, useState } from 'react'

const REST_TILT = { rotateX: 0, rotateY: 0, highlightX: 50, highlightY: 50 }

function useInteractionEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function update() {
      setEnabled(desktopQuery.matches && !motionQuery.matches)
    }

    update()
    desktopQuery.addEventListener('change', update)
    motionQuery.addEventListener('change', update)
    return () => {
      desktopQuery.removeEventListener('change', update)
      motionQuery.removeEventListener('change', update)
    }
  }, [])

  return enabled
}

function usePointerTilt(maxRotation = 16) {
  const interactive = useInteractionEnabled()
  const [tilt, setTilt] = useState(REST_TILT)
  const [hovered, setHovered] = useState(false)
  const rafRef = useRef(null)

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function handlePointerMove(event) {
    if (!interactive) return
    const currentTarget = event.currentTarget
    const clientX = event.clientX
    const clientY = event.clientY
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const rect = currentTarget.getBoundingClientRect()
      const px = (clientX - rect.left) / rect.width - 0.5
      const py = (clientY - rect.top) / rect.height - 0.5
      setTilt({
        rotateX: py * -maxRotation,
        rotateY: px * maxRotation,
        highlightX: (px + 0.5) * 100,
        highlightY: (py + 0.5) * 100,
      })
    })
  }

  function handlePointerEnter() {
    if (interactive) setHovered(true)
  }

  function handlePointerLeave() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setHovered(false)
    setTilt(REST_TILT)
  }

  return {
    tilt,
    hovered,
    interactive,
    handlers: {
      onPointerMove: handlePointerMove,
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
    },
  }
}

export default usePointerTilt
