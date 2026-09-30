import { motion } from 'framer-motion'
import SectionHeading from '../ui/SectionHeading.jsx'
import Card from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import StarRating from '../ui/StarRating.jsx'
import Section from '../layout/Section.jsx'
import AnimatedSection from './AnimatedSection.jsx'
import { fadeUp, staggerContainer, useReducedMotionSafe } from '../../motion/presets.js'
import { getFeaturedReviews } from '../../api/reviews.js'
import useApi from '../../hooks/useApi.js'

function ReviewsStrip() {
  const { data: reviews, loading, error, refetch } = useApi(getFeaturedReviews, [])
  const container = useReducedMotionSafe(staggerContainer)
  const item = useReducedMotionSafe(fadeUp)
  const featured = (reviews || []).slice(0, 3)

  return (
    <Section surface="white">
      <AnimatedSection as="div">
        <SectionHeading title="What customers are saying" align="center" />

        {error ? (
          <div className="mt-12 flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted">Something went wrong loading reviews.</p>
            <Button variant="secondary" onClick={refetch}>
              Try Again
            </Button>
          </div>
        ) : loading ? (
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} padding="p-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full mt-4" />
                <Skeleton className="h-4 w-2/3 mt-2" />
                <Skeleton className="h-4 w-1/3 mt-6" />
              </Card>
            ))}
          </div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {featured.map((review) => (
              <motion.div key={review.id} variants={item}>
                <Card padding="p-6" className="h-full flex flex-col gap-4">
                  <StarRating rating={review.rating} size="sm" />
                  <p className="text-slate text-sm flex-1">{review.reviewText}</p>
                  <span className="font-semibold text-navy text-sm">{review.customerName}</span>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        <div className="mt-10 flex justify-center">
          <Button variant="ghost" as="link" to="/reviews">
            Read all reviews
          </Button>
        </div>
      </AnimatedSection>
    </Section>
  )
}

export default ReviewsStrip
