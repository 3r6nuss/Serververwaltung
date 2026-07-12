import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import AuthGate from './components/AuthGate.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ServerDetail from './pages/ServerDetail.jsx'
import Domains from './pages/Domains.jsx'
import Account from './pages/Account.jsx'
import Logs from './pages/Logs.jsx'
import Updates from './pages/Updates.jsx'

export default function App() {
  return (
    <AuthGate>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/server/:id" element={<ServerDetail />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthGate>
  )
}
