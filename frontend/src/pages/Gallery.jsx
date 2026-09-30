import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Button from '../components/ui/Button.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Section from '../components/layout/Section.jsx'
import GalleryFilterBar from '../components/gallery/GalleryFilterBar.jsx'
import MasonryGrid from '../components/gallery/MasonryGrid.jsx'
import Lightbox from '../components/gallery/Lightbox.jsx'
import { getGalleryImages, getGalleryCategories } from '../api/gallery.js'
import useApi from '../hooks/useApi.js'
import { fadeUp, staggerContainer, useReducedMotionSafe } from '../motion/presets.js'

function Gallery() {
  const { data: images, loading, error, refetch } = useApi(getGalleryImages, [])
  const { data: categories } = useApi(getGalleryCategories, [])
  const [activeCategory, setActiveCategory] = useState('All')
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const openerRef = useRef(null)

  const container = useReducedMotionSafe(staggerContainer)
  const item = useReducedMotionSafe(fadeUp)

  const filteredImages = (images || []).filter(
    (image) => activeCategory === 'All' || image.category === activeCategory,
  )

  function handleOpenImage(image, triggerElement) {
    openerRef.current = triggerElement
    const nextIndex = filteredImages.findIndex((entry) => entry.id === image.id)
    setLightboxIndex(nextIndex === -1 ? 0 : nextIndex)
  }

  function handleCloseLightbox() {
    setLightboxIndex(null)
    if (openerRef.current) {
      openerRef.current.focus()
    }
  }

  return (
    <div>
      <Section surface="dark">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-4"
        >
          <motion.span variants={item} className="text-eyebrow uppercase text-teal">
            Gallery
          </motion.span>
          <motion.h1 variants={item} className="text-section-title text-white">
            Take a look around the <span className="text-teal">shop</span>
          </motion.h1>
          <motion.p variants={item} className="text-lead text-white/70 max-w-2xl">
            A look inside the bays, the team, and the work we turn out.
          </motion.p>
        </motion.div>
      </Section>

      <GalleryFilterBar
        categories={categories || []}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        count={filteredImages.length}
      />

      <Section surface="white">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }, (_, index) => (
              <Skeleton key={index} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted">Something went wrong loading the gallery.</p>
            <Button variant="secondary" onClick={refetch}>
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && (
          <MasonryGrid images={filteredImages} onOpenImage={handleOpenImage} />
        )}
      </Section>

      <Section surface="dark">
        <div className="flex flex-col items-center text-center gap-6">
          <h2 className="text-section-title text-white">Like what you see?</h2>
          <Button variant="primary" size="lg" as="link" to="/booking">
            Book an Appointment
          </Button>
        </div>
      </Section>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            images={filteredImages}
            index={lightboxIndex}
            onClose={handleCloseLightbox}
            onNavigate={setLightboxIndex}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default Gallery
