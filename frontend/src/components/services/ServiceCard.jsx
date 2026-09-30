import { motion } from 'framer-motion'
import Card from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'
import AppImage from '../ui/AppImage.jsx'
import { Clock } from '../ui/Icon.jsx'
import usePointerTilt from '../../hooks/usePointerTilt.js'
import { fadeUp, maskReveal, useReducedMotionSafe } from '../../motion/presets.js'

const TILT_TRANSITION = { type: 'spring', stiffness: 300, damping: 25 }

function formatDuration(minutes) {
  if (minutes < 60) {
    return `~${minutes} min`
  }
  const hours = Math.round((minutes / 60) * 2) / 2
  return `~${hours} hr`
}

function ServiceCard({ service }) {
  const variants = useReducedMotionSafe(fadeUp)
  const imageVariants = useReducedMotionSafe(maskReveal)
  const { tilt, handlers } = usePointerTilt(5)

  return (
    <motion.div variants={variants} className="h-full">
      <div className="h-full" style={{ perspective: 1000 }} {...handlers}>
        <motion.div
          className="h-full"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}
          transition={TILT_TRANSITION}
        >
          <Card hoverable padding="p-0" className="h-full flex flex-col gap-0 overflow-hidden group">
            <div className="overflow-hidden rounded-t-xl">
              <motion.div
                variants={imageVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
              >
                <AppImage
                  src={service.imageUrl}
                  alt={`${service.name} service at AutoSense`}
                  ratio="4/3"
                  fallbackLabel={service.name}
                  className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.04]"
                />
              </motion.div>
            </div>
            <div className="flex flex-col gap-4 p-6 flex-1">
              <div className="flex flex-col gap-2">
                <h3 className="text-card-title text-navy">{service.name}</h3>
                <p className="text-muted text-sm">{service.description}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-navy">
                  ${service.estPriceMin} – ${service.estPriceMax}
                </span>
                <span className="flex items-center gap-1.5 text-muted text-sm">
                  <Clock className="h-4 w-4" />
                  {formatDuration(service.estDurationMinutes)}
                </span>
              </div>
              <Button
                variant="secondary"
                as="link"
                to="/booking"
                state={{ prefill: { serviceIds: [service.id] } }}
                className="w-full mt-auto"
              >
                Book This Service
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

export default ServiceCard
