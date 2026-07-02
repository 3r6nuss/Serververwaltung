import { ArrowDownToLine, ArrowUpFromLine, Gauge, CalendarDays, Waypoints } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAsync } from '../../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, StatCard, UsageBar, Badge } from '../../components/ui.jsx'
import { BarSeries } from '../../components/Charts.jsx'
import { formatGB, formatMB, formatDate } from '../../lib/format.js'

export default function TrafficTab({ id }) {
  const current = useAsync(() => api.trafficCurrent(id), [id])
  const log = useAsync(() => api.trafficLog(id), [id])

  const usage = current.data?.data?.usage
  const limit = current.data?.data?.limit
  const month = current.data?.data?.month
  const total = Number(usage?.total) || 0
  const monthly = Number(limit?.monthly) || 0
  const percent = monthly > 0 ? (total / monthly) * 100 : 0

  const vmStatus = limit?.vm_status
  const statusBadge =
    vmStatus === 'normal'
      ? 'bg-emerald-500/15 text-emerald-400'
      : vmStatus === 'limited'
        ? 'bg-red-500/15 text-red-400'
        : 'bg-amber-500/15 text-amber-400'

  const logPoints = (log.data?.data?.log || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => ({
      label: formatDate(e.date, { year: undefined, hour: undefined, minute: undefined }),
      in: Number(e.in) || 0,
      out: Number(e.out) || 0,
    }))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Aktueller Traffic"
          icon={Gauge}
          subtitle={month ? `Abrechnungsmonat ${month}` : undefined}
          action={vmStatus ? <Badge className={statusBadge}>{vmStatus}</Badge> : null}
        />
        <div className="p-4">
          {current.loading ? (
            <Loading />
          ) : current.error ? (
            <ErrorState error={current.error} onRetry={current.refetch} />
          ) : !usage ? (
            <EmptyState icon={Waypoints} title="Keine Traffic-Daten" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard icon={Waypoints} label="Gesamt" value={formatGB(total)} />
                <StatCard icon={ArrowDownToLine} label="Eingehend" value={formatGB(usage.in)} accent="text-emerald-400" />
                <StatCard icon={ArrowUpFromLine} label="Ausgehend" value={formatGB(usage.out)} accent="text-sky-400" />
                <StatCard
                  icon={Gauge}
                  label="Verbleibend"
                  value={limit?.remaining != null ? formatGB(limit.remaining) : '∞'}
                />
              </div>
              {monthly > 0 && (
                <UsageBar
                  label={`Monatslimit (${formatGB(monthly)})`}
                  percent={percent}
                  valueText={`${percent.toFixed(1)} %`}
                />
              )}
              {limit?.additional != null && (
                <p className="text-xs text-zinc-500">Zusätzliches Kontingent: {formatGB(limit.additional)}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Traffic-Verlauf" icon={CalendarDays} subtitle="Ein-/Ausgehend pro Eintrag" />
        <div className="p-4">
          {log.loading ? (
            <Loading />
          ) : log.error ? (
            <ErrorState error={log.error} onRetry={log.refetch} />
          ) : logPoints.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Keine Verlaufsdaten" />
          ) : (
            <>
              <BarSeries
                data={logPoints}
                unit=" MB"
                series={[
                  { key: 'in', name: 'Eingehend', color: '#10b981' },
                  { key: 'out', name: 'Ausgehend', color: '#0ea5e9' },
                ]}
              />
              <p className="mt-2 text-xs text-zinc-600">
                Summe: {formatMB(logPoints.reduce((a, p) => a + p.in + p.out, 0))}
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
