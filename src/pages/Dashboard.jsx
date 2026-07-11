import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  RefreshCw,
  Globe,
  Wifi,
  ChevronRight,
  ServerCog,
  Terminal,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { api } from '../lib/api.js'
import { useAsync, useInterval } from '../lib/hooks.js'
import {
  Card,
  StatCard,
  StatusDot,
  UsageBar,
  Loading,
  ErrorState,
  EmptyState,
  Badge,
  Button,
  Alert,
} from '../components/ui.jsx'
import PowerControls from '../components/PowerControls.jsx'
import { cn, statusMeta, formatMemMB, formatGB, relativeTime } from '../lib/format.js'

function SetupGuide() {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <ServerCog className="mt-0.5 h-6 w-6 shrink-0 text-fire-400" />
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Willkommen! Noch ein Schritt.</h2>
            <p className="text-sm text-zinc-400">
              Damit die Verwaltung deine Server anzeigen kann, wird ein 24fire API-Key benötigt.
            </p>
          </div>
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-zinc-300">
            <li>
              API-Key im{' '}
              <a className="text-fire-400 hover:underline" href="https://cp.24fire.de" target="_blank" rel="noreferrer">
                Control Panel
              </a>{' '}
              erstellen (Account → Einstellungen → API).
            </li>
            <li>
              Datei <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">.env</code> im Projektordner
              anlegen (Vorlage: <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">.env.example</code>).
            </li>
            <li>
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">FIRE_API_KEY=dein_key</code> eintragen
              und den Server neu starten.
            </li>
          </ol>
        </div>
      </div>
    </Card>
  )
}

function MetricRow({ latest, monitoringAvailable }) {
  if (!monitoringAvailable) {
    return (
      <Alert kind="warning">Monitoring nicht verfügbar (evtl. 24fire+ erforderlich).</Alert>
    )
  }
  if (!latest) {
    return <p className="text-xs text-zinc-500">Monitoring deaktiviert – keine Live-Werte.</p>
  }
  return (
    <div className="space-y-2.5">
      <UsageBar label="CPU" percent={latest.cpu} valueText={`${Number(latest.cpu ?? 0).toFixed(1)} %`} />
      <UsageBar label="RAM" percent={latest.mem} valueText={`${Number(latest.mem ?? 0).toFixed(1)} %`} />
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5" /> Ping
        </span>
        <span className="font-medium text-zinc-200">{latest.ping != null ? `${latest.ping} ms` : '–'}</span>
      </div>
      <p className="text-[11px] text-zinc-600">Aktualisiert {relativeTime(latest.date)}</p>
    </div>
  )
}

