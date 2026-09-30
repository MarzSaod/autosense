import { motion } from 'framer-motion'
import Card from '../ui/Card.jsx'
import StarRating from '../ui/StarRating.jsx'
import { fadeUp, useReducedMotionSafe } from '../../motion/presets.js'

function ReviewCard({ review }) {
  const variants = useReducedMotionSafe(fadeUp)

  return (
    <motion.div variants={variants} className="h-full">
      <Card hoverable padding="p-6" className="h-full flex flex-col gap-4">
        <StarRating rating={review.rating} size="sm" />
        <p className="text-slate text-sm flex-1">{review.reviewText}</p>
        <div className="border-t border-line pt-4">
          <p className="font-bold text-navy text-sm">{review.customerName}</p>
          <p className="text-muted text-sm">{review.serviceName}</p>
        </div>
      </Card>
    </motion.div>
  )
}

export default ReviewCard
