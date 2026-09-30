function BookingSectionHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-10 w-10 shrink-0 rounded-full bg-teal text-white flex items-center justify-center font-bold">
        {number}
      </span>
      <h2 className="text-card-title text-navy">{title}</h2>
    </div>
  )
}

export default BookingSectionHeader