function ServerCard({ srv, onChanged }) {
  const cfg = srv.config || {}
  const meta = statusMeta(srv.status)
  const ip = cfg.ipv4?.[0]?.ip_address
  const os = cfg.os?.displayname || cfg.os?.name

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={srv.status} />
            <Link to={`/server/${srv.internal_id}`} className="truncate text-base font-semibold text-zinc-100 hover:text-fire-300">
              {srv.name}
            </Link>
          </div>
          {ip && <p className="mt-0.5 font-mono text-xs text-zinc-500">{ip}</p>}
        </div>
        <Badge className={cn('ring-1', meta.text, meta.ring)}>{meta.label}</Badge>
      </div>

      {os && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
          <Server className="h-3.5 w-3.5" /> {os}
        </div>
      )}

      <div className="mt-4 flex-1">
        <MetricRow latest={srv.latest} monitoringAvailable={srv.monitoringAvailable} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3 text-center text-xs">
        <div>
          <div className="flex items-center justify-center gap-1 text-zinc-500">
            <Cpu className="h-3.5 w-3.5" /> Kerne
          </div>
          <div className="mt-0.5 font-medium text-zinc-200">{cfg.cores ?? '–'}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-zinc-500">
            <MemoryStick className="h-3.5 w-3.5" /> RAM
          </div>
          <div className="mt-0.5 font-medium text-zinc-200">{cfg.mem ? formatMemMB(cfg.mem) : '–'}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-zinc-500">
            <HardDrive className="h-3.5 w-3.5" /> Disk
          </div>
          <div className="mt-0.5 font-medium text-zinc-200">{cfg.disk ? formatGB(cfg.disk) : '–'}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <PowerControls id={srv.internal_id} compact onDone={onChanged} />
        <Link
          to={`/server/${srv.internal_id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-fire-300"
        >
          Details <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  )
}

const serviceStatus = {
  up: { label: 'Online', dot: 'online', badge: 'text-emerald-400 ring-emerald-500/30' },
  degraded: { label: 'Eingeschränkt', dot: 'unknown', badge: 'text-amber-400 ring-amber-500/30' },
  down: { label: 'Offline', dot: 'offline', badge: 'text-red-400 ring-red-500/30' },
  unconfigured: { label: 'Nicht konfiguriert', dot: 'unknown', badge: 'text-zinc-400 ring-zinc-600' },
  unknown: { label: 'Unbekannt', dot: 'unknown', badge: 'text-zinc-400 ring-zinc-600' },
}

function ServiceHealthSection() {
  const { data, loading, error, refetch } = useAsync(() => api.serviceHealth(true), [])
  const refresh = () => refetch()
  const services = data?.services || []
  const online = services.filter((service) => service.status === 'up').length
  const down = services.filter((service) => service.status === 'down').length

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Dienste</h2>
          <p className="text-xs text-zinc-500">APIs, Abhängigkeiten und Verfügbarkeit im gespeicherten Messverlauf</p>
        </div>
        <Button variant="ghost" onClick={refresh} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Jetzt prüfen
        </Button>
      </div>

      {loading && !data ? (
        <Loading label="Prüfe Dienste …" />
      ) : error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard icon={Activity} label="Online" value={`${online} / ${services.length}`} accent="text-emerald-400" />
            <StatCard icon={TriangleAlert} label="Offline" value={down} accent={down ? 'text-red-400' : 'text-zinc-500'} />
            <StatCard icon={Timer} label="Prüfintervall" value={`${Math.round((data?.intervalMs || 0) / 1000)} s`} />
          </div>

          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_110px_repeat(4,minmax(80px,1fr))] gap-3 border-b border-zinc-800 px-4 py-2 text-[11px] font-medium uppercase text-zinc-500 lg:grid">
              <span>Dienst</span><span>Status</span><span>Latenz</span><span>Uptime</span><span>P95</span><span>Ausfälle</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {services.map((service) => {
                const meta = serviceStatus[service.status] || serviceStatus.unknown
                return (
                  <div key={service.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1.4fr)_110px_repeat(4,minmax(80px,1fr))] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-zinc-100">
                        <StatusDot status={meta.dot} /> {service.name}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                        {service.checkedAt ? `Geprüft ${relativeTime(service.checkedAt)}` : service.message}
                      </p>
                    </div>
                    <Badge className={cn('w-fit ring-1', meta.badge)}>{meta.label}</Badge>
                    <div className="grid grid-cols-4 gap-3 text-sm lg:contents">
                      <span title="Antwortzeit"><span className="text-zinc-600 lg:hidden">Latenz </span>{service.latencyMs != null ? `${service.latencyMs} ms` : '–'}</span>
                      <span title="Verfügbarkeit"><span className="text-zinc-600 lg:hidden">Uptime </span>{service.statistics.uptimePercent != null ? `${service.statistics.uptimePercent} %` : '–'}</span>
                      <span title="95. Perzentil"><span className="text-zinc-600 lg:hidden">P95 </span>{service.statistics.p95LatencyMs != null ? `${service.statistics.p95LatencyMs} ms` : '–'}</span>
                      <span title="Fehlgeschlagene Prüfungen"><span className="text-zinc-600 lg:hidden">Ausfälle </span>{service.statistics.outages}</span>
                    </div>
                    {service.message && service.status === 'down' && (
                      <p className="text-xs text-red-400 lg:col-span-6">{service.message}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}
    </section>
  )
}

export default function Dashboard() {
  const [auto, setAuto] = useState(true)
  const { data, loading, error, refetch } = useAsync(() => api.overview(), [])
  useInterval(() => auto && refetch(), auto ? 20000 : null)

  const notConfigured = error && /API-Key/i.test(error)
  const servers = data?.servers || []

  const online = servers.filter((s) => s.status === 'online').length
  const totalRam = servers.reduce((a, s) => a + (Number(s.config?.mem) || 0), 0)
  const totalCores = servers.reduce((a, s) => a + (Number(s.config?.cores) || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500">Health-Checks & Auslastung deiner KVM-Server</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="h-3.5 w-3.5 accent-fire-500"
            />
            Auto-Refresh
          </label>
          <Button variant="ghost" onClick={refetch} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Aktualisieren
          </Button>
        </div>
      </div>

      <ServiceHealthSection />

      {notConfigured ? (
        <SetupGuide />
      ) : loading && !data ? (
        <Loading label="Lade Serverübersicht …" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : servers.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Server}
            title="Keine KVM-Server gefunden"
            hint="Auf diesem Account sind aktuell keine KVM-Server aktiv."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Server} label="Server" value={servers.length} />
            <StatCard icon={Activity} label="Online" value={`${online} / ${servers.length}`} accent="text-emerald-400" />
            <StatCard icon={Cpu} label="CPU-Kerne" value={totalCores || '–'} />
            <StatCard icon={MemoryStick} label="RAM gesamt" value={totalRam ? formatMemMB(totalRam) : '–'} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((srv) => (
              <ServerCard key={srv.internal_id} srv={srv} onChanged={() => setTimeout(refetch, 1500)} />
            ))}
          </div>

          {data?.fetchedAt && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-600">
              <Terminal className="h-3.5 w-3.5" /> Stand: {relativeTime(data.fetchedAt)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
