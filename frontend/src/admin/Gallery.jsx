import { useState, useEffect } from 'react'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import FormField from '../components/ui/FormField.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import {
  getAdminGallery,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
} from '../api/admin.js'

function GalleryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    image_url: initial?.imageUrl || '',
    caption: initial?.caption || '',
    category: initial?.category || '',
    display_order: initial?.displayOrder ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.image_url.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        image_url: form.image_url.trim(),
        caption: form.caption.trim() || null,
        category: form.category.trim() || null,
        display_order: form.display_order !== '' ? Number(form.display_order) : null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-navy">
          {initial ? 'Edit Image' : 'Add Image'}
        </h3>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <FormField id="gal-url" label="Image URL">
          <Input value={form.image_url} onChange={set('image_url')} placeholder="/gallery/photo.jpg" required />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField id="gal-cap" label="Caption">
            <Input value={form.caption} onChange={set('caption')} placeholder="Caption" />
          </FormField>
          <FormField id="gal-cat" label="Category">
            <Input value={form.category} onChange={set('category')} placeholder="Category" />
          </FormField>
          <FormField id="gal-ord" label="Display Order">
            <Input type="number" value={form.display_order} onChange={set('display_order')} placeholder="1" />
          </FormField>
        </div>
        <div className="flex gap-3">
          <Button type="submit" loading={saving} disabled={saving}>
            Save
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function GalleryImage({ image, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    await onDelete(image.id)
  }

  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="relative aspect-[4/3] bg-surface">
        {!imgError ? (
          <img
            src={image.imageUrl}
            alt={image.caption || ''}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface p-4">
            <span className="text-sm font-medium text-muted text-center">
              {image.caption || 'Image'}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        {image.caption && <p className="text-sm font-medium text-navy">{image.caption}</p>}
        {image.category && <p className="text-xs text-muted mt-0.5">{image.category}</p>}
        {confirming ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-slate">Delete this image?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="!bg-red-500 !text-white hover:!bg-red-600"
                onClick={handleDelete}
              >
                Yes, delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => onEdit(image)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function Gallery() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    try {
      setImages(await getAdminGallery())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(data) {
    await createGalleryImage(data)
    setAdding(false)
    await load()
  }

  async function handleUpdate(data) {
    await updateGalleryImage(editing.id, data)
    setEditing(null)
    await load()
  }

  async function handleDelete(id) {
    await deleteGalleryImage(id)
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Gallery</h1>
        {!adding && !editing && (
          <Button onClick={() => setAdding(true)}>Add Image</Button>
        )}
      </div>

      {adding && (
        <GalleryForm onSave={handleCreate} onCancel={() => setAdding(false)} />
      )}

      {editing && (
        <GalleryForm
          initial={editing}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img) => (
            <GalleryImage
              key={img.id}
              image={img}
              onEdit={(i) => { setAdding(false); setEditing(i) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Gallery
