import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Button from '../components/ui/Button.jsx'
import Section from '../components/layout/Section.jsx'
import ServiceCard from '../components/services/ServiceCard.jsx'
import { getServices } from '../api/services.js'
import useApi from '../hooks/useApi.js'
import { staggerContainer, useReducedMotionSafe } from '../motion/presets.js'

function Services() {
  const { data: services, loading, error, refetch } = useApi(getServices, [])
  const container = useReducedMotionSafe(staggerContainer)

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="Services"
          title={
            <>
              Everything your car needs, in <span className="text-teal">one place</span>
            </>
          }
          subtitle={
            <>
              Not sure which one you need?{' '}
              <Link
                to="/estimate"
                className="text-teal font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
              >
                Start with a quick estimate instead.
              </Link>
            </>
          }
        />
      </Section>

      <Section surface="white">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 8 }, (_, index) => (
              <Card key={index} padding="p-6">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full mt-4" />
                <Skeleton className="h-4 w-2/3 mt-2" />
                <Skeleton className="h-4 w-1/3 mt-6" />
                <Skeleton className="h-10 w-full mt-6" />
              </Card>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted">Something went wrong loading services.</p>
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch"
          >
            {(services || []).map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </motion.div>
        )}
      </Section>
    </div>
  )
}

export default Services
