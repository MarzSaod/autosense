import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import ScrollToTop from './components/layout/ScrollToTop.jsx'
import Spinner from './components/ui/Spinner.jsx'
import Home from './pages/Home.jsx'
import Estimate from './pages/Estimate.jsx'
import Services from './pages/Services.jsx'
import Booking from './pages/Booking.jsx'
import BookingLookup from './pages/BookingLookup.jsx'
import BookingStatus from './pages/BookingStatus.jsx'
import Reviews from './pages/Reviews.jsx'
import Gallery from './pages/Gallery.jsx'
import About from './pages/About.jsx'
import Contact from './pages/Contact.jsx'
import NotFound from './pages/NotFound.jsx'

const AuthProvider = lazy(() => import('./admin/AuthContext.jsx').then(m => ({ default: m.AuthProvider })))
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const AdminLogin = lazy(() => import('./admin/Login.jsx'))
const AdminDashboard = lazy(() => import('./admin/Dashboard.jsx'))
const AdminServices = lazy(() => import('./admin/Services.jsx'))
const AdminBookings = lazy(() => import('./admin/Bookings.jsx'))
const AdminGallery = lazy(() => import('./admin/Gallery.jsx'))
const AdminMessages = lazy(() => import('./admin/Messages.jsx'))
const AdminStaff = lazy(() => import('./admin/Staff.jsx'))
const AdminAccount = lazy(() => import('./admin/Account.jsx'))

function AdminFallback() {
  return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="estimate" element={<Estimate />} />
          <Route path="services" element={<Services />} />
          <Route path="booking" element={<Booking />} />
          <Route path="booking/lookup" element={<BookingLookup />} />
          <Route path="booking/status" element={<BookingStatus />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/admin" element={<Suspense fallback={<AdminFallback />}><AuthProvider><AdminLayout /></AuthProvider></Suspense>}>
          <Route index element={<Suspense fallback={<AdminFallback />}><AdminDashboard /></Suspense>} />
          <Route path="services" element={<Suspense fallback={<AdminFallback />}><AdminServices /></Suspense>} />
          <Route path="bookings" element={<Suspense fallback={<AdminFallback />}><AdminBookings /></Suspense>} />
          <Route path="gallery" element={<Suspense fallback={<AdminFallback />}><AdminGallery /></Suspense>} />
          <Route path="messages" element={<Suspense fallback={<AdminFallback />}><AdminMessages /></Suspense>} />
          <Route path="staff" element={<Suspense fallback={<AdminFallback />}><AdminStaff /></Suspense>} />
          <Route path="account" element={<Suspense fallback={<AdminFallback />}><AdminAccount /></Suspense>} />
        </Route>
        <Route path="/admin/login" element={<Suspense fallback={<AdminFallback />}><AuthProvider><AdminLogin /></AuthProvider></Suspense>} />
      </Routes>
    </>
  )
}

export default App
