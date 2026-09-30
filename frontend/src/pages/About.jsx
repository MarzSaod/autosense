import { motion } from 'framer-motion'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Button from '../components/ui/Button.jsx'
import { Check, Clock, MapPin } from '../components/ui/Icon.jsx'
import Section from '../components/layout/Section.jsx'
import ShopPhoto from '../components/about/ShopPhoto.jsx'
import { fadeUp, staggerContainer, useReducedMotionSafe } from '../motion/presets.js'

const values = [
  {
    icon: Check,
    title: 'Honest estimates',
    text: 'Every number comes from real diagnostic data, not a sales tactic.',
  },
  {
    icon: Clock,
    title: 'Less time on the phone',
    text: 'Get the basics answered online, so a call is only needed when you want one.',
  },
  {
    icon: MapPin,
    title: 'One shop, one team',
    text: 'Not a marketplace. The people who quote your repair are the ones who do it.',
  },
]

function About() {
  const container = useReducedMotionSafe(staggerContainer)
  const item = useReducedMotionSafe(fadeUp)

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="About Us"
          title="A repair shop that starts with a straight answer"
        />
      </Section>

      <Section surface="white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-6">
            <p className="text-lead text-slate">
              We got tired of watching customers call around for basic information, wait on
              hold for a rough quote, or book a visit with no idea what it would actually
              cost. AutoSense is our answer to that. Describe the problem, get a real
              estimate grounded in real data, and book straight from there.
            </p>
            <p className="text-lead text-slate">
              We are one shop, not a marketplace, so when you book with us, you are talking
              to the people who will actually do the work.
            </p>
          </div>
          <ShopPhoto />
        </div>
      </Section>

      <Section surface="dark">
        <SectionHeading dark title="What we care about" />
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8"
        >
          {values.map((value) => (
            <motion.div key={value.title} variants={item} className="flex flex-col gap-4">
              <span className="h-10 w-10 rounded-lg bg-teal-soft flex items-center justify-center text-teal">
                <value.icon className="h-5 w-5" />
              </span>
              <h3 className="text-card-title text-white">{value.title}</h3>
              <p className="text-white/70 text-sm">{value.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      <Section surface="white">
        <div className="flex flex-col items-center text-center gap-6">
          <h2 className="text-section-title text-navy">Ready to know what&apos;s wrong?</h2>
          <Button variant="primary" size="lg" as="link" to="/estimate">
            Get My Estimate
          </Button>
        </div>
      </Section>
    </div>
  )
}

export default About
