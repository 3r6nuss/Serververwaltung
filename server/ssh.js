// -----------------------------------------------------------------------------
// WebSocket → SSH-Bridge für die Web-Konsole.
//
// Der Browser öffnet eine WebSocket-Verbindung zu /api/ssh und schickt als
// erste Nachricht die Zugangsdaten. Der Server baut damit per ssh2 eine echte
// SSH-Sitzung auf und leitet Ein-/Ausgabe zwischen Terminal (xterm.js) und
// Server durch.
//
// Sicherheit:
//  - Zugangsdaten (Passwort/Schlüssel) werden NICHT gespeichert und NICHT
//    geloggt. Sie werden nur für die Dauer der Verbindung im Speicher gehalten.
//  - Geloggt werden nur Metadaten (Zeit, IP, Ziel-Host, Benutzer, Ergebnis).
//  - Gedacht für den lokalen Betrieb. Wird die App öffentlich erreichbar
//    gemacht, sollte die Verbindung über TLS (wss) laufen und zusätzlich
//    abgesichert werden.
// -----------------------------------------------------------------------------

import { WebSocketServer } from 'ws'
import { Client } from 'ssh2'
import { logAccess, clientIp } from './logger.js'
import { authRequired, verifyToken, extractToken } from './auth.js'

// Wenn nach Verbindungsaufbau nicht innerhalb dieser Zeit Zugangsdaten
// eintreffen, wird die WebSocket-Verbindung geschlossen.
const AUTH_TIMEOUT_MS = 15000

/**
 * Hängt die SSH-WebSocket-Bridge an einen bestehenden HTTP-Server.
 * @param {import('node:http').Server} httpServer
 */
export function attachSshBridge(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/ssh' })

  wss.on('connection', (ws, req) => {
    // Zugriffsschutz: gültiger Token erforderlich, sofern aktiviert.
    if (authRequired() && !verifyToken(extractToken(req))) {
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Nicht angemeldet.' }))
      } catch {
        /* ignore */
      }
      ws.close()
      return
    }

    let conn = null
    let stream = null
    let authed = false
    const logCtx = { ip: clientIp(req) }

    const send = (obj) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
    }

    const authTimer = setTimeout(() => {
      if (!authed) {
        send({ type: 'error', message: 'Zeitüberschreitung: keine Zugangsdaten empfangen.' })
        ws.close()
      }
    }, AUTH_TIMEOUT_MS)

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      // Erste Nachricht: Authentifizierung / Verbindungsaufbau.
      if (!authed && msg.type === 'auth') {
        authed = true
        clearTimeout(authTimer)
        startSsh(msg)
        return
      }

      if (!stream) return

      if (msg.type === 'data') {
        stream.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        try {
          stream.setWindow(msg.rows, msg.cols, 0, 0)
        } catch {
          /* ignore */
        }
      }
    })

    ws.on('close', () => {
      clearTimeout(authTimer)
      if (logCtx.host) {
        logAccess({ type: 'ssh', action: 'disconnect', status: 'closed', ...logCtx })
      }
      if (conn) conn.end()
    })
    ws.on('error', () => {
      if (conn) conn.end()
    })

    function startSsh(creds) {
      const { host, username, password, cols, rows } = creds
      if (!host || !username) {
        send({ type: 'error', message: 'Host und Benutzer sind erforderlich.' })
        ws.close()
        return
      }

      const cfg = buildConnectConfig(creds)
      logCtx.host = `${cfg.host}:${cfg.port}`
      logCtx.username = cfg.username
      logAccess({ type: 'ssh', action: 'connect', status: 'attempt', ...logCtx })

      send({ type: 'status', message: `Verbinde mit ${cfg.host}:${cfg.port} …` })

      conn = new Client()

      conn.on('ready', () => {
        logAccess({ type: 'ssh', action: 'connect', status: 'connected', ...logCtx })
        send({ type: 'status', message: 'Verbunden. Sitzung wird geöffnet …' })
        conn.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, sh) => {
          if (err) {
            send({ type: 'error', message: 'Shell konnte nicht geöffnet werden: ' + err.message })
            ws.close()
            return
          }
          stream = sh
          send({ type: 'status', message: 'Bereit.' })
          stream.on('data', (d) => send({ type: 'data', data: d.toString('utf8') }))
          stream.stderr.on('data', (d) => send({ type: 'data', data: d.toString('utf8') }))
          stream.on('close', () => {
            send({ type: 'close' })
            ws.close()
            conn.end()
          })
        })
      })

      // Passwort-basiertes keyboard-interactive (z. B. bei manchen sshd-Configs).
      conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        finish(prompts.map(() => String(password || '')))
      })

      conn.on('error', (err) => {
        logAccess({ type: 'ssh', action: 'connect', status: 'error', message: friendlyError(err), ...logCtx })
        send({ type: 'error', message: friendlyError(err) })
        ws.close()
      })

      conn.on('end', () => send({ type: 'close' }))

      try {
        conn.connect(cfg)
      } catch (err) {
        send({ type: 'error', message: friendlyError(err) })
        ws.close()
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Gemeinsame Helfer
// ---------------------------------------------------------------------------

// Baut die ssh2-Verbindungskonfiguration aus den übergebenen Zugangsdaten.
function buildConnectConfig({ host, port, username, authMethod, password, privateKey, passphrase }) {
  const cfg = {
    host: host ? String(host) : '',
    port: Number(port) || 22,
    username: username ? String(username) : '',
    readyTimeout: 20000,
    keepaliveInterval: 15000,
  }
  if (authMethod === 'key' && privateKey) {
    cfg.privateKey = String(privateKey)
    if (passphrase) cfg.passphrase = String(passphrase)
  } else {
    cfg.password = String(password || '')
    cfg.tryKeyboard = true
  }
  return cfg
}

// Öffnet eine SSH-Verbindung und löst auf, sobald sie bereit ist.
function sshConnect(cfg) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let settled = false
    conn.on('ready', () => {
      settled = true
      resolve(conn)
    })
    conn.on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
      finish(prompts.map(() => String(cfg.password || '')))
    })
    conn.on('error', (err) => {
      if (!settled) reject(err)
    })
    try {
      conn.connect(cfg)
    } catch (err) {
      reject(err)
    }
  })
}

