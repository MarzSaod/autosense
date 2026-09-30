import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail } from '../ui/Icon.jsx'
import Logo from './Logo.jsx'
import { getShopSettings } from '../../api/shop.js'
import useApi from '../../hooks/useApi.js'

const siteLinks = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'Booking', to: '/booking' },
  { label: 'Reviews', to: '/reviews' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
]

function Footer() {
  const { data: shopSettings } = useApi(getShopSettings, [])

  return (
    <footer className="bg-navy text-white">
      <div className="max-w-6xl mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-2">
            <Logo containerClassName="h-8 w-8" iconClassName="h-4 w-4" />
            <span className="font-bold tracking-widest text-lg">AUTOSENSE</span>
          </div>
          <p className="mt-3 text-sm text-white/70 max-w-xs">
            An AI powered estimate before you even call, and a repair shop&apos;s booking
            site built around it.
          </p>
        </div>

        <div>
          <h3 className="text-eyebrow uppercase text-white/50">
            Site
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {siteLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm text-white/70 hover:text-teal-soft transition-colors duration-150 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-soft"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-eyebrow uppercase text-white/50">
            Contact
          </h3>
          {shopSettings && (
            <ul className="mt-4 flex flex-col gap-2.5 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{shopSettings.address}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" />
                <span>{shopSettings.phone}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" />
                <span>{shopSettings.email}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          © 2026 AutoSense. DS 440 Capstone Project.
        </p>
      </div>
    </footer>
  )
}

export default Footer
