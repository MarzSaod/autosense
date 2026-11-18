import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Close } from '../components/ui/Icon.jsx'
import Button from '../components/ui/Button.jsx'
import { useAuth } from './AuthContext.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'

const navItems = [
  { label: 'Dashboard', to: '/admin', end: true },
  { label: 'Services', to: '/admin/services' },
  { label: 'Bookings', to: '/admin/bookings' },
  { label: 'Gallery', to: '/admin/gallery' },
]

function SidebarLink({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block px-4 py-2.5 text-sm font-medium rounded-r-lg transition-colors duration-150 ${
          isActive
            ? 'border-l-3 border-teal bg-white/10 text-white'
            : 'border-l-3 border-transparent text-white/70 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/admin/login')
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-surface">
        <aside className="hidden lg:flex flex-col w-60 bg-navy shrink-0">
          <NavLink to="/admin" className="px-6 pt-6 pb-4">
            <span className="text-lg font-bold text-white tracking-widest">AutoSense</span>
            <span className="block text-xs text-white/50 mt-0.5">Admin</span>
          </NavLink>

          <nav className="flex-1 flex flex-col gap-0.5 px-2">
            {navItems.map((item) => (
              <SidebarLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </SidebarLink>
            ))}
          </nav>

          {user && (
            <div className="px-4 pb-6 mt-auto">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-white/50 capitalize">{user.role}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full !text-white/70 hover:!text-white hover:!bg-white/10"
                onClick={handleLogout}
              >
                Log out
              </Button>
            </div>
          )}
        </aside>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="lg:hidden flex items-center justify-between h-14 px-4 bg-navy">
            <NavLink to="/admin" className="flex items-center gap-2">
              <span className="text-base font-bold text-white tracking-widest">AutoSense</span>
              <span className="text-xs text-white/50">Admin</span>
            </NavLink>
            <button
              type="button"
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-white"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <Close className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                className="lg:hidden bg-navy border-t border-white/10 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <nav className="flex flex-col gap-0.5 px-2 py-3">
                  {navItems.map((item) => (
                    <SidebarLink key={item.to} to={item.to} end={item.end}>
                      {item.label}
                    </SidebarLink>
                  ))}
                </nav>
                {user && (
                  <div className="px-4 pb-4 border-t border-white/10 pt-3">
                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-white/50 capitalize mb-2">{user.role}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full !text-white/70 hover:!text-white hover:!bg-white/10"
                      onClick={handleLogout}
                    >
                      Log out
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <main className="flex-1 overflow-y-auto bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

export default AdminLayout
