import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import ScrollToTop from './components/layout/ScrollToTop.jsx'
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
import { AuthProvider } from './admin/AuthContext.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminLogin from './admin/Login.jsx'
import AdminDashboard from './admin/Dashboard.jsx'
import AdminServices from './admin/Services.jsx'
import AdminBookings from './admin/Bookings.jsx'
import AdminGallery from './admin/Gallery.jsx'
import AdminMessages from './admin/Messages.jsx'
import AdminStaff from './admin/Staff.jsx'

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

        <Route path="/admin" element={<AuthProvider><AdminLayout /></AuthProvider>}>
          <Route index element={<AdminDashboard />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="gallery" element={<AdminGallery />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="staff" element={<AdminStaff />} />
        </Route>
        <Route path="/admin/login" element={<AuthProvider><AdminLogin /></AuthProvider>} />
      </Routes>
    </>
  )
}

export default App
