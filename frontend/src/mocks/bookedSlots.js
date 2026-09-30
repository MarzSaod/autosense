function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const today = new Date()

const upcomingDays = Array.from({ length: 14 }, (_, offset) => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  return date
})

const openDays = upcomingDays.filter((date) => date.getDay() !== 0)

const fullTimes = ['09:00', '11:00', '13:00', '15:00']

const bookedSlots = []

openDays.forEach((date, index) => {
  if (index % 2 === 0) {
    const dateString = formatDate(date)
    const time = fullTimes[(index / 2) % fullTimes.length]
    bookedSlots.push({ date: dateString, time })
    bookedSlots.push({ date: dateString, time })
  }
})

export default bookedSlots
