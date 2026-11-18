import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { adminLogin, adminLogout, getAdminUser } from '../api/admin.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('autosense_admin_token')
    if (!token) {
      setLoading(false)
      return
    }
    getAdminUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const u = await adminLogin(email, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await adminLogout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
