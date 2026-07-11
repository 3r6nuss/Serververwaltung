import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fireRequest, fireJson } from './fire.js'
import {
  attachSshBridge,
  dockerStatus,
  dockerAction,
  dockerLogs,
  dockerInspect,
  dockerContainerStats,
} from './ssh.js'
import { logAccess, getRecent, clientIp } from './logger.js'
import { checkAllServices, getServiceHealth, startServiceHealthMonitor } from './service-health.js'
import {
  authRequired,
  verifyPassword,
  issueToken,
  verifyToken,
  extractToken,
  requireAuth,
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const PORT = Number(process.env.PORT) || 3001
const API_KEY = process.env.FIRE_API_KEY || ''

startServiceHealthMonitor()

const app = express()
app.use(compression())
app.use(express.json())

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

// Nur harmlose IDs zulassen (interne 24fire-IDs / Namen).
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/
const isValidId = (id) => typeof id === 'string' && ID_RE.test(id)

// Reicht das Ergebnis der 24fire-API 1:1 an den Client weiter.
function forward(res, result) {
  res.status(result.ok ? 200 : result.status || 502).json(result.json)
}

// Kleiner Wrapper, der API-Key injiziert.
const call = (path, opts = {}) => fireRequest(path, { apiKey: API_KEY, ...opts })

// Einfacher In-Memory-Cache gegen Rate-Limits bei schnellem Neuladen.
const cache = new Map()
function cached(key, ttlMs, producer) {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.time < ttlMs) return hit.value
  const value = producer()
  cache.set(key, { time: now, value })
  return value
}

// Async-Handler, der Fehler sauber abfängt.
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('[api] Unerwarteter Fehler:', err)
    res.status(500).json({ status: 'error', message: 'Interner Serverfehler.' })
  })
}

const api = express.Router()

// ---------------------------------------------------------------------------
// Meta / Health
// ---------------------------------------------------------------------------
api.get('/health', (req, res) => {
  const serviceHealth = getServiceHealth()
  res.json({
    ok: true,
    status: serviceHealth.status,
    service: 'serververwaltung',
    configured: Boolean(API_KEY),
    time: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    monitoredServices: serviceHealth.services.length,
    servicesDown: serviceHealth.services.filter((service) => service.status === 'down').length,
    memory: process.memoryUsage(),
  })
})

// ---------------------------------------------------------------------------
// Authentifizierung (Passwortschutz, optional über DASHBOARD_PASSWORD)
// ---------------------------------------------------------------------------
api.get('/auth/status', (req, res) => {
  res.json({
    ok: true,
    required: authRequired(),
    authenticated: !authRequired() || verifyToken(extractToken(req)),
  })
})

api.post('/auth/login', (req, res) => {
  if (!authRequired()) return res.json({ ok: true, token: '' })
  const { password } = req.body || {}
  if (!verifyPassword(password)) {
    logAccess({ type: 'auth', action: 'login', ip: clientIp(req), status: 'error', message: 'Falsches Passwort' })
    return res.status(401).json({ ok: false, error: 'Falsches Passwort.' })
  }
  logAccess({ type: 'auth', action: 'login', ip: clientIp(req), status: 'ok' })
  res.json({ ok: true, token: issueToken() })
})

// Ab hier sind alle Routen geschützt, sofern DASHBOARD_PASSWORD gesetzt ist.
api.use(requireAuth)

api.get('/service-health', wrap(async (req, res) => {
  const force = req.query.refresh === '1'
  res.json(force ? await checkAllServices() : getServiceHealth())
}))

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
api.get('/account', wrap((req, res) => call('/account').then((r) => forward(res, r))))
api.get('/account/donations', wrap((req, res) => call('/account/donations').then((r) => forward(res, r))))
api.get('/account/affiliate', wrap((req, res) => call('/account/affiliate').then((r) => forward(res, r))))

// Alle aktiven Dienste (KVM, Domains, Webspaces …)
api.get('/services', wrap((req, res) => call('/account/services').then((r) => forward(res, r))))

// ---------------------------------------------------------------------------
// Übersicht / Dashboard-Aggregation
// Kombiniert Dienste + Config + neueste Monitoring-Werte pro KVM-Server.
// ---------------------------------------------------------------------------
function pickLatestTiming(timings) {
  if (!Array.isArray(timings) || timings.length === 0) return null
  return timings.reduce((latest, cur) => {
    if (!latest) return cur
    return new Date(cur.date) > new Date(latest.date) ? cur : latest
  }, null)
}

function deriveStatus(config, latest) {
  const monitoringEnabled = Boolean(config?.monitoring?.enabled)
  if (!monitoringEnabled || !latest) return 'unknown'
  const ageMin = (Date.now() - new Date(latest.date).getTime()) / 60000
  const hasReading = latest.ping != null || latest.cpu != null
  if (hasReading && ageMin <= 15) return 'online'
  return 'offline'
}

