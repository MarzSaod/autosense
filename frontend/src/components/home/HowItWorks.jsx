import { motion } from 'framer-motion'
import SectionHeading from '../ui/SectionHeading.jsx'
import Section from '../layout/Section.jsx'
import AnimatedSection from './AnimatedSection.jsx'
import { useReducedMotionSafe } from '../../motion/presets.js'

const steps = [
  {
    number: 1,
    title: 'Describe the problem',
    text: 'Type what’s going on with your car in your own words, no codes or car knowledge needed.',
  },
  {
    number: 2,
    title: 'AI checks real data',
    text: 'Your description is checked against a real diagnostic code table, not just a guess.',
  },
  {
    number: 3,
    title: 'Get a rough estimate',
    text: 'See a likely diagnosis with a cost and time range before you ever pick up the phone.',
  },
  {
    number: 4,
    title: 'Book directly',
    text: 'Pick a time that works and book your appointment with us, right from the estimate.',
  },
]

const LINE_DURATION = 1.1

const horizontalLineVariants = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: LINE_DURATION, ease: 'easeInOut' } },
}

const verticalLineVariants = {
  hidden: { scaleY: 0 },
  visible: { scaleY: 1, transition: { duration: LINE_DURATION, ease: 'easeInOut' } },
}

const stepVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay },
  }),
}

function stepDelay(index) {
  return (LINE_DURATION * (index / (steps.length - 1))) + 0.15
}

function HowItWorks() {
  const horizontalLine = useReducedMotionSafe(horizontalLineVariants)
  const verticalLine = useReducedMotionSafe(verticalLineVariants)
  const step = useReducedMotionSafe(stepVariants)

  return (
    <Section surface="white">
      <AnimatedSection as="div">
        <SectionHeading
          title="How it works"
          subtitle="One flow, from a plain English description to a booked appointment."
        />

        <div className="hidden lg:block mt-16">
          <div className="relative grid grid-cols-4">
            <div className="absolute top-5 left-[12.5%] right-[12.5%] h-0.5 bg-line" />
            <motion.div
              className="absolute top-5 left-[12.5%] right-[12.5%] h-0.5 bg-teal origin-left"
              variants={horizontalLine}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
            />
            {steps.map((stepItem, index) => (
              <motion.div
                key={stepItem.number}
                custom={stepDelay(index)}
                variants={step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.4 }}
                className="relative flex flex-col items-center text-center gap-4 px-4"
              >
                <span className="relative z-10 h-10 w-10 rounded-full bg-teal text-white flex items-center justify-center font-bold">
                  {stepItem.number}
                </span>
                <h3 className="text-card-title text-navy">{stepItem.title}</h3>
                <p className="text-muted text-sm">{stepItem.text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="lg:hidden mt-12 relative pl-16">
          <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-line" />
          <motion.div
            className="absolute left-5 top-2 bottom-2 w-0.5 bg-teal origin-top"
            variants={verticalLine}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
          />
          <div className="flex flex-col gap-10">
            {steps.map((stepItem, index) => (
              <motion.div
                key={stepItem.number}
                custom={stepDelay(index)}
                variants={step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.4 }}
                className="relative flex flex-col gap-2"
              >
                <span className="absolute -left-16 top-0 h-10 w-10 rounded-full bg-teal text-white flex items-center justify-center font-bold">
                  {stepItem.number}
                </span>
                <h3 className="text-card-title text-navy">{stepItem.title}</h3>
                <p className="text-muted text-sm">{stepItem.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>
    </Section>
  )
}

export default HowItWorks
