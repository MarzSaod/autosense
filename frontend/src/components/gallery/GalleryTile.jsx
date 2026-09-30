import { motion } from 'framer-motion'
import GalleryImage from './GalleryImage.jsx'
import usePointerTilt from '../../hooks/usePointerTilt.js'
import { maskReveal, useReducedMotionSafe } from '../../motion/presets.js'

const ASPECT_CLASSES = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[3/5]']
const SPRING_TRANSITION = { type: 'spring', stiffness: 300, damping: 25 }

function GalleryTile({ image, index, onOpen }) {
  const entranceVariants = useReducedMotionSafe(maskReveal)
  const { tilt, hovered, interactive, handlers } = usePointerTilt(16)
  const aspectClass = ASPECT_CLASSES[image.id % ASPECT_CLASSES.length]

  return (
    <motion.div
      layout
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
      className="mb-4 break-inside-avoid"
      style={{ perspective: 1000 }}
    >
      <motion.button
        type="button"
        variants={entranceVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ delay: (index % 6) * 0.06 }}
        onClick={(event) => onOpen(image, event.currentTarget)}
        {...handlers}
        className="group relative block w-full rounded-xl overflow-hidden border border-line text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <motion.div
          className={`relative w-full ${aspectClass}`}
          style={{ transformStyle: 'preserve-3d' }}
          animate={{
            rotateX: tilt.rotateX,
            rotateY: tilt.rotateY,
            y: interactive && hovered ? -6 : 0,
            boxShadow:
              interactive && hovered
                ? '0 20px 40px rgba(0,0,0,0.2)'
                : '0 0px 0px rgba(0,0,0,0)',
          }}
          transition={SPRING_TRANSITION}
        >
          <motion.div layoutId={`gallery-image-${image.id}`} className="absolute inset-0">
            <GalleryImage src={image.imageUrl} alt={image.caption} caption={image.caption} />
          </motion.div>

          {interactive && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: hovered ? 1 : 0 }}
              transition={{ duration: 0.2 }}
              style={{
                background: `radial-gradient(circle at ${tilt.highlightX}% ${tilt.highlightY}%, rgba(255,255,255,0.35), transparent 60%)`,
              }}
            />
          )}

          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent px-4 pt-10 pb-3 transition-transform duration-300 ${
              interactive ? (hovered ? 'translate-y-0' : 'translate-y-full') : 'translate-y-0'
            }`}
          >
            <span className="block text-eyebrow uppercase text-teal-soft">
              {image.category}
            </span>
            <span className="block text-sm font-semibold text-white">{image.caption}</span>
          </div>
        </motion.div>
      </motion.button>
    </motion.div>
  )
}

export default GalleryTile
