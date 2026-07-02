import { Activity, AlertTriangle, TimerReset, Cpu, MemoryStick, Wifi, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAsync } from '../../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, Badge } from '../../components/ui.jsx'
import { AreaSeries } from '../../components/Charts.jsx'
import { formatDate, formatMinutes, formatPercent, cn } from '../../lib/format.js'

const PERIODS = [
  ['LAST_24_HOURS', '24 Std.'],
  ['LAST_7_DAYS', '7 Tage'],
  ['LAST_14_DAYS', '14 Tage'],
  ['LAST_30_DAYS', '30 Tage'],
  ['LAST_90_DAYS', '90 Tage'],
  ['LAST_180_DAYS', '180 Tage'],
]

function availColor(v) {
  if (v >= 99.9) return 'text-emerald-400'
  if (v >= 99) return 'text-amber-400'
  return 'text-red-400'
}

function incidentMeta(type) {
  if (type === 'PING_TIMEOUT') return { label: 'Ping-Timeout', cls: 'bg-amber-500/15 text-amber-400' }
  if (type === 'VM_STOPPED') return { label: 'Server gestoppt', cls: 'bg-red-500/15 text-red-400' }
  return { label: (type || 'Unbekannt').replaceAll('_', ' '), cls: 'bg-zinc-700/40 text-zinc-300' }
}

export default function MonitoringTab({ id }) {
  const timings = useAsync(() => api.timings(id), [id])
  const incidences = useAsync(() => api.incidences(id), [id])

  const points = (timings.data?.data?.timings || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((t) => ({
      label: formatDate(t.date, { year: undefined, second: undefined }),
      cpu: Number(t.cpu) || 0,
      mem: Number(t.mem) || 0,
      ping: Number(t.ping) || 0,
    }))

  const stats = incidences.data?.data?.statistic || {}
  const incidents = (incidences.data?.data?.incidences || [])
    .slice()
    .sort((a, b) => new Date(b.start) - new Date(a.start))

  return (
    <div className="space-y-4">
      {/* Live-Charts */}
      <Card>
        <CardHeader title="Auslastung" icon={Activity} subtitle="CPU, RAM & Ping im Zeitverlauf" />
        <div className="p-4">
          {timings.loading ? (
            <Loading label="Lade Monitoring-Werte …" />
          ) : timings.error ? (
            <ErrorState error={timings.error} onRetry={timings.refetch} />
          ) : points.length === 0 ? (
            <EmptyState icon={Activity} title="Keine Monitoring-Daten" hint="Aktiviere Monitoring im Control Panel (evtl. 24fire+ erforderlich)." />
          ) : (
            <div className="space-y-6">
              <ChartBlock icon={Cpu} title="CPU-Auslastung" unit="%">
                <AreaSeries data={points} dataKey="cpu" name="CPU" color="#f97316" unit="%" domain={[0, 100]} />
              </ChartBlock>
              <ChartBlock icon={MemoryStick} title="RAM-Auslastung" unit="%">
                <AreaSeries data={points} dataKey="mem" name="RAM" color="#3b82f6" unit="%" domain={[0, 100]} />
              </ChartBlock>
              <ChartBlock icon={Wifi} title="Ping / Antwortzeit" unit="ms">
                <AreaSeries data={points} dataKey="ping" name="Ping" color="#10b981" unit="ms" />
              </ChartBlock>
            </div>
          )}
        </div>
      </Card>

      {/* Verfügbarkeit */}
      <Card>
        <CardHeader title="Verfügbarkeit" icon={CheckCircle2} subtitle="Uptime-Statistik je Zeitraum" />
        <div className="p-4">
          {incidences.loading ? (
            <Loading />
          ) : incidences.error ? (
            <ErrorState error={incidences.error} onRetry={incidences.refetch} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {PERIODS.map(([key, label]) => {
                const s = stats[key]
                const v = Number(s?.availability)
                return (
                  <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-center">
                    <div className="text-xs text-zinc-500">{label}</div>
                    <div className={cn('mt-1 text-lg font-semibold', Number.isFinite(v) ? availColor(v) : 'text-zinc-500')}>
                      {Number.isFinite(v) ? formatPercent(v, 2) : '–'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-600">
                      {s ? `${s.incidences ?? 0} Vorfälle` : '–'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Vorfälle */}
      <Card>
        <CardHeader title="Vorfälle" icon={AlertTriangle} subtitle={`${incidents.length} Einträge`} />
        <div className="p-4">
          {incidences.loading ? (
            <Loading />
          ) : incidents.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Keine Vorfälle" hint="Perfekte Uptime – keine registrierten Ausfälle." />
          ) : (
            <div className="space-y-2">
              {incidents.slice(0, 30).map((inc, i) => {
                const meta = incidentMeta(inc.type)
                const ongoing = !inc.end
                return (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-zinc-400">
                        {formatDate(inc.start)} {inc.end ? `– ${formatDate(inc.end)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {ongoing ? (
                        <Badge className="bg-red-500/15 text-red-400">Andauernd</Badge>
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-500">
                          <TimerReset className="h-3.5 w-3.5" /> {formatMinutes(inc.downtime)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function ChartBlock({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm text-zinc-300">
        <Icon className="h-4 w-4 text-zinc-500" /> {title}
      </div>
      {children}
    </div>
  )
}
