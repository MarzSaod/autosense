import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Card from '../components/ui/Card.jsx'
import Section from '../components/layout/Section.jsx'
import EstimateForm from '../components/estimate/EstimateForm.jsx'
import ExampleResultCard from '../components/estimate/ExampleResultCard.jsx'
import DiagnosisLoading from '../components/estimate/DiagnosisLoading.jsx'
import DiagnosisResultCard from '../components/estimate/DiagnosisResultCard.jsx'
import { createDiagnosisRequest } from '../api/diagnosis.js'

function Estimate() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [vehicle, setVehicle] = useState({ make: '', model: '', year: '' })
  const resultRef = useRef(null)

  useEffect(() => {
    if (status === 'result' && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [status, result])

  async function handleSubmit(values) {
    setStatus('loading')
    setVehicle({ make: values.make, model: values.model, year: values.year })
    const response = await createDiagnosisRequest(values)
    setResult(response)
    setStatus('result')
  }

  return (
    <div>
      <Section surface="tint">
        <SectionHeading
          eyebrow="Vehicle & Service Request"
          title="Tell us what's going on with your car"
          subtitle="No codes, no scanner, no car knowledge needed. Just describe it the way you'd tell a friend, and we'll check it against real diagnostic data."
        />
      </Section>

      <Section surface="white">
        <div className="max-w-[700px] mx-auto flex flex-col gap-8">
          <Card padding="p-6 sm:p-8">
            <EstimateForm onSubmit={handleSubmit} submitting={status === 'loading'} />
          </Card>

          <div ref={resultRef} className="flex flex-col gap-6">
            {status === 'idle' && <ExampleResultCard />}
            {status === 'loading' && <DiagnosisLoading />}
            {status === 'result' && result && (
              <>
                <DiagnosisResultCard result={result} vehicle={vehicle} />
                <p className="text-center text-muted text-sm">
                  Or{' '}
                  <Link
                    to="/services"
                    className="text-teal font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
                  >
                    browse all services
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}

export default Estimate
