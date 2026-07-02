import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAsync } from '../../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, Badge } from '../../components/ui.jsx'

function layer4Meta(v) {
  switch (v) {
    case 'permanent':
      return { icon: ShieldCheck, cls: 'bg-emerald-500/15 text-emerald-400', label: 'Permanent aktiv' }
    case 'dynamic':
      return { icon: ShieldAlert, cls: 'bg-amber-500/15 text-amber-400', label: 'Dynamisch' }
    case 'off':
      return { icon: ShieldX, cls: 'bg-red-500/15 text-red-400', label: 'Deaktiviert' }
    default:
      return { icon: Shield, cls: 'bg-zinc-700/40 text-zinc-300', label: v || 'Unbekannt' }
  }
}

function layer7Meta(v) {
  if (v === 'on') return { icon: ShieldCheck, cls: 'bg-emerald-500/15 text-emerald-400', label: 'Aktiv' }
  if (v === 'off') return { icon: ShieldX, cls: 'bg-red-500/15 text-red-400', label: 'Deaktiviert' }
  return { icon: Shield, cls: 'bg-zinc-700/40 text-zinc-300', label: v || 'Unbekannt' }
}

export default function DdosTab({ id }) {
  const { data, loading, error, refetch } = useAsync(() => api.ddos(id), [id])
  const entries = data?.data ? Object.entries(data.data) : []

  return (
    <Card>
      <CardHeader title="DDoS-Schutz" icon={Shield} subtitle="Layer 4 & Layer 7 pro IP-Adresse" />
      <div className="p-4">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : entries.length === 0 ? (
          <EmptyState icon={Shield} title="Keine DDoS-Informationen" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map(([ip, cfg]) => {
              const l4 = layer4Meta(cfg.layer4)
              const l7 = layer7Meta(cfg.layer7)
              const L4 = l4.icon
              const L7 = l7.icon
              return (
                <div key={ip} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-3 font-mono text-sm text-zinc-200">{ip}</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Layer 4 (Netzwerk)</span>
                      <Badge className={l4.cls}>
                        <L4 className="h-3 w-3" /> {l4.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Layer 7 (Anwendung)</span>
                      <Badge className={l7.cls}>
                        <L7 className="h-3 w-3" /> {l7.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
