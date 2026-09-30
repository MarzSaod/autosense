import { motion } from 'framer-motion'
import SectionHeading from '../ui/SectionHeading.jsx'
import { Check, Search, MapPin, Calendar } from '../ui/Icon.jsx'
import Section from '../layout/Section.jsx'
import AnimatedSection from './AnimatedSection.jsx'
import { fadeUp, staggerContainer, useReducedMotionSafe } from '../../motion/presets.js'

const reasons = [
  {
    icon: Check,
    title: 'No scanner needed',
    text: 'Just describe the problem in plain English, no OBD2 device required.',
  },
  {
    icon: Search,
    title: 'Grounded in real data',
    text: 'Every estimate is checked against a real diagnostic code table, not a raw guess.',
  },
  {
    icon: MapPin,
    title: 'One shop, not a marketplace',
    text: 'You’re talking directly to the shop that will do the work, start to finish.',
  },
  {
    icon: Calendar,
    title: 'Book in the same flow',
    text: 'Go from estimate to a confirmed appointment without starting over.',
  },
]

function WhyAutoSense() {
  const container = useReducedMotionSafe(staggerContainer)
  const item = useReducedMotionSafe(fadeUp)

  return (
    <Section surface="dark">
      <AnimatedSection as="div">
        <SectionHeading
          dark
          title="Built for drivers who just want a straight answer"
          subtitle="No scanner, no account, and no guesswork. Just a real answer from a real shop."
        />
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {reasons.map((reason) => (
            <motion.div key={reason.title} variants={item} className="flex flex-col gap-4">
              <span className="h-10 w-10 rounded-lg bg-teal-soft flex items-center justify-center text-teal">
                <reason.icon className="h-5 w-5" />
              </span>
              <h3 className="text-card-title text-white">{reason.title}</h3>
              <p className="text-white/70 text-sm">{reason.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatedSection>
    </Section>
  )
}

export default WhyAutoSense
