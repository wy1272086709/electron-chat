import { createHashRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import ProtectedRoute from '@renderer/components/layout/ProtectedRoute'
import Layout from '@renderer/pages/Layout'
import ChatRoute from '@renderer/pages/routes/ChatRoute'
import ContactsRoute from '@renderer/pages/routes/ContactsRoute'
import NotificationsRoute from '@renderer/pages/routes/NotificationsRoute'
import FavoritesRoute from '@renderer/pages/routes/FavoritesRoute'

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
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            index: true,
            element: <ChatRoute type="chat" />
          },
          {
            path: 'messages',
            element: <ChatRoute type="chat" />
          },
          {
            path: 'groups',
            element: <ChatRoute type="groups" />
          },
          {
            path: 'contacts',
            element: <ContactsRoute />
          },
          {
            path: 'notifications',
            element: <NotificationsRoute />
          },
          {
            path: 'favorites',
            element: <FavoritesRoute />
          }
        ]
      }
    ]
  }
])

export default router