// Führt einen Befehl aus und sammelt stdout/stderr/Exit-Code.
function execCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let stdout = ''
      let stderr = ''
      stream.on('data', (d) => {
        stdout += d.toString('utf8')
      })
      stream.stderr.on('data', (d) => {
        stderr += d.toString('utf8')
      })
      stream.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
      stream.on('error', reject)
    })
  })
}

function parseJsonLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

// Führt die stats-Werte mit der Container-Liste zusammen.
function mergeDocker(psOut, statsOut) {
  const ps = parseJsonLines(psOut)
  const stats = parseJsonLines(statsOut)
  const byId = new Map()
  const byName = new Map()
  for (const s of stats) {
    const sid = String(s.ID || s.Container || '').slice(0, 12)
    if (sid) byId.set(sid, s)
    if (s.Name) byName.set(s.Name, s)
  }
  return ps.map((c) => {
    const shortId = String(c.ID || '').slice(0, 12)
    const s = byId.get(shortId) || byName.get(c.Names) || null
    return {
      id: shortId,
      name: c.Names || '',
      image: c.Image || '',
      state: String(c.State || '').toLowerCase(),
      status: c.Status || '',
      runningFor: c.RunningFor || '',
      createdAt: c.CreatedAt || '',
      ports: c.Ports || '',
      cpu: s?.CPUPerc || '',
      mem: s?.MemPerc || '',
      memUsage: s?.MemUsage || '',
      netIO: s?.NetIO || '',
    }
  })
}

