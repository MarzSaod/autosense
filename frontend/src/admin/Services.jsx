import { useState, useEffect } from 'react'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Textarea from '../components/ui/Textarea.jsx'
import FormField from '../components/ui/FormField.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import {
  getAdminServices,
  createService,
  updateService,
  deleteService,
} from '../api/admin.js'

function ServiceForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    image_url: initial?.imageUrl || '',
    est_price_min: initial?.estPriceMin ?? '',
    est_price_max: initial?.estPriceMax ?? '',
    est_duration_minutes: initial?.estDurationMinutes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        est_price_min: form.est_price_min !== '' ? Number(form.est_price_min) : null,
        est_price_max: form.est_price_max !== '' ? Number(form.est_price_max) : null,
        est_duration_minutes: form.est_duration_minutes !== '' ? Number(form.est_duration_minutes) : null,
      }
      await onSave(payload)
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
          {initial ? 'Edit Service' : 'Add Service'}
        </h3>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <FormField id="svc-name" label="Name">
          <Input value={form.name} onChange={set('name')} placeholder="Service name" required />
        </FormField>
        <FormField id="svc-desc" label="Description">
          <Textarea value={form.description} onChange={set('description')} placeholder="Description" />
        </FormField>
        <FormField id="svc-img" label="Image URL">
          <Input value={form.image_url} onChange={set('image_url')} placeholder="/images/services/example.jpg" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField id="svc-pmin" label="Price Min ($)">
            <Input type="number" value={form.est_price_min} onChange={set('est_price_min')} placeholder="0" />
          </FormField>
          <FormField id="svc-pmax" label="Price Max ($)">
            <Input type="number" value={form.est_price_max} onChange={set('est_price_max')} placeholder="0" />
          </FormField>
          <FormField id="svc-dur" label="Duration (min)">
            <Input type="number" value={form.est_duration_minutes} onChange={set('est_duration_minutes')} placeholder="30" />
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

function formatPrice(min, max) {
  if (min == null && max == null) return '—'
  if (min != null && max != null) return `$${min} – $${max}`
  if (min != null) return `$${min}+`
  return `Up to $${max}`
}

function formatDuration(minutes) {
  if (minutes == null) return '—'
  if (minutes < 60) return `${minutes} min`
  const hrs = minutes / 60
  return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hr`
}

function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setServices(await getAdminServices())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(data) {
    await createService(data)
    setAdding(false)
    await load()
  }

  async function handleUpdate(data) {
    await updateService(editing.id, data)
    setEditing(null)
    await load()
  }

  async function handleToggleActive(svc) {
    if (svc.isActive) {
      await deleteService(svc.id)
    } else {
      await updateService(svc.id, { is_active: true })
    }
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Services</h1>
        {!adding && !editing && (
          <Button onClick={() => setAdding(true)}>Add Service</Button>
        )}
      </div>

      {adding && (
        <ServiceForm onSave={handleCreate} onCancel={() => setAdding(false)} />
      )}

      {editing && (
        <ServiceForm
          initial={editing}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Price Range</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {services.map((svc) => (
                  <tr key={svc.id}>
                    <td className="py-3 font-medium text-navy">{svc.name}</td>
                    <td className="py-3 text-slate">{formatPrice(svc.estPriceMin, svc.estPriceMax)}</td>
                    <td className="py-3 text-slate">{formatDuration(svc.estDurationMinutes)}</td>
                    <td className="py-3">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          svc.isActive
                            ? 'bg-teal-soft text-teal-dark'
                            : 'bg-surface text-muted'
                        }`}
                      >
                        {svc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setAdding(false); setEditing(svc) }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(svc)}
                        >
                          {svc.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-4">
            {services.map((svc) => (
              <Card key={svc.id}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-navy">{svc.name}</p>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      svc.isActive
                        ? 'bg-teal-soft text-teal-dark'
                        : 'bg-surface text-muted'
                    }`}
                  >
                    {svc.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate">{formatPrice(svc.estPriceMin, svc.estPriceMax)} · {formatDuration(svc.estDurationMinutes)}</p>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setAdding(false); setEditing(svc) }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(svc)}
                  >
                    {svc.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Services
