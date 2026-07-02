import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Server, Activity, Gauge, DatabaseBackup, Shield, Container, TerminalSquare, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAsync } from '../lib/hooks.js'
import { Loading, ErrorState, Tabs, Button, Badge } from '../components/ui.jsx'
import PowerControls from '../components/PowerControls.jsx'
import OverviewTab from './server/OverviewTab.jsx'
import MonitoringTab from './server/MonitoringTab.jsx'
import TrafficTab from './server/TrafficTab.jsx'
import BackupsTab from './server/BackupsTab.jsx'
import DdosTab from './server/DdosTab.jsx'
import ConsoleTab from './server/ConsoleTab.jsx'
import DockerTab from './server/DockerTab.jsx'

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: Server },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'traffic', label: 'Traffic', icon: Gauge },
  { id: 'backups', label: 'Backups', icon: DatabaseBackup },
  { id: 'ddos', label: 'DDoS', icon: Shield },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'console', label: 'Konsole', icon: TerminalSquare },
]

export default function ServerDetail() {
  const { id } = useParams()
  const [tab, setTab] = useState('overview')
  const { data, loading, error, refetch } = useAsync(() => api.kvmConfig(id), [id])

  const config = data?.data?.config || null
  const primaryIp = config?.ipv4?.[0]?.ip_address

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-zinc-100">{config?.hostname || id}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            {primaryIp && <span className="font-mono">{primaryIp}</span>}
            {config?.os?.displayname && (
              <>
                <span className="text-zinc-700">·</span>
                <span>{config.os.displayname}</span>
              </>
            )}
            {config?.monitoring && (
              <>
                <span className="text-zinc-700">·</span>
                <Badge className={config.monitoring.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700/40 text-zinc-400'}>
                  Monitoring {config.monitoring.enabled ? 'aktiv' : 'aus'}
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={refetch} loading={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <PowerControls id={id} onDone={() => setTimeout(refetch, 1500)} />
        </div>
      </div>

      {loading && !data ? (
        <Loading label="Lade Server-Konfiguration …" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div>
            {tab === 'overview' && <OverviewTab config={config} />}
            {tab === 'monitoring' && <MonitoringTab id={id} />}
            {tab === 'traffic' && <TrafficTab id={id} />}
            {tab === 'backups' && <BackupsTab id={id} />}
            {tab === 'ddos' && <DdosTab id={id} />}
            {tab === 'docker' && <DockerTab config={config} />}
            {tab === 'console' && <ConsoleTab config={config} />}
          </div>
        </>
      )}
    </div>
  )
}
