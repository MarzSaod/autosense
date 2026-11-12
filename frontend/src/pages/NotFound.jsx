import Button from '../components/ui/Button.jsx'

// Rendered by the catch-all route in App.jsx, nested inside Layout, so a bad
// URL still gets the site's nav and footer rather than a bare screen.
function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-24 text-center flex flex-col items-center gap-4">
      <h1 className="text-7xl sm:text-8xl font-bold text-navy">404</h1>
      <p className="text-section-title text-navy">Page not found</p>
      <p className="text-lg text-muted max-w-[460px]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button variant="primary" as="link" to="/" className="mt-2">
        Back to Home
      </Button>
    </div>
  )
}

export default NotFound
