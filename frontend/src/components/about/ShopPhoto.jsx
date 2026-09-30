import { motion } from 'framer-motion'
import AppImage from '../ui/AppImage.jsx'
import { maskReveal, useReducedMotionSafe } from '../../motion/presets.js'

function ShopPhoto() {
  const variants = useReducedMotionSafe(maskReveal)

  return (
    <div className="relative md:mt-10">
      <div className="hidden md:block absolute -bottom-5 -right-5 h-full w-full rounded-xl bg-teal" />
      <div className="relative rounded-xl shadow-lift overflow-hidden">
        <motion.div
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <AppImage
            src="/images/about/shop.jpg"
            alt="Inside the AutoSense repair shop"
            ratio="4/3"
            fallbackLabel="Shop photo"
          />
        </motion.div>
      </div>
    </div>
  )
}

export default ShopPhoto
