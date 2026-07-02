// -----------------------------------------------------------------------------
// Einfaches Zugriffs-Logging für SSH- und Docker-Zugriffe.
//
// Schreibt Einträge als JSON-Lines in server/logs/access.jsonl und hält die
// letzten Einträge zusätzlich im Speicher (für die Anzeige im UI).
//
// Wichtig: Es werden KEINE Passwörter oder Schlüssel geloggt – nur Zeitstempel,
// IP, Aktion, Ziel-Host, Benutzername und Ergebnis.
// -----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'access.jsonl')
const MAX_MEMORY = 500

const recent = []

try {
  fs.mkdirSync(LOG_DIR, { recursive: true })
} catch {
  /* ignore */
}

// Beim Start die letzten Einträge von der Platte laden.
try {
  const text = fs.readFileSync(LOG_FILE, 'utf8')
  const lines = text.split('\n').filter(Boolean).slice(-MAX_MEMORY)
  for (const line of lines) {
    try {
      recent.push(JSON.parse(line))
    } catch {
      /* ignore */
    }
  }
} catch {
  /* Datei existiert evtl. noch nicht */
}

/**
 * Schreibt einen Zugriffs-Eintrag (Speicher + Datei).
 * @param {{ type: string, action: string, ip?: string, host?: string, username?: string, status?: string, message?: string }} entry
 */
export function logAccess(entry) {
  const rec = { time: new Date().toISOString(), ...entry }
  // Sicherheitshalber niemals sensible Felder mitschreiben.
  delete rec.password
  delete rec.privateKey
  delete rec.passphrase

  recent.push(rec)
  if (recent.length > MAX_MEMORY) recent.shift()

  fs.appendFile(LOG_FILE, JSON.stringify(rec) + '\n', () => {})
  return rec
}

// Liefert die neuesten Einträge (neueste zuerst).
export function getRecent(limit = 300) {
  return recent.slice(-limit).reverse()
}

// Ermittelt die Client-IP aus einem Request bzw. WebSocket-Upgrade-Request.
export function clientIp(req) {
  const xf = req?.headers?.['x-forwarded-for']
  if (xf) return String(xf).split(',')[0].trim()
  const raw = req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unbekannt'
  // IPv4-gemappte IPv6-Adressen (::ffff:127.0.0.1) kürzen.
  return typeof raw === 'string' ? raw.replace(/^::ffff:/, '') : 'unbekannt'
}
