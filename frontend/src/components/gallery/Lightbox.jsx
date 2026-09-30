import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Close } from '../ui/Icon.jsx'
import GalleryImage from './GalleryImage.jsx'
import useFocusTrap from '../../hooks/useFocusTrap.js'

function Lightbox({ images, index, onClose, onNavigate }) {
  const total = images.length
  const image = images[index]
  const [initialImageId] = useState(() => image?.id)
  const [hasNavigated, setHasNavigated] = useState(false)
  const trapRef = useFocusTrap(true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
      if (event.key === 'ArrowLeft') {
        setHasNavigated(true)
        onNavigate((index - 1 + total) % total)
      }
      if (event.key === 'ArrowRight') {
        setHasNavigated(true)
        onNavigate((index + 1) % total)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, total, onClose, onNavigate])

  if (!image) {
    return null
  }

  function goPrev() {
    setHasNavigated(true)
    onNavigate((index - 1 + total) % total)
  }

  function goNext() {
    setHasNavigated(true)
    onNavigate((index + 1) % total)
  }

  function handleDragEnd(event, info) {
    const { offset, velocity } = info
    if (offset.y > 120 || velocity.y > 500) {
      onClose()
      return
    }
    if (offset.x < -80 || velocity.x < -500) {
      goNext()
      return
    }
    if (offset.x > 80 || velocity.x > 500) {
      goPrev()
    }
  }

  const showSharedLayout = !hasNavigated && image.id === initialImageId

  return (
    <motion.div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${total}: ${image.caption}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/95 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
      >
        <Close className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          goPrev()
        }}
        aria-label="Previous photo"
        className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          goNext()
        }}
        aria-label="Next photo"
        className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <motion.div
        className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-4"
        onClick={(event) => event.stopPropagation()}
        drag
        dragElastic={0.2}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          {showSharedLayout ? (
            <motion.div
              key={image.id}
              layoutId={`gallery-image-${image.id}`}
              className="relative w-[min(90vw,900px)] aspect-[4/3] rounded-xl overflow-hidden bg-navy-soft"
            >
              <GalleryImage src={image.imageUrl} alt={image.caption} caption={image.caption} />
            </motion.div>
          ) : (
            <motion.div
              key={image.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-[min(90vw,900px)] aspect-[4/3] rounded-xl overflow-hidden bg-navy-soft"
            >
              <GalleryImage src={image.imageUrl} alt={image.caption} caption={image.caption} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center">
          <span className="block text-eyebrow uppercase text-teal-soft">
            {image.category}
          </span>
          <span className="block text-white font-semibold">{image.caption}</span>
          <span className="block text-white/60 text-sm mt-1">
            {index + 1} of {total}
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default Lightbox