async function buildOverview() {
  const res = await fireRequest('/account/services', { apiKey: API_KEY })
  if (!res.ok || res.json?.status === 'error') {
    const err = new Error(res.json?.message || `24fire-API antwortete mit HTTP ${res.status}.`)
    err.status = res.status >= 400 ? res.status : 502
    throw err
  }
  const services = res.json

  const kvmList = services?.data?.services?.KVM || []

  const servers = await Promise.all(
    kvmList.map(async (svc) => {
      const [cfgRes, timingRes] = await Promise.all([
        fireRequest(`/kvm/${svc.internal_id}/config`, { apiKey: API_KEY }),
        fireRequest(`/kvm/${svc.internal_id}/monitoring/timings`, { apiKey: API_KEY }),
      ])
      const config = cfgRes.json?.data?.config || null
      const latest = pickLatestTiming(timingRes.json?.data?.timings)
      return {
        name: svc.name,
        internal_id: svc.internal_id,
        expires: svc.expires ?? null,
        raw: svc,
        config,
        monitoringAvailable: timingRes.ok,
        latest,
        status: deriveStatus(config, latest),
      }
    })
  )

  return {
    ok: true,
    count: servers.length,
    servers,
    domains: services?.data?.services?.DOMAIN || [],
    webspaces: services?.data?.services?.WEBSPACE || [],
    fetchedAt: new Date().toISOString(),
  }
}

api.get(
  '/overview',
  wrap(async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({ ok: false, status: 'error', message: 'Kein API-Key konfiguriert.' })
    }
    try {
      const data = await cached('overview', 8000, buildOverview)
      res.json(await data)
    } catch (err) {
      cache.delete('overview')
      res.status(err.status || 502).json({
        status: 'error',
        message: err.message || 'Fehler beim Laden der Serverübersicht.',
      })
    }
  })
)

// ---------------------------------------------------------------------------
// KVM-Server
// ---------------------------------------------------------------------------
function requireId(req, res) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ status: 'error', message: 'Ungültige Server-/Domain-ID.' })
    return false
  }
  return true
}

api.get('/kvm/:id/config', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/config`).then((r) => forward(res, r))
}))

api.post('/kvm/:id/power', wrap((req, res) => {
  if (!requireId(req, res)) return
  const mode = String(req.body?.mode || '')
  if (!['start', 'stop', 'restart'].includes(mode)) {
    return res.status(400).json({ status: 'error', message: 'mode muss start, stop oder restart sein.' })
  }
  return call(`/kvm/${req.params.id}/power`, { method: 'POST', body: { mode } }).then((r) => {
    cache.delete('overview')
    forward(res, r)
  })
}))

// Backups
api.get('/kvm/:id/backup', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/backup/list`).then((r) => forward(res, r))
}))
api.post('/kvm/:id/backup', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/backup/create`, { method: 'POST' }).then((r) => forward(res, r))
}))
api.post('/kvm/:id/backup/restore', wrap((req, res) => {
  if (!requireId(req, res)) return
  const backup_id = String(req.body?.backup_id || '')
  if (!backup_id) return res.status(400).json({ status: 'error', message: 'backup_id fehlt.' })
  return call(`/kvm/${req.params.id}/backup/restore`, { method: 'POST', body: { backup_id } }).then((r) => forward(res, r))
}))
api.delete('/kvm/:id/backup', wrap((req, res) => {
  if (!requireId(req, res)) return
  const backup_id = String(req.body?.backup_id || '')
  if (!backup_id) return res.status(400).json({ status: 'error', message: 'backup_id fehlt.' })
  return call(`/kvm/${req.params.id}/backup/delete`, { method: 'DELETE', body: { backup_id } }).then((r) => forward(res, r))
}))

// Traffic
api.get('/kvm/:id/traffic/current', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/traffic/current`).then((r) => forward(res, r))
}))
api.get('/kvm/:id/traffic/log', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/traffic/log`).then((r) => forward(res, r))
}))

// Monitoring
api.get('/kvm/:id/monitoring/incidences', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/monitoring/incidences`).then((r) => forward(res, r))
}))
api.get('/kvm/:id/monitoring/timings', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/monitoring/timings`).then((r) => forward(res, r))
}))

// DDoS-Schutz
api.get('/kvm/:id/ddos', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/kvm/${req.params.id}/ddos`).then((r) => forward(res, r))
}))

// ---------------------------------------------------------------------------
// Docker (über SSH auf dem Server; Zugangsdaten werden nicht gespeichert)
// ---------------------------------------------------------------------------
function credsFrom(req) {
  const { host, port, username, authMethod, password, privateKey, passphrase } = req.body || {}
  return { host, port, username, authMethod, password, privateKey, passphrase }
}

function requireCreds(creds, res) {
  if (!creds.host || !creds.username) {
    res.status(400).json({ ok: false, error: 'Host und Benutzer sind erforderlich.' })
    return false
  }
  return true
}

