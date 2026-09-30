import Button from '../components/ui/Button.jsx'

function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-24 text-center flex flex-col items-center gap-6">
      <h1 className="text-7xl sm:text-8xl font-bold text-navy">404</h1>
      <p className="text-lg text-muted">This page does not exist.</p>
      <Button variant="primary" as="link" to="/">
        Back to Home
      </Button>
    </div>
  )
}

export default NotFound
