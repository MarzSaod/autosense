import Chip from '../ui/Chip.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import Button from '../ui/Button.jsx'
import BookingSectionHeader from './BookingSectionHeader.jsx'
import { getServices } from '../../api/services.js'
import useApi from '../../hooks/useApi.js'

function ServiceSelect({ selectedIds, onToggle, error }) {
  const { data: services, loading, error: loadError, refetch } = useApi(getServices, [])

  return (
    <div id="booking-services-section" tabIndex={-1} className="flex flex-col gap-4">
      <BookingSectionHeader number={1} title="Choose your services" />

      {loadError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted text-sm">Something went wrong loading services.</p>
          <Button variant="secondary" onClick={refetch}>
            Try Again
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {loading
            ? Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-28 rounded-full" />
              ))
            : (services || []).map((service) => (
                <Chip
                  key={service.id}
                  selected={selectedIds.includes(service.id)}
                  onClick={() => onToggle(service.id)}
                >
                  {service.name}
                </Chip>
              ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <p className="text-sm text-muted">
        You can pick more than one, we&apos;ll fit them into a single visit.
      </p>
    </div>
  )
}

export default ServiceSelect