api.post('/docker', wrap(async (req, res) => {
  const creds = credsFrom(req)
  if (!requireCreds(creds, res)) return
  const result = await dockerStatus(creds)
  logAccess({
    type: 'docker',
    action: 'status',
    ip: clientIp(req),
    host: String(creds.host),
    username: String(creds.username),
    status: result.ok ? 'ok' : 'error',
    message: result.error,
  })
  res.status(result.ok ? 200 : 502).json(result)
}))

api.post('/docker/action', wrap(async (req, res) => {
  const creds = credsFrom(req)
  if (!requireCreds(creds, res)) return
  const { action, container } = req.body || {}
  const result = await dockerAction(creds, String(action || ''), String(container || ''))
  logAccess({
    type: 'docker',
    action: String(action || 'action'),
    ip: clientIp(req),
    host: String(creds.host),
    username: String(creds.username),
    status: result.ok ? 'ok' : 'error',
    message: result.error || `${action} ${container}`,
  })
  res.status(result.ok ? 200 : 502).json(result)
}))

api.post('/docker/logs', wrap(async (req, res) => {
  const creds = credsFrom(req)
  if (!requireCreds(creds, res)) return
  const { container, tail } = req.body || {}
  const result = await dockerLogs(creds, String(container || ''), tail)
  logAccess({
    type: 'docker',
    action: 'logs',
    ip: clientIp(req),
    host: String(creds.host),
    username: String(creds.username),
    status: result.ok ? 'ok' : 'error',
    message: result.error || String(container || ''),
  })
  res.status(result.ok ? 200 : 502).json(result)
}))

api.post('/docker/inspect', wrap(async (req, res) => {
  const creds = credsFrom(req)
  if (!requireCreds(creds, res)) return
  const { container } = req.body || {}
  const result = await dockerInspect(creds, String(container || ''))
  res.status(result.ok ? 200 : 502).json(result)
}))

api.post('/docker/stats', wrap(async (req, res) => {
  const creds = credsFrom(req)
  if (!requireCreds(creds, res)) return
  const { container } = req.body || {}
  const result = await dockerContainerStats(creds, String(container || ''))
  res.status(result.ok ? 200 : 502).json(result)
}))

// ---------------------------------------------------------------------------
// Zugriffs-Logs (SSH & Docker)
// ---------------------------------------------------------------------------
api.get('/logs', wrap((req, res) => {
  const type = req.query?.type
  let entries = getRecent(300)
  if (type === 'ssh' || type === 'docker') entries = entries.filter((e) => e.type === type)
  res.json({ ok: true, entries })
}))

// ---------------------------------------------------------------------------
// Domains / DNS
// ---------------------------------------------------------------------------
api.get('/domain/:id', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/domain/${req.params.id}`).then((r) => forward(res, r))
}))
api.get('/domain/:id/dns', wrap((req, res) => {
  if (!requireId(req, res)) return
  return call(`/domain/${req.params.id}/dns`).then((r) => forward(res, r))
}))
api.put('/domain/:id/dns', wrap((req, res) => {
  if (!requireId(req, res)) return
  const { type, name, data } = req.body || {}
  if (!type || name == null || data == null) {
    return res.status(400).json({ status: 'error', message: 'type, name und data sind erforderlich.' })
  }
  return call(`/domain/${req.params.id}/dns/add`, {
    method: 'PUT',
    body: { type: String(type), name: String(name), data: String(data) },
  }).then((r) => forward(res, r))
}))
api.post('/domain/:id/dns', wrap((req, res) => {
  if (!requireId(req, res)) return
  const { record_id, type, name, data } = req.body || {}
  if (!record_id || !type || name == null || data == null) {
    return res.status(400).json({ status: 'error', message: 'record_id, type, name und data sind erforderlich.' })
  }
  return call(`/domain/${req.params.id}/dns/edit`, {
    method: 'POST',
    body: { record_id: String(record_id), type: String(type), name: String(name), data: String(data) },
  }).then((r) => forward(res, r))
}))
api.delete('/domain/:id/dns', wrap((req, res) => {
  if (!requireId(req, res)) return
  const record_id = String(req.body?.record_id || '')
  if (!record_id) return res.status(400).json({ status: 'error', message: 'record_id fehlt.' })
  return call(`/domain/${req.params.id}/dns/remove`, { method: 'DELETE', body: { record_id } }).then((r) => forward(res, r))
}))

app.use('/api', api)

// ---------------------------------------------------------------------------
// Frontend ausliefern (Produktions-Build), falls vorhanden.
// ---------------------------------------------------------------------------
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  console.log(`\n  24fire Server-Verwaltung – API läuft auf http://localhost:${PORT}`)
  if (!API_KEY) {
    console.warn('  ⚠  Kein FIRE_API_KEY gesetzt. Lege eine .env-Datei an (siehe .env.example).')
  }
  if (!fs.existsSync(DIST)) {
    console.log('  ℹ  Dev-Modus: Frontend über Vite (npm run dev) auf http://localhost:5174\n')
  }
})

// WebSocket-Bridge für die Web-SSH-Konsole an denselben HTTP-Server hängen.
attachSshBridge(server)
