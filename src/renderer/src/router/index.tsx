import { createHashRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import ProtectedRoute from '@renderer/components/ProtectedRoute'

const router = createHashRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/register',
    element: <RegisterPage />
  },
  {
    path: '/change-password',
    element: <ChangePasswordPage />
  },
  {
    path: '/',
    element: <ProtectedRoute />
  }
])

export default router
