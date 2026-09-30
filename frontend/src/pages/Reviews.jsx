import { motion } from 'framer-motion'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Button from '../components/ui/Button.jsx'
import StarRating from '../components/ui/StarRating.jsx'
import Section from '../components/layout/Section.jsx'
import ReviewCard from '../components/reviews/ReviewCard.jsx'
import RatingCountUp from '../components/reviews/RatingCountUp.jsx'
import { getReviews, getRatingSummary } from '../api/reviews.js'
import useApi from '../hooks/useApi.js'
import { staggerContainer, useReducedMotionSafe } from '../motion/presets.js'

function Reviews() {
  const { data: reviews, loading, error, refetch } = useApi(getReviews, [])
  const { data: ratingSummary } = useApi(getRatingSummary, [])
  const container = useReducedMotionSafe(staggerContainer)

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="Reviews"
          title={
            <>
              What customers are <span className="text-teal">saying</span>
            </>
          }
        />

        {ratingSummary && (
          <div className="mt-8 flex items-center gap-4">
            <RatingCountUp value={ratingSummary.average} className="text-hero text-navy" />
            <div className="flex flex-col gap-1">
              <StarRating rating={ratingSummary.average} />
              <span className="text-sm text-muted">Based on {ratingSummary.total} reviews</span>
            </div>
          </div>
        )}
      </Section>

      <Section surface="white">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} padding="p-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full mt-4" />
                <Skeleton className="h-4 w-2/3 mt-2" />
                <Skeleton className="h-4 w-1/3 mt-6" />
                <Skeleton className="h-3 w-1/4 mt-2" />
              </Card>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted">Something went wrong loading reviews.</p>
            <Button variant="secondary" onClick={refetch}>
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {(reviews || []).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </motion.div>
        )}
      </Section>

      <Section surface="dark">
        <div className="flex flex-col items-center text-center gap-6">
          <h2 className="text-section-title text-white">Ready to book?</h2>
          <Button variant="primary" size="lg" as="link" to="/booking">
            Book an Appointment
          </Button>
        </div>
      </Section>
    </div>
  )
}

export default Reviews
