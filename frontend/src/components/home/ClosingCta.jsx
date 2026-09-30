import Button from '../ui/Button.jsx'
import Section from '../layout/Section.jsx'
import AppImage from '../ui/AppImage.jsx'
import AnimatedSection from './AnimatedSection.jsx'

function ClosingCta() {
  return (
    <Section
      surface="dark"
      backdrop={
        <div aria-hidden="true" className="absolute inset-0">
          <AppImage src="/images/hero/cta-band.jpg" alt="" className="absolute inset-0" />
          <div className="absolute inset-0 bg-navy/[0.88]" />
        </div>
      }
    >
      <AnimatedSection as="div" className="flex flex-col items-center text-center gap-4">
        <h2 className="text-section-title text-white">
          Not sure what&apos;s wrong with your car?
        </h2>
        <p className="text-lead text-white/70">
          Get a rough estimate in under a minute, no commitment.
        </p>
        <Button variant="primary" size="lg" as="link" to="/estimate" className="mt-4">
          Get My Estimate
        </Button>
      </AnimatedSection>
    </Section>
  )
}

export default ClosingCta
