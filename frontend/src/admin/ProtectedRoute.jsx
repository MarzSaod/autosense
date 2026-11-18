import { Navigate, Outlet } from 'react-router-dom'
import Spinner from '../components/ui/Spinner.jsx'
import { useAuth } from './AuthContext.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="h-8 w-8 text-teal" />
      </div>
    )
  }

  if (!user) return <Navigate to="/admin/login" replace />

  return children || <Outlet />
}

export default ProtectedRoute
