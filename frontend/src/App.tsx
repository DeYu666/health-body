import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/routing/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppStateProvider } from './context/AppStateContext'
import { ArchivePage } from './pages/ArchivePage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MetricEntryPage } from './pages/MetricEntryPage'
import { MetricTrendPage } from './pages/MetricTrendPage'
import { PinPage } from './pages/PinPage'
import { ReportDetailPage } from './pages/ReportDetailPage'
import { UploadPage } from './pages/UploadPage'

const AppRoutes = () => {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pin" element={<PinPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/metrics/new" element={<MetricEntryPage />} />
          <Route path="/metrics/trends" element={<MetricTrendPage />} />
          <Route path="/reports/:reportId" element={<ReportDetailPage />} />
        </Route>
      </Route>

      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
      />
    </Routes>
  )
}

const App = () => {
  return (
    <AuthProvider>
      <AppStateProvider>
        <AppRoutes />
      </AppStateProvider>
    </AuthProvider>
  )
}

export default App
