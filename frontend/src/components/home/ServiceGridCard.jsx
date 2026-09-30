import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Card from '../ui/Card.jsx'
import AppImage from '../ui/AppImage.jsx'
import { maskReveal, useReducedMotionSafe } from '../../motion/presets.js'

function ServiceGridCard({ service, featured }) {
  const imageVariants = useReducedMotionSafe(maskReveal)

  return (
    <Link
      to="/services"
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
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
        <div className="flex flex-col gap-3 p-6 flex-1">
          <h3 className="text-card-title text-navy">{service.name}</h3>
          {featured && (
            <p className="hidden lg:block text-muted text-sm flex-1">{service.description}</p>
          )}
          <span className="text-sm font-semibold text-teal">
            ${service.estPriceMin} – ${service.estPriceMax}
          </span>
        </div>
      </Card>
    </Link>
  )
}

export default ServiceGridCard
