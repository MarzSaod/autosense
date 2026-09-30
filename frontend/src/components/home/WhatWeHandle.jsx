import { motion } from 'framer-motion'
import SectionHeading from '../ui/SectionHeading.jsx'
import Card from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import ServiceGridCard from './ServiceGridCard.jsx'
import { ArrowRight } from '../ui/Icon.jsx'
import Section from '../layout/Section.jsx'
import AnimatedSection from './AnimatedSection.jsx'
import { fadeUp, staggerContainer, useReducedMotionSafe } from '../../motion/presets.js'
import { getServices } from '../../api/services.js'
import useApi from '../../hooks/useApi.js'

function WhatWeHandle() {
  const { data: services, loading, error, refetch } = useApi(getServices, [])
  const container = useReducedMotionSafe(staggerContainer)
  const item = useReducedMotionSafe(fadeUp)
  const featuredServices = (services || []).slice(0, 4)

  return (
    <Section surface="tint">
      <AnimatedSection as="div">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <SectionHeading
            title="What we handle"
            subtitle="A look at some of the most common services we book."
          />
          <Button variant="ghost" as="link" to="/services" className="shrink-0">
            See all services
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {error ? (
          <div className="mt-12 flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted">Something went wrong loading services.</p>
            <Button variant="secondary" onClick={refetch}>
              Try Again
            </Button>
          </div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {loading
              ? Array.from({ length: 4 }, (_, index) => (
                  <Card
                    key={index}
                    padding="p-0"
                    className={`overflow-hidden ${index === 0 ? 'lg:col-span-2 lg:row-span-2' : ''}`}
                  >
                    <Skeleton className="aspect-[4/3] w-full rounded-none" />
                    <div className="p-6">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full mt-4" />
                      <Skeleton className="h-4 w-2/3 mt-2" />
                      <Skeleton className="h-4 w-1/3 mt-6" />
                    </div>
                  </Card>
                ))
              : featuredServices.map((service, index) => (
                  <motion.div
                    key={service.id}
                    variants={item}
                    className={`h-full ${index === 0 ? 'lg:col-span-2 lg:row-span-2' : ''}`}
                  >
                    <ServiceGridCard service={service} featured={index === 0} />
                  </motion.div>
                ))}
          </motion.div>
        )}
      </AnimatedSection>
    </Section>
  )
}

export default WhatWeHandle
