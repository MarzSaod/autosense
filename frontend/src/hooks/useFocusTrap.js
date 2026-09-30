import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

function useFocusTrap(active) {
  const containerRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    previousFocusRef.current = document.activeElement
    const container = containerRef.current
    const focusables = container ? container.querySelectorAll(FOCUSABLE_SELECTOR) : []

    if (focusables.length > 0) {
      focusables[0].focus()
    } else if (container) {
      container.focus()
    }

    function handleKeyDown(event) {
      if (event.key !== 'Tab' || !container) {
        return
      }
      const elements = container.querySelectorAll(FOCUSABLE_SELECTOR)
      if (elements.length === 0) {
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus()
      }
    }
  }, [active])

  return containerRef
}

export default useFocusTrap
