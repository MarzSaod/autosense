import { useCallback, useEffect, useRef, useState } from 'react'

function useApi(asyncFn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  const execute = useCallback(() => {
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setLoading(true)
    setError(null)

    return asyncFn()
      .then((result) => {
        if (requestId.current === currentRequestId) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (requestId.current === currentRequestId) {
          setError(err)
          setLoading(false)
        }
      })
  }, deps)

  useEffect(() => {
    execute()
    return () => {
      requestId.current += 1
    }
  }, deps)

  return { data, loading, error, refetch: execute }
}

export default useApi
