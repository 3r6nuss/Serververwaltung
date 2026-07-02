// -----------------------------------------------------------------------------
// Einfache Authentifizierung per Passwort + signiertem Token.
//
// - Ist DASHBOARD_PASSWORD gesetzt, ist die App geschützt: /api/* (außer
//   /health, /auth/status, /auth/login) und die SSH-WebSocket-Bridge verlangen
//   einen gültigen Token.
// - Ist kein Passwort gesetzt (z. B. lokale Entwicklung), ist der Schutz aus.
// - Tokens sind zustandslos (HMAC-signiert) und laufen nach TTL ab. Für den
//   Produktivbetrieb sollte AUTH_SECRET gesetzt sein, sonst wird bei jedem
//   Neustart ein neues Secret erzeugt (alle Sitzungen werden ungültig).
// -----------------------------------------------------------------------------

import crypto from 'node:crypto'

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 Tage

// Secret für die Token-Signatur. Ohne AUTH_SECRET: zufällig pro Prozessstart.
const SECRET =
  process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16
    ? process.env.AUTH_SECRET
    : crypto.randomBytes(32).toString('hex')

if (process.env.DASHBOARD_PASSWORD && !process.env.AUTH_SECRET) {
  console.warn('  ⚠  AUTH_SECRET nicht gesetzt – Sitzungen werden bei jedem Neustart ungültig.')
}

// Ist der Passwortschutz aktiv?
export function authRequired() {
  return Boolean(process.env.DASHBOARD_PASSWORD)
}

// Zeitkonstanter Vergleich zweier Strings.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// Prüft das eingegebene Passwort gegen DASHBOARD_PASSWORD.
export function verifyPassword(pw) {
  const expected = process.env.DASHBOARD_PASSWORD || ''
  if (!expected) return false
  return safeEqual(pw ?? '', expected)
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}

// Erzeugt einen signierten Token mit Ablaufzeitpunkt.
export function issueToken() {
  const exp = Date.now() + TTL_MS
  const payload = `v1.${exp}`
  return `${payload}.${sign(payload)}`
}

// Prüft Signatur und Ablauf eines Tokens.
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [v, exp, sig] = parts
  const payload = `${v}.${exp}`
  if (!safeEqual(sig, sign(payload))) return false
  if (!Number(exp) || Number(exp) < Date.now()) return false
  return true
}

// Holt den Token aus dem Authorization-Header oder aus der Query (?token=).
export function extractToken(req) {
  const header = req.headers?.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  try {
    const url = new URL(req.url, 'http://localhost')
    const t = url.searchParams.get('token')
    if (t) return t
  } catch {
    /* ignore */
  }
  return ''
}

// Express-Middleware: lässt Anfragen nur mit gültigem Token durch.
export function requireAuth(req, res, next) {
  if (!authRequired()) return next()
  if (verifyToken(extractToken(req))) return next()
  res.status(401).json({ ok: false, error: 'Nicht angemeldet.' })
}
