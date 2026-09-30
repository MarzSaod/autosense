function SectionHeading({ eyebrow, title, subtitle, align = 'left', dark = false }) {
  const alignClasses = align === 'center' ? 'text-center items-center' : 'text-left items-start'
  const titleColor = dark ? 'text-white' : 'text-navy'
  const subtitleColor = dark ? 'text-white/70' : 'text-muted'

  return (
    <div className={`flex flex-col gap-3 ${alignClasses}`}>
      {eyebrow && (
        <span className="text-eyebrow uppercase text-teal">{eyebrow}</span>
      )}
      {title && <h2 className={`text-section-title ${titleColor}`}>{title}</h2>}
      {subtitle && (
        <p className={`text-lead ${subtitleColor} max-w-2xl`}>{subtitle}</p>
      )}
    </div>
  )
}

export default SectionHeading
