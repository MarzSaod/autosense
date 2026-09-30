import Hero from '../components/home/Hero.jsx'
import HowItWorks from '../components/home/HowItWorks.jsx'
import WhatWeHandle from '../components/home/WhatWeHandle.jsx'
import WhyAutoSense from '../components/home/WhyAutoSense.jsx'
import ReviewsStrip from '../components/home/ReviewsStrip.jsx'
import ClosingCta from '../components/home/ClosingCta.jsx'

function Home() {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <WhatWeHandle />
      <WhyAutoSense />
      <ReviewsStrip />
      <ClosingCta />
    </div>
  )
}

export default Home
