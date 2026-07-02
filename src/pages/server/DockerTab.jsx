import { useState, useEffect, useCallback, useRef } from 'react'
import { Container, Boxes, RefreshCw, Play, CircleDot, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api.js'
import {
  Card,
  CardHeader,
  Button,
  StatusDot,
  Badge,
  StatCard,
  Loading,
  ErrorState,
  EmptyState,
} from '../../components/ui.jsx'
import { Input } from '../../components/ui/input.jsx'
import { Label } from '../../components/ui/label.jsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.jsx'
import DockerContainerDetail from './DockerContainerDetail.jsx'

// "Up 3 hours (healthy)" → "3 hours"; sonst RunningFor als Fallback.
function uptime(c) {
  const m = /^Up\s+(.+?)(?:\s+\(.*\))?$/i.exec(c.status || '')
  if (m) return m[1]
  if (c.runningFor) return c.runningFor.replace(/\s*ago$/i, '')
  return c.status || '–'
}

function ContainerStatus({ c }) {
  const running = c.state === 'running'
  const healthy = /\(healthy\)/i.test(c.status)
  const unhealthy = /\(unhealthy\)/i.test(c.status)
  const cls = !running
    ? 'bg-zinc-700/40 text-zinc-400'
    : unhealthy
      ? 'bg-amber-500/15 text-amber-400'
      : 'bg-emerald-500/15 text-emerald-400'
  const label = !running ? c.state || 'gestoppt' : healthy ? 'healthy' : unhealthy ? 'unhealthy' : 'running'
  return (
    <div className="flex items-center gap-2">
      <StatusDot status={running ? 'online' : 'offline'} />
      <Badge className={cls}>{label}</Badge>
    </div>
  )
}

export default function DockerTab({ config }) {
  const primaryIp = config?.ipv4?.[0]?.ip_address || ''
  const defaultUser = config?.username || 'root'

  const [form, setForm] = useState({
    host: '',
    port: '22',
    username: defaultUser,
    authMethod: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
  })
  const [creds, setCreds] = useState(null) // nur im Speicher, nicht persistiert
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [auto, setAuto] = useState(false)
  const [selected, setSelected] = useState(null) // aktuell geöffneter Container (Detailansicht)
  const timerRef = useRef(null)

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e && e.target ? e.target.value : e }))

  const load = useCallback(async (c) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.dockerStatus(c)
      setData(res)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!form.host.trim()) return
    const c = { ...form }
    setCreds(c)
    load(c)
  }

  const reset = () => {
    setCreds(null)
    setData(null)
    setError(null)
    setAuto(false)
    setSelected(null)
  }

  // Auto-Refresh alle 5 Sekunden mit den im Speicher gehaltenen Zugangsdaten.
  useEffect(() => {
    if (!auto || !creds) return
    timerRef.current = setInterval(() => load(creds), 5000)
    return () => clearInterval(timerRef.current)
  }, [auto, creds, load])

  // Detailansicht eines einzelnen Containers.
  if (selected) {
    return <DockerContainerDetail creds={creds} container={selected} onBack={() => setSelected(null)} />
  }

  if (!creds) {
    return (
      <Card className="max-w-2xl">
        <CardHeader
          title="Docker-Status"
          icon={Container}
          subtitle="Container-Status per SSH auslesen (docker ps / docker stats)"
        />
        <form onSubmit={submit} className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dk-host">Host / IP</Label>
            <Input
              id="dk-host"
              value={form.host}
              onChange={update('host')}
              placeholder={primaryIp ? `z. B. ${primaryIp}` : 'IP-Adresse oder Hostname'}
              className="font-mono"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="dk-port">Port</Label>
              <Input
                id="dk-port"
                type="number"
                value={form.port}
                onChange={update('port')}
                placeholder="22"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dk-user">Benutzer</Label>
              <Input
                id="dk-user"
                value={form.username}
                onChange={update('username')}
                placeholder="root"
                className="font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Authentifizierung</Label>
            <Select value={form.authMethod} onValueChange={update('authMethod')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">Passwort</SelectItem>
                <SelectItem value="key">SSH-Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.authMethod === 'password' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="dk-pw">Passwort</Label>
              <Input
                id="dk-pw"
                type="password"
                value={form.password}
                onChange={update('password')}
                autoComplete="off"
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="dk-key">Privater Schlüssel</Label>
                <textarea
                  id="dk-key"
                  value={form.privateKey}
                  onChange={update('privateKey')}
                  rows={5}
                  spellCheck={false}
                  placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…'}
                  className="flex w-full rounded-md border border-input bg-background/60 px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dk-pass">Passphrase (optional)</Label>
                <Input
                  id="dk-pass"
                  type="password"
                  value={form.passphrase}
                  onChange={update('passphrase')}
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={!form.host.trim()}>
              <Play className="h-4 w-4" /> Laden
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  const containers = data?.containers || []
  const running = containers.filter((c) => c.state === 'running').length
  const stopped = containers.length - running

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot status={error ? 'offline' : 'online'} />
          <span className="font-mono text-foreground">
            {creds.username}@{creds.host}:{creds.port}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Auto-Refresh
          </label>
          <Button variant="ghost" size="sm" onClick={() => load(creds)} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Aktualisieren
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            Andere Zugangsdaten
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Loading label="Lese Docker-Status …" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => load(creds)} />
      ) : data && !data.dockerAvailable ? (
        <Card className="p-6">
          <EmptyState icon={Container} title="Docker nicht verfügbar" hint={data.error} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Boxes} label="Container" value={containers.length} />
            <StatCard icon={CircleDot} label="Laufend" value={running} accent="text-emerald-400" />
            <StatCard icon={CircleDot} label="Gestoppt" value={stopped} accent="text-zinc-400" />
          </div>

          {containers.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={Container}
                title="Keine Container"
                hint="Auf diesem Server laufen aktuell keine Docker-Container."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader
                title="Container"
                icon={Container}
                subtitle={`${containers.length} gesamt · Zeile anklicken für Details, Logs & Aktionen`}
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Image</TableHead>
                      <TableHead>Laufzeit</TableHead>
                      <TableHead className="text-right">CPU</TableHead>
                      <TableHead className="text-right">RAM</TableHead>
                      <TableHead>Ports</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((c) => (
                      <TableRow
                        key={c.id || c.name}
                        onClick={() => setSelected(c)}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <ContainerStatus c={c} />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{c.name || '–'}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                          {c.image || '–'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{uptime(c)}</TableCell>
                        <TableCell className="text-right font-mono">{c.cpu || '–'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {c.mem || '–'}
                          {c.memUsage && (
                            <span className="block text-[10px] text-muted-foreground">{c.memUsage}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                          {c.ports || '–'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <ChevronRight className="h-4 w-4" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Hinweis: Die Zugangsdaten werden ausschließlich für diese Sitzung genutzt und nicht gespeichert.
      </p>
    </div>
  )
}
