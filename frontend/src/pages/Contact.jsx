import SectionHeading from '../components/ui/SectionHeading.jsx'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import Button from '../components/ui/Button.jsx'
import { MapPin, Phone, Mail, Clock } from '../components/ui/Icon.jsx'
import Section from '../components/layout/Section.jsx'
import ShopMap from '../components/contact/ShopMap.jsx'
import ContactForm from '../components/contact/ContactForm.jsx'
import { getShopSettings } from '../api/shop.js'
import useApi from '../hooks/useApi.js'

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

function formatTimeLabel(time24) {
  const [hourStr, minuteStr] = time24.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minuteStr} ${period}`
}

function formatHoursLines(hoursJson) {
  const groups = []

  DAY_ORDER.forEach((day) => {
    const hours = hoursJson[day]
    const key = hours ? `${hours.open}-${hours.close}` : 'closed'
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.days.push(day)
    } else {
      groups.push({ key, days: [day], hours })
    }
  })

  return groups.map((group) => {
    const label =
      group.days.length > 1
        ? `${DAY_LABELS[group.days[0]]} – ${DAY_LABELS[group.days[group.days.length - 1]]}`
        : DAY_LABELS[group.days[0]]
    const value = group.hours
      ? `${formatTimeLabel(group.hours.open)} – ${formatTimeLabel(group.hours.close)}`
      : 'Closed'
    return `${label}, ${value}`
  })
}

function Contact() {
  const { data: shopSettings, loading, error, refetch } = useApi(getShopSettings, [])

  const infoRows = shopSettings
    ? [
        { icon: MapPin, label: 'Address', value: shopSettings.address },
        {
          icon: Phone,
          label: 'Phone',
          value: shopSettings.phone,
          href: `tel:${shopSettings.phone.replace(/[^\d+]/g, '')}`,
        },
        {
          icon: Mail,
          label: 'Email',
          value: shopSettings.email,
          href: `mailto:${shopSettings.email}`,
        },
        {
          icon: Clock,
          label: 'Hours',
          lines: formatHoursLines(shopSettings.hoursJson),
        },
      ]
    : []

  return (
    <div>
      <Section surface="tint">
        <SectionHeading eyebrow="Contact & Location" title="Come see us, or reach out" />
      </Section>

      <Section surface="white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="flex flex-col gap-8">
            {shopSettings ? (
              <ShopMap address={shopSettings.address} />
            ) : (
              <Skeleton className="w-full aspect-[4/3] rounded-xl" />
            )}

            <div className="flex flex-col gap-5">
              {loading &&
                Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="flex flex-col gap-2 flex-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </div>
                ))}

              {!loading && error && (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-muted text-sm">Something went wrong loading shop details.</p>
                  <Button variant="secondary" onClick={refetch}>
                    Try Again
                  </Button>
                </div>
              )}

              {!loading &&
                !error &&
                infoRows.map((row) => (
                  <div key={row.label} className="flex items-start gap-4">
                    <span className="h-10 w-10 rounded-lg bg-surface flex items-center justify-center text-teal shrink-0">
                      <row.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-navy text-sm">{row.label}</p>
                      {row.lines ? (
                        row.lines.map((line) => (
                          <p key={line} className="text-slate text-sm">
                            {line}
                          </p>
                        ))
                      ) : row.href ? (
                        <a
                          href={row.href}
                          className="text-slate text-sm hover:text-teal rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
                        >
                          {row.value}
                        </a>
                      ) : (
                        <p className="text-slate text-sm">{row.value}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <Card padding="p-6 sm:p-8">
            <h2 className="text-card-title text-navy mb-6">Send us a message</h2>
            <ContactForm />
          </Card>
        </div>
      </Section>
    </div>
  )
}

export default Contact
