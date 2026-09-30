import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import AppImage from '../ui/AppImage.jsx'
import AnimatedSection from './AnimatedSection.jsx'

const sampleRows = [
  { label: 'Likely issue', value: 'Worn front brake pads' },
  { label: 'Estimated cost', value: '$140 – $220' },
  { label: 'Estimated time', value: '1 – 1.5 hours' },
]

const MAX_TRAVEL = 60

function useParallaxEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function update() {
      setEnabled(desktopQuery.matches && !motionQuery.matches)
    }

    update()
    desktopQuery.addEventListener('change', update)
    motionQuery.addEventListener('change', update)
    return () => {
      desktopQuery.removeEventListener('change', update)
      motionQuery.removeEventListener('change', update)
    }
  }, [])

  return enabled
}

function useHeroParallax(sectionRef) {
  const enabled = useParallaxEnabled()
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setOffset(0)
      return
    }
    const el = sectionRef.current
    if (!el) return
    let frame = null

    function update() {
      frame = null
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const total = vh + rect.height
      const progress = Math.max(0, Math.min(1, 1 - (rect.top + rect.height) / total))
      setOffset((progress - 0.5) * MAX_TRAVEL)
    }

    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled, sectionRef])

  return offset
}

function Hero() {
  const sectionRef = useRef(null)
  const parallaxOffset = useHeroParallax(sectionRef)

  return (
    <section
      ref={sectionRef}
      className="relative bg-navy text-white min-h-[70vh] lg:min-h-[88vh] lg:max-h-[820px] lg:flex lg:items-center"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-16 -bottom-16 inset-x-0"
          style={{ transform: `translate3d(0, ${parallaxOffset}px, 0)` }}
        >
          <AppImage
            src="/images/hero/hero.jpg"
            alt="A mechanic running diagnostics on a car inside the AutoSense shop"
            priority
            objectPosition="center right"
            className="absolute inset-0"
          />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-navy/95 to-navy/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-55% to-navy" />

      <div className="relative w-full max-w-[1200px] mx-auto px-4 py-16 lg:py-0">
        <AnimatedSection as="div" className="flex flex-col gap-6 max-w-xl lg:pb-20">
          <span className="text-eyebrow uppercase text-teal">AI Powered Car Care</span>
          <h1 className="text-hero text-white">
            Know what&apos;s <span className="text-teal">wrong</span> before you even call.
          </h1>
          <p className="text-lead text-white/85 max-w-xl">
            Describe the problem in your own words and get a rough diagnosis, cost, and time
            estimate, grounded in real diagnostic code data, before you book an appointment.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="primary" size="lg" as="link" to="/estimate">
              Get My Estimate
            </Button>
            <Button variant="secondary" onDark size="lg" as="link" to="/booking">
              Book an Appointment
            </Button>
          </div>
        </AnimatedSection>
      </div>

      <div className="relative w-full max-w-[1200px] mx-auto px-4 mt-10 lg:mt-0 lg:absolute lg:inset-x-0 lg:bottom-0 lg:translate-y-16 lg:px-4 lg:pointer-events-none lg:z-10">
        <div className="lg:ml-auto lg:w-[420px] lg:pointer-events-auto">
          <Card className="w-full !shadow-lift" padding="p-6 sm:p-8">
            <span className="text-eyebrow uppercase text-muted">Sample Estimate</span>
            <p className="mt-4 text-lg italic text-navy">
              &quot;There&apos;s a grinding noise when I brake, mostly in the mornings.&quot;
            </p>
            <div className="mt-6 flex flex-col gap-4">
              {sampleRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-t border-line pt-4 first:border-t-0 first:pt-0"
                >
                  <span className="text-sm text-muted">{row.label}</span>
                  <span className="text-sm font-semibold text-navy">{row.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}

export default Hero
