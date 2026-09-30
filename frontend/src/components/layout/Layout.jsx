import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './Header.jsx'
import Footer from './Footer.jsx'
import { pageTransition, useReducedMotionSafe } from '../../motion/presets.js'

function Layout() {
  const location = useLocation()
  const safePageTransition = useReducedMotionSafe(pageTransition)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={safePageTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  )
}

export default Layout
