import { useState, useEffect, useCallback, useRef } from 'react'
import { ScrollText, RefreshCw, TerminalSquare, Container } from 'lucide-react'
import { api } from '../lib/api.js'
import {
  Card,
  CardHeader,
  Button,
  Badge,
  Loading,
  ErrorState,
  EmptyState,
} from '../components/ui.jsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.jsx'
import { formatDate } from '../lib/format.js'

const FILTERS = [
  { id: '', label: 'Alle' },
  { id: 'ssh', label: 'SSH' },
  { id: 'docker', label: 'Docker' },
]

function TypeBadge({ type }) {
  if (type === 'ssh')
    return (
      <Badge className="bg-violet-500/15 text-violet-300">
        <TerminalSquare className="h-3 w-3" /> SSH
      </Badge>
    )
  if (type === 'docker')
    return (
      <Badge className="bg-sky-500/15 text-sky-300">
        <Container className="h-3 w-3" /> Docker
      </Badge>
    )
  return <Badge>{type || '–'}</Badge>
}

function StatusBadge({ status }) {
  const map = {
    ok: 'bg-emerald-500/15 text-emerald-400',
    connected: 'bg-emerald-500/15 text-emerald-400',
    attempt: 'bg-amber-500/15 text-amber-400',
    closed: 'bg-zinc-700/40 text-zinc-400',
    error: 'bg-red-500/15 text-red-400',
  }
  return <Badge className={map[status] || 'bg-zinc-700/40 text-zinc-400'}>{status || '–'}</Badge>
}

export default function Logs() {
  const [type, setType] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [auto, setAuto] = useState(false)
  const timerRef = useRef(null)

  const load = useCallback(async (t) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.logs(t || undefined)
      setEntries(res.entries || [])
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(type)
  }, [load, type])

  useEffect(() => {
    if (!auto) return
    timerRef.current = setInterval(() => load(type), 10000)
    return () => clearInterval(timerRef.current)
  }, [auto, type, load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zugriffe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protokoll aller SSH- und Docker-Zugriffe (Zeit, IP, Aktion, Host, Benutzer, Ergebnis). Passwörter und
          Schlüssel werden nie gespeichert.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setType(f.id)}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (type === f.id ? 'bg-fire-600/20 text-fire-300' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Auto-Refresh (10 s)
          </label>
          <Button variant="ghost" size="sm" onClick={() => load(type)} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Aktualisieren
          </Button>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <Loading label="Lade Protokoll …" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => load(type)} />
      ) : entries.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ScrollText}
            title="Keine Einträge"
            hint="Sobald du dich per SSH verbindest oder Docker abfragst, erscheinen hier die Zugriffe."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="Protokoll" icon={ScrollText} subtitle={`${entries.length} Einträge (neueste zuerst)`} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Aktion</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meldung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(e.time, { second: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={e.type} />
                    </TableCell>
                    <TableCell className="text-foreground">{e.action || '–'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.ip || '–'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.host || '–'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.username || '–'}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={e.message || ''}>
                      {e.message || '–'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