// Öffnet eine SSH-Verbindung, führt fn(conn) aus und schließt danach sauber.
async function withConn(creds, fn) {
  const cfg = buildConnectConfig(creds)
  if (!cfg.host || !cfg.username) {
    return { ok: false, error: 'Host und Benutzer sind erforderlich.' }
  }
  let conn
  try {
    conn = await sshConnect(cfg)
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
  try {
    return await fn(conn)
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  } finally {
    try {
      conn.end()
    } catch {
      /* ignore */
    }
  }
}

// Nur harmlose Container-Namen/IDs zulassen (verhindert Command-Injection).
const CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * Baut per SSH eine Verbindung auf und liest den Docker-Status
 * (Container, Zustand, Laufzeit, CPU/RAM). Zugangsdaten werden nicht gespeichert.
 */
export async function dockerStatus(creds) {
  return withConn(creds, async (conn) => {
    const ps = await execCommand(conn, "docker ps --all --no-trunc --format '{{json .}}'")
    if (ps.code !== 0) {
      const msg = (ps.stderr || ps.stdout || '').toLowerCase()
      if (/not found|command not found|no such file/.test(msg)) {
        return { ok: true, dockerAvailable: false, containers: [], error: 'Docker ist auf diesem Server nicht installiert.' }
      }
      if (/permission denied|cannot connect to the docker daemon|got permission denied/.test(msg)) {
        return {
          ok: true,
          dockerAvailable: false,
          containers: [],
          error: 'Kein Zugriff auf Docker. Als root verbinden oder den Benutzer der Gruppe „docker“ hinzufügen.',
        }
      }
      return { ok: true, dockerAvailable: false, containers: [], error: (ps.stderr || ps.stdout || 'docker ps fehlgeschlagen.').trim() }
    }

    const stats = await execCommand(conn, "docker stats --no-stream --format '{{json .}}'")
    const containers = mergeDocker(ps.stdout, stats.stdout)
    return { ok: true, dockerAvailable: true, containers }
  })
}

// Start/Stop/Restart eines Containers.
export async function dockerAction(creds, action, container) {
  if (!CONTAINER_RE.test(String(container || ''))) {
    return { ok: false, error: 'Ungültiger Container-Name.' }
  }
  if (action === 'pull') return dockerPull(creds, container)
  const cmds = {
    start: `docker start ${container}`,
    stop: `docker stop ${container}`,
    restart: `docker restart ${container}`,
  }
  const cmd = cmds[action]
  if (!cmd) return { ok: false, error: 'Unbekannte Aktion.' }
  return withConn(creds, async (conn) => {
    const r = await execCommand(conn, `${cmd} 2>&1`)
    return {
      ok: r.code === 0,
      output: (r.stdout || '').trim(),
      error: r.code !== 0 ? (r.stdout || 'Aktion fehlgeschlagen.').trim() : undefined,
    }
  })
}

// Image des Containers neu ziehen (Image wird per inspect ermittelt).
async function dockerPull(creds, container) {
  return withConn(creds, async (conn) => {
    const img = await execCommand(conn, `docker inspect --format '{{.Config.Image}}' ${container}`)
    const image = (img.stdout || '').trim()
    if (img.code !== 0 || !image) {
      return { ok: false, error: 'Image konnte nicht ermittelt werden.' }
    }
    const r = await execCommand(conn, `docker pull ${shellQuote(image)} 2>&1`)
    return {
      ok: r.code === 0,
      image,
      output: (r.stdout || '').trim(),
      error: r.code !== 0 ? (r.stdout || 'Pull fehlgeschlagen.').trim() : undefined,
    }
  })
}

// Container-Logs (letzte n Zeilen, mit Zeitstempeln).
export async function dockerLogs(creds, container, tail = 200) {
  if (!CONTAINER_RE.test(String(container || ''))) {
    return { ok: false, error: 'Ungültiger Container-Name.' }
  }
  const n = Math.min(Math.max(parseInt(tail, 10) || 200, 1), 2000)
  return withConn(creds, async (conn) => {
    const r = await execCommand(conn, `docker logs --tail ${n} --timestamps ${container} 2>&1`)
    return {
      ok: r.code === 0,
      logs: r.stdout || '',
      error: r.code !== 0 ? (r.stdout || 'Logs nicht verfügbar.').trim() : undefined,
    }
  })
}

// Momentaufnahme der Auslastung eines einzelnen Containers (für Verlaufsdiagramm).
export async function dockerContainerStats(creds, container) {
  if (!CONTAINER_RE.test(String(container || ''))) {
    return { ok: false, error: 'Ungültiger Container-Name.' }
  }
  return withConn(creds, async (conn) => {
    const r = await execCommand(conn, `docker stats --no-stream --format '{{json .}}' ${container}`)
    if (r.code !== 0) {
      return { ok: false, error: (r.stderr || r.stdout || 'stats fehlgeschlagen.').trim() }
    }
    const s = parseJsonLines(r.stdout)[0] || null
    return {
      ok: true,
      stats: s
        ? { cpu: s.CPUPerc, mem: s.MemPerc, memUsage: s.MemUsage, netIO: s.NetIO, blockIO: s.BlockIO, pids: s.PIDs }
        : null,
    }
  })
}

// Detaillierte Container-Informationen (docker inspect, aufbereitet).
export async function dockerInspect(creds, container) {
  if (!CONTAINER_RE.test(String(container || ''))) {
    return { ok: false, error: 'Ungültiger Container-Name.' }
  }
  return withConn(creds, async (conn) => {
    const r = await execCommand(conn, `docker inspect ${container}`)
    if (r.code !== 0) {
      return { ok: false, error: (r.stderr || r.stdout || 'inspect fehlgeschlagen.').trim() }
    }
    let json
    try {
      json = JSON.parse(r.stdout)
    } catch {
      return { ok: false, error: 'inspect lieferte eine ungültige Antwort.' }
    }
    const info = Array.isArray(json) ? json[0] : json
    return { ok: true, detail: summarizeInspect(info) }
  })
}

// Bereitet die (sehr umfangreiche) inspect-Ausgabe auf das Wesentliche auf.
function summarizeInspect(i) {
  if (!i) return null
  const cfg = i.Config || {}
  const state = i.State || {}
  const host = i.HostConfig || {}
  const net = i.NetworkSettings || {}

  const networks = net.Networks
    ? Object.entries(net.Networks).map(([name, n]) => ({ name, ip: n?.IPAddress || '' }))
    : []
  const ports = net.Ports
    ? Object.entries(net.Ports).map(([container, arr]) => ({
        container,
        host: Array.isArray(arr) && arr[0] ? `${arr[0].HostIp}:${arr[0].HostPort}` : null,
      }))
    : []
  const mounts = (i.Mounts || []).map((m) => ({
    type: m.Type,
    source: m.Source,
    dest: m.Destination,
    rw: m.RW,
  }))
  // Werte offensichtlicher Geheimnisse maskieren.
  const env = (cfg.Env || []).map((e) => {
    const idx = e.indexOf('=')
    if (idx === -1) return e
    const key = e.slice(0, idx)
    if (/pass|secret|token|key|pwd|api/i.test(key)) return `${key}=••••••`
    return e
  })

  return {
    id: String(i.Id || '').slice(0, 12),
    name: String(i.Name || '').replace(/^\//, ''),
    image: cfg.Image || '',
    created: i.Created || '',
    state: state.Status || '',
    startedAt: state.StartedAt || '',
    exitCode: state.ExitCode ?? null,
    health: state.Health?.Status || '',
    restartCount: i.RestartCount ?? 0,
    restartPolicy: host.RestartPolicy?.Name || '',
    cmd: Array.isArray(cfg.Cmd) ? cfg.Cmd.join(' ') : cfg.Cmd || '',
    entrypoint: Array.isArray(cfg.Entrypoint) ? cfg.Entrypoint.join(' ') : cfg.Entrypoint || '',
    workingDir: cfg.WorkingDir || '',
    env,
    networks,
    ports,
    mounts,
  }
}

// Wandelt technische ssh2-Fehler in verständliche deutsche Meldungen um.
function friendlyError(err) {
  const m = String(err?.message || err)
  if (/All configured authentication methods failed|authentication/i.test(m)) {
    return 'Authentifizierung fehlgeschlagen. Bitte Benutzer und Passwort/Schlüssel prüfen.'
  }
  if (/ECONNREFUSED/.test(m)) return 'Verbindung abgelehnt – läuft der SSH-Dienst auf diesem Port?'
  if (/ETIMEDOUT|timed out|timeout/i.test(m)) return 'Zeitüberschreitung – Host, Port oder Firewall prüfen.'
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return 'Host nicht gefunden – bitte IP/Hostname prüfen.'
  if (/EHOSTUNREACH|ENETUNREACH/.test(m)) return 'Host nicht erreichbar.'
  return 'SSH-Fehler: ' + m
}
