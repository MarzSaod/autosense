import { useState, useEffect, Fragment } from 'react'
import Card from '../components/ui/Card.jsx'
import Input from '../components/ui/Input.jsx'
import Select from '../components/ui/Select.jsx'
import FormField from '../components/ui/FormField.jsx'
import Button from '../components/ui/Button.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import { useAuth } from './AuthContext.jsx'
import { getStaff, createStaffUser, updateStaffUser, deleteStaffUser } from '../api/admin.js'

function Staff() {
  const { user: currentUser } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'staff' })
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)

  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <Card>
          <p className="text-muted text-center">Only administrators can manage staff accounts.</p>
        </Card>
      </div>
    )
  }

  async function load() {
    setLoading(true)
    try {
      setStaff(await getStaff())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreateForm() {
    setEditingId(null)
    setFormData({ name: '', email: '', password: '', role: 'staff' })
    setFormErrors({})
    setShowForm(true)
  }

  function openEditForm(member) {
    setEditingId(member.id)
    setFormData({ name: member.name, email: member.email, password: '', role: member.role })
    setFormErrors({})
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormErrors({})
  }

  function validate() {
    const errors = {}
    if (!formData.name.trim()) errors.name = 'Name is required'
    if (!formData.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email'
    if (!editingId) {
      if (!formData.password) errors.password = 'Password is required'
      else if (formData.password.length < 8) errors.password = 'Minimum 8 characters'
    }
    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateStaffUser(editingId, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
        })
      } else {
        await createStaffUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        })
      }
      closeForm()
      await load()
    } catch (err) {
      if (err.status === 409) {
        setFormErrors({ email: 'Email already in use' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await deleteStaffUser(id)
    setDeletingId(null)
    await load()
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Staff</h1>
        {!showForm && (
          <Button onClick={openCreateForm}>Add Staff Member</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-navy">
              {editingId ? 'Edit Staff Member' : 'Add Staff Member'}
            </h2>

            <FormField id="staff-name" label="Name" error={formErrors.name}>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                error={!!formErrors.name}
              />
            </FormField>

            <FormField id="staff-email" label="Email" error={formErrors.email}>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
                error={!!formErrors.email}
              />
            </FormField>

            {!editingId && (
              <FormField
                id="staff-password"
                label="Password"
                error={formErrors.password}
                hint="Minimum 8 characters"
              >
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((d) => ({ ...d, password: e.target.value }))}
                  error={!!formErrors.password}
                />
              </FormField>
            )}

            <FormField id="staff-role" label="Role">
              <Select
                value={formData.role}
                onChange={(e) => setFormData((d) => ({ ...d, role: e.target.value }))}
                disabled={editingId === currentUser?.id}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>
            </FormField>

            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                {editingId ? 'Save' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Added</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staff.map((m) => {
                  const isSelf = m.id === currentUser?.id
                  return (
                    <Fragment key={m.id}>
                      <tr>
                        <td className="py-3 font-medium text-navy">
                          {m.name}
                          {isSelf && <span className="ml-2 text-xs text-muted">You</span>}
                        </td>
                        <td className="py-3 text-slate">{m.email}</td>
                        <td className="py-3">
                          {m.role === 'admin' ? (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-soft text-teal-dark">
                              admin
                            </span>
                          ) : (
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface text-muted">
                              staff
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-slate">{formatDate(m.createdAt)}</td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
                              onClick={() => openEditForm(m)}
                            >
                              Edit
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                className="text-sm font-medium text-danger hover:opacity-80 transition-colors"
                                onClick={() => setDeletingId(m.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {deletingId === m.id && (
                        <tr>
                          <td colSpan={5} className="py-3">
                            <div className="flex items-center gap-3 pl-4">
                              <span className="text-sm text-slate">
                                Remove this staff member? This cannot be undone.
                              </span>
                              <Button
                                size="sm"
                                className="!bg-danger !text-white hover:!opacity-80"
                                onClick={() => handleDelete(m.id)}
                              >
                                Yes, remove
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden flex flex-col gap-4">
            {staff.map((m) => {
              const isSelf = m.id === currentUser?.id
              return (
                <div key={m.id}>
                  <Card>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-navy">
                          {m.name}
                          {isSelf && <span className="ml-2 text-xs text-muted">You</span>}
                        </p>
                        <p className="text-xs text-muted">{m.email}</p>
                      </div>
                      {m.role === 'admin' ? (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-soft text-teal-dark">
                          admin
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface text-muted">
                          staff
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mb-3">Added {formatDate(m.createdAt)}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
                        onClick={() => openEditForm(m)}
                      >
                        Edit
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          className="text-sm font-medium text-danger hover:opacity-80 transition-colors"
                          onClick={() => setDeletingId(m.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </Card>
                  {deletingId === m.id && (
                    <div className="flex items-center gap-3 mt-2 px-4">
                      <span className="text-sm text-slate">
                        Remove this staff member? This cannot be undone.
                      </span>
                      <Button
                        size="sm"
                        className="!bg-danger !text-white hover:!opacity-80"
                        onClick={() => handleDelete(m.id)}
                      >
                        Yes, remove
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default Staff
