import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import MainLayout from './pages/MainLayout'
import './assets/main.css'

function App(): React.JSX.Element {
  // 检查用户是否已登录
  const isAuthenticated = localStorage.getItem('isLoggedIn') === 'true'

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Router>
  )
}

export default App
