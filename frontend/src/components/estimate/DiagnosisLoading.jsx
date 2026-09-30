import Spinner from '../ui/Spinner.jsx'

function DiagnosisLoading() {
  return (
    <div className="border border-line rounded-xl bg-white p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center py-12">
      <Spinner className="h-8 w-8 text-teal" />
      <p className="text-muted">Checking your description against real diagnostic data...</p>
    </div>
  )
}

export default DiagnosisLoading
