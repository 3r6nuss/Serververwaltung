import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000
const CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS) || 5000
const MAX_SAMPLES = Number(process.env.HEALTH_MAX_SAMPLES) || 2880
const STORAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'logs')
const STORAGE_FILE = path.join(STORAGE_DIR, 'service-health.json')

const services = [
  { id: 'met', name: 'MET App', url: process.env.MET_HEALTH_URL || '' },
  { id: 'discord', name: 'Discord Bot', url: process.env.DISCORD_HEALTH_URL || '' },
  { id: 'larrys', name: "Larry's", url: process.env.LARRYS_HEALTH_URL || '' },
  { id: 'polenstube', name: 'Polenstube', url: process.env.POLENSTUBE_HEALTH_URL || '' },
]

const samples = new Map(services.map((service) => [service.id, []]))
let currentCheck = null

function loadSamples() {
  try {
    const stored = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'))
    for (const service of services) {
      if (Array.isArray(stored[service.id])) samples.set(service.id, stored[service.id].slice(-MAX_SAMPLES))
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[health] Verlauf konnte nicht geladen werden:', error.message)
  }
}

function saveSamples() {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
    const stored = Object.fromEntries([...samples].map(([id, history]) => [
      id,
      history.map(({ details, ...sample }) => sample),
    ]))
    const temporaryFile = `${STORAGE_FILE}.tmp`
    fs.writeFileSync(temporaryFile, JSON.stringify(stored))
    fs.renameSync(temporaryFile, STORAGE_FILE)
  } catch (error) {
    console.error('[health] Verlauf konnte nicht gespeichert werden:', error.message)
  }
}

loadSamples()

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function summarize(service) {
  const history = samples.get(service.id) || []
  const completed = history.filter((sample) => sample.status !== 'unconfigured')
  const available = completed.filter((sample) => sample.status === 'up' || sample.status === 'degraded')
  const latencies = completed.map((sample) => sample.latencyMs).filter(Number.isFinite)
  const latest = history.at(-1) || {
    status: service.url ? 'unknown' : 'unconfigured',
    checkedAt: null,
    latencyMs: null,
    message: service.url ? 'Noch nicht geprüft' : 'Health-URL fehlt',
  }

  return {
    ...service,
    url: service.url || null,
    ...latest,
    statistics: {
      samples: completed.length,
      uptimePercent: completed.length ? Number(((available.length / completed.length) * 100).toFixed(2)) : null,
      averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      p95LatencyMs: percentile(latencies, 0.95),
      outages: completed.filter((sample) => sample.status === 'down').length,
    },
  }
}

async function checkService(service) {
  if (!service.url) {
    return { status: 'unconfigured', checkedAt: new Date().toISOString(), latencyMs: null, message: 'Health-URL fehlt' }
  }

  const started = performance.now()
  try {
    const response = await fetch(service.url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    const body = await response.json().catch(() => ({}))
    const reportedStatus = String(body.status || '').toLowerCase()
    const status = !response.ok || ['down', 'unavailable', 'error'].includes(reportedStatus)
      ? 'down'
      : reportedStatus === 'degraded' ? 'degraded' : 'up'

    return {
      status,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      message: status === 'down' ? body.error || body.message || `HTTP ${response.status}` : null,
      details: body,
    }
  } catch (error) {
    return {
      status: 'down',
      checkedAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
      message: error.name === 'TimeoutError' ? `Timeout nach ${CHECK_TIMEOUT_MS} ms` : error.message,
    }
  }
}

export async function checkAllServices() {
  if (currentCheck) return currentCheck
  currentCheck = Promise.all(services.map(async (service) => {
    const sample = await checkService(service)
    const history = samples.get(service.id)
    history.push(sample)
    if (history.length > MAX_SAMPLES) history.splice(0, history.length - MAX_SAMPLES)
  })).then(() => {
    saveSamples()
    return getServiceHealth()
  }).finally(() => {
    currentCheck = null
  })
  return currentCheck
}

export function getServiceHealth() {
  const results = services.map(summarize)
  return {
    ok: true,
    status: results.some((service) => ['down', 'degraded'].includes(service.status)) ? 'degraded' : 'ok',
    checkedAt: new Date().toISOString(),
    intervalMs: CHECK_INTERVAL_MS,
    services: results,
  }
}

export function startServiceHealthMonitor() {
  checkAllServices().catch((error) => console.error('[health] Initiale Prüfung fehlgeschlagen:', error))
  const timer = setInterval(() => {
    checkAllServices().catch((error) => console.error('[health] Prüfung fehlgeschlagen:', error))
  }, CHECK_INTERVAL_MS)
  timer.unref()
}