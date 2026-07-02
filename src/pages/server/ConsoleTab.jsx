import { useEffect, useRef, useState, useCallback } from 'react'
import { TerminalSquare, Plug, PlugZap } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Card, CardHeader, Button, StatusDot } from '../../components/ui.jsx'
import { getToken } from '../../lib/api.js'
import { Input } from '../../components/ui/input.jsx'
import { Label } from '../../components/ui/label.jsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx'

// Farbschema passend zum Dark-Theme (Feuer-Orange als Cursor).
const TERM_THEME = {
  background: '#0a0a0b',
  foreground: '#e4e4e7',
  cursor: '#f97316',
  cursorAccent: '#0a0a0b',
  selectionBackground: '#3f3f46',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
}

// Baut die WebSocket-URL (gleicher Origin; im Dev leitet Vite /api → 3001 weiter).
function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const token = getToken()
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${proto}://${window.location.host}/api/ssh${query}`
}

export default function ConsoleTab({ config }) {
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
  const [session, setSession] = useState(null) // Snapshot der Zugangsdaten beim Verbinden
  const [status, setStatus] = useState('idle') // idle | connecting | connected | error | closed
  const [message, setMessage] = useState('')

  const containerRef = useRef(null)
  const wsRef = useRef(null)

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e && e.target ? e.target.value : e }))

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {
        /* ignore */
      }
      wsRef.current = null
    }
    setSession(null)
    setStatus('idle')
    setMessage('')
  }, [])

  // Terminal- und WebSocket-Lebenszyklus, sobald eine Sitzung gestartet wird.
  useEffect(() => {
    if (!session) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      fontSize: 13,
      theme: TERM_THEME,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    term.focus()

    setStatus('connecting')
    setMessage('Verbinde …')

    const ws = new WebSocket(wsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'auth',
          host: session.host,
          port: Number(session.port) || 22,
          username: session.username,
          authMethod: session.authMethod,
          password: session.password,
          privateKey: session.privateKey,
          passphrase: session.passphrase,
          cols: term.cols,
          rows: term.rows,
        })
      )
    }

    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'data') {
        term.write(msg.data)
      } else if (msg.type === 'status') {
        setStatus('connected')
        setMessage(msg.message || '')
      } else if (msg.type === 'error') {
        setStatus('error')
        setMessage(msg.message || 'Fehler')
        term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`)
      } else if (msg.type === 'close') {
        setStatus('closed')
        setMessage('Verbindung geschlossen.')
      }
    }

    ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'))
    ws.onerror = () => {
      setStatus('error')
      setMessage('WebSocket-Fehler.')
    }

    const onData = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: d }))
      }
    })
    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })
    const handleWindowResize = () => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      onData.dispose()
      onResize.dispose()
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      term.dispose()
      wsRef.current = null
    }
  }, [session])

  const connect = (e) => {
    e.preventDefault()
    if (!form.host.trim()) return
    setSession({ ...form })
  }

  const dotStatus = status === 'connected' ? 'online' : status === 'error' ? 'offline' : 'unknown'

  return (
    <div className="space-y-4">
      {!session ? (
        <Card className="max-w-2xl">
          <CardHeader
            title="SSH-Konsole"
            icon={TerminalSquare}
            subtitle="Direkt im Browser per SSH mit dem Server verbinden"
          />
          <form onSubmit={connect} className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ssh-host">Host / IP</Label>
              <Input
                id="ssh-host"
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
                <Label htmlFor="ssh-port">Port</Label>
                <Input
                  id="ssh-port"
                  type="number"
                  value={form.port}
                  onChange={update('port')}
                  placeholder="22"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ssh-user">Benutzer</Label>
                <Input
                  id="ssh-user"
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
                <Label htmlFor="ssh-pw">Passwort</Label>
                <Input
                  id="ssh-pw"
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  autoComplete="off"
                />
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="ssh-key">Privater Schlüssel</Label>
                  <textarea
                    id="ssh-key"
                    value={form.privateKey}
                    onChange={update('privateKey')}
                    rows={5}
                    spellCheck={false}
                    placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…'}
                    className="flex w-full rounded-md border border-input bg-background/60 px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ssh-pass">Passphrase (optional)</Label>
                  <Input
                    id="ssh-pass"
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
                <Plug className="h-4 w-4" /> Verbinden
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <StatusDot status={dotStatus} />
              <span className="truncate font-mono text-foreground">
                {session.username}@{session.host}:{session.port}
              </span>
              {message && <span className="truncate text-xs text-muted-foreground">· {message}</span>}
            </div>
            <Button variant="danger" size="sm" onClick={disconnect}>
              <PlugZap className="h-4 w-4" /> Trennen
            </Button>
          </div>
          <div ref={containerRef} className="h-[62vh] w-full bg-[#0a0a0b] p-2" />
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Hinweis: Die Zugangsdaten werden ausschließlich für diese Sitzung genutzt und
        weder im Browser noch auf dem Server gespeichert.
      </p>
    </div>
  )
}
