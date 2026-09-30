function ShopMap({ address }) {
  const query = address.replace(/,/g, '').trim().split(/\s+/).join('+')
  const src = `https://maps.google.com/maps?q=${query}&output=embed`

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-line/60 shadow-card">
      <iframe
        src={src}
        title="Map showing the AutoSense shop location"
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

export default ShopMap
