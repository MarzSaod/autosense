import { useState } from 'react'
import { Check } from '../ui/Icon.jsx'

function Logo({ containerClassName = 'h-9 w-9', iconClassName = 'h-5 w-5' }) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <span
        className={`rounded-lg bg-teal flex items-center justify-center shrink-0 ${containerClassName}`}
      >
        <Check className={`text-white ${iconClassName}`} />
      </span>
    )
  }

  return (
    <img
      src="/images/brand/logo-mark.png"
      alt="AutoSense"
      onError={() => setErrored(true)}
      className={`rounded-lg overflow-hidden object-contain shrink-0 ${containerClassName}`}
    />
  )
}

export default Logo
