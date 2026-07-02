import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  DownloadCloud,
  ScrollText,
  Network,
  HardDrive,
  Server,
  Cpu,
  MemoryStick,
  KeyRound,
  RefreshCw,
} from 'lucide-react'
import { api } from '../../lib/api.js'
import { Card, CardHeader, Button, Badge, StatusDot, Alert, Loading, ErrorState, Spinner } from '../../components/ui.jsx'
import { AreaSeries } from '../../components/Charts.jsx'
import { relativeTime, formatDate } from '../../lib/format.js'

function parsePct(v) {
  const n = parseFloat(String(v ?? '').replace('%', ''))
  return Number.isFinite(n) ? n : 0
}

function Info({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? 'break-all font-mono text-sm text-foreground' : 'text-sm text-foreground'}>
        {value || '–'}
      </span>
    </div>
  )
}

export default function DockerContainerDetail({ creds, container, onBack }) {
  const cid = container.id || container.name

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [busy, setBusy] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)

  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  const [history, setHistory] = useState([])
  const [latest, setLatest] = useState(null)

  const loadInspect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.dockerInspect(creds, cid)
      setDetail(res.detail || null)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [creds, cid])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await api.dockerLogs(creds, cid, 300)
      setLogs(res.logs || '(keine Ausgabe)')
    } catch (err) {
      setLogs('Fehler: ' + (err.message || String(err)))
    } finally {
      setLogsLoading(false)
    }
  }, [creds, cid])

  useEffect(() => {
    loadInspect()
    loadLogs()
  }, [loadInspect, loadLogs])

  // Live-Auslastung (nur bei laufendem Container) für das Verlaufsdiagramm.
  const running = (detail?.state || container.state) === 'running'
  useEffect(() => {
    if (!running) return
    let alive = true
    const poll = async () => {
      try {
        const res = await api.dockerStats(creds, cid)
        if (!alive || !res.stats) return
        setLatest(res.stats)
        setHistory((h) => [
          ...h.slice(-29),
          {
            label: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: parsePct(res.stats.cpu),
            mem: parsePct(res.stats.mem),
          },
        ])
      } catch {
        /* ignore */
      }
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [running, creds, cid])

  const runAction = async (action) => {
    setBusy(action)
    setActionMsg(null)
    try {
      const res = await api.dockerAction(creds, action, cid)
      setActionMsg({ ok: res.ok !== false, text: res.output || res.error || `„${action}" ausgeführt.` })
      setTimeout(loadInspect, 800)
    } catch (err) {
      setActionMsg({ ok: false, text: err.message || String(err) })
    } finally {
      setBusy(null)
    }
  }

  const stateBadge = (() => {
    const s = detail?.state || container.state
    const health = detail?.health
    if (s !== 'running') return { cls: 'bg-zinc-700/40 text-zinc-400', label: s || 'gestoppt' }
    if (health === 'unhealthy') return { cls: 'bg-amber-500/15 text-amber-400', label: 'unhealthy' }
    if (health === 'healthy') return { cls: 'bg-emerald-500/15 text-emerald-400', label: 'healthy' }
    return { cls: 'bg-emerald-500/15 text-emerald-400', label: 'running' }
  })()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
        </button>
        <Button variant="ghost" size="sm" onClick={loadInspect} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Neu laden
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusDot status={running ? 'online' : 'offline'} />
        <h2 className="text-xl font-semibold text-foreground">{detail?.name || container.name}</h2>
        <Badge className={stateBadge.cls}>{stateBadge.label}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{detail?.id || container.id}</span>
      </div>

      {/* Aktionen */}
      <div className="flex flex-wrap items-center gap-2">
        {!running && (
          <Button variant="primary" size="sm" onClick={() => runAction('start')} loading={busy === 'start'}>
            <Play className="h-4 w-4" /> Start
          </Button>
        )}
        {running && (
          <Button variant="danger" size="sm" onClick={() => runAction('stop')} loading={busy === 'stop'}>
            <Square className="h-4 w-4" /> Stop
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => runAction('restart')} loading={busy === 'restart'}>
          <RotateCw className="h-4 w-4" /> Neustart
        </Button>
        <Button variant="ghost" size="sm" onClick={() => runAction('pull')} loading={busy === 'pull'}>
          <DownloadCloud className="h-4 w-4" /> Image neu ziehen
        </Button>
      </div>

      {actionMsg && (
        <Alert kind={actionMsg.ok ? 'success' : 'error'}>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{actionMsg.text}</pre>
        </Alert>
      )}

      {loading && !detail ? (
        <Loading label="Lade Container-Details …" />
      ) : error ? (
        <ErrorState error={error} onRetry={loadInspect} />
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Allgemein" icon={Server} />
              <div className="grid grid-cols-2 gap-x-4 px-4 pb-3">
                <Info label="Status" value={detail?.state} />
                <Info label="Health" value={detail?.health || '–'} />
                <Info label="Läuft seit" value={running && detail?.startedAt ? relativeTime(detail.startedAt) : '–'} />
                <Info label="Neustarts" value={String(detail?.restartCount ?? 0)} />
                <Info label="Restart-Policy" value={detail?.restartPolicy || '–'} />
                <Info label="Exit-Code" value={detail?.exitCode != null ? String(detail.exitCode) : '–'} />
                <Info label="Erstellt" value={detail?.created ? formatDate(detail.created) : '–'} />
                <Info label="Arbeitsverzeichnis" value={detail?.workingDir} mono />
              </div>
              <div className="border-t border-border px-4 py-3">
                <Info label="Image" value={detail?.image} mono />
                <Info label="Command" value={detail?.cmd} mono />
                {detail?.entrypoint && <Info label="Entrypoint" value={detail.entrypoint} mono />}
              </div>
            </Card>

            {/* Auslastung */}
            <Card>
              <CardHeader
                title="Auslastung"
                icon={Cpu}
                subtitle={running ? 'Live (alle 3 s)' : 'Container läuft nicht'}
                action={
                  latest ? (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-fire-400"><Cpu className="h-3.5 w-3.5" /> {latest.cpu}</span>
                      <span className="flex items-center gap-1 text-blue-400"><MemoryStick className="h-3.5 w-3.5" /> {latest.mem}</span>
                    </div>
                  ) : null
                }
              />
              <div className="p-3">
                {!running ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Keine Live-Daten – Container ist gestoppt.</p>
                ) : history.length < 2 ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Spinner /> Sammle Messwerte …
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">CPU</div>
                      <AreaSeries data={history} dataKey="cpu" name="CPU" color="#f97316" unit="%" domain={[0, 'auto']} height={130} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">RAM {latest?.memUsage ? `(${latest.memUsage})` : ''}</div>
                      <AreaSeries data={history} dataKey="mem" name="RAM" color="#3b82f6" unit="%" domain={[0, 'auto']} height={130} />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Netzwerke / Ports / Mounts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Netzwerke" icon={Network} subtitle={`${detail?.networks?.length || 0}`} />
              <div className="space-y-1 p-4 text-sm">
                {detail?.networks?.length ? (
                  detail.networks.map((n) => (
                    <div key={n.name} className="flex items-center justify-between gap-2">
                      <span className="text-foreground">{n.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{n.ip || '–'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">–</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Ports" icon={Network} subtitle={`${detail?.ports?.length || 0}`} />
              <div className="space-y-1 p-4 font-mono text-xs">
                {detail?.ports?.length ? (
                  detail.ports.map((p) => (
                    <div key={p.container} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{p.host || '–'}</span>
                      <span className="text-foreground">→ {p.container}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">–</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Volumes / Mounts" icon={HardDrive} subtitle={`${detail?.mounts?.length || 0}`} />
              <div className="space-y-2 p-4 text-xs">
                {detail?.mounts?.length ? (
                  detail.mounts.map((m, idx) => (
                    <div key={idx} className="font-mono">
                      <div className="truncate text-muted-foreground">{m.source}</div>
                      <div className="truncate text-foreground">→ {m.dest} <span className="text-muted-foreground">({m.rw ? 'rw' : 'ro'})</span></div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">–</p>
                )}
              </div>
            </Card>
          </div>

          {/* Umgebungsvariablen */}
          {detail?.env?.length > 0 && (
            <Card>
              <CardHeader title="Umgebungsvariablen" icon={KeyRound} subtitle="Geheimnisse maskiert" />
              <div className="grid gap-1 p-4 font-mono text-xs md:grid-cols-2">
                {detail.env.map((e, idx) => (
                  <div key={idx} className="truncate text-muted-foreground">{e}</div>
                ))}
              </div>
            </Card>
          )}

          {/* Logs */}
          <Card>
            <CardHeader
              title="Logs"
              icon={ScrollText}
              subtitle="letzte 300 Zeilen"
              action={
                <Button variant="ghost" size="sm" onClick={loadLogs} loading={logsLoading}>
                  <RefreshCw className="h-4 w-4" /> Aktualisieren
                </Button>
              }
            />
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all bg-[#0a0a0b] p-4 font-mono text-xs leading-relaxed text-zinc-300">
              {logsLoading && !logs ? 'Lade Logs …' : logs || '(keine Ausgabe)'}
            </pre>
          </Card>
        </>
      )}
    </div>
  )
}
