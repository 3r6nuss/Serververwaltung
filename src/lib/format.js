// Kleine Formatierungs- und Hilfsfunktionen.
export { cn } from './utils.js'

// GB mit sinnvoller Genauigkeit; wechselt bei <1 GB auf MB.
export function formatGB(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '–'
  if (n === 0) return '0 GB'
  if (n < 1) return `${(n * 1024).toFixed(0)} MB`
  return `${n.toFixed(n < 10 ? 2 : 1)} GB`
}

// MB -> lesbar (die Traffic-Logs liefern MB).
export function formatMB(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '–'
  if (n >= 1024) return `${(n / 1024).toFixed(2)} GB`
  return `${n.toFixed(1)} MB`
}

export function formatMemMB(mb) {
  const n = Number(mb)
  if (!Number.isFinite(n)) return '–'
  if (n >= 1024) return `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} GB`
  return `${n} MB`
}

export function formatPercent(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '–'
  return `${n.toFixed(digits)} %`
}

export function formatDate(value, opts = {}) {
  if (!value) return '–'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function formatTime(value) {
  if (!value) return '–'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// "vor 3 Min." o.ä.
export function relativeTime(value) {
  if (!value) return '–'
  const d = new Date(value).getTime()
  if (Number.isNaN(d)) return String(value)
  const diff = Date.now() - d
  const min = Math.round(diff / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const days = Math.round(h / 24)
  return `vor ${days} Tg.`
}

export function formatMinutes(mins) {
  const n = Number(mins)
  if (!Number.isFinite(n) || n <= 0) return '0 Min.'
  if (n < 60) return `${n} Min.`
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  if (h < 24) return m ? `${h} Std. ${m} Min.` : `${h} Std.`
  const d = Math.floor(h / 24)
  return `${d} Tg. ${h % 24} Std.`
}

// Farb-/Label-Zuordnung für den Serverstatus.
export function statusMeta(status) {
  switch (status) {
    case 'online':
      return { label: 'Online', dot: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/30' }
    case 'offline':
      return { label: 'Offline', dot: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' }
    default:
      return { label: 'Unbekannt', dot: 'bg-zinc-500', text: 'text-zinc-400', ring: 'ring-zinc-500/30' }
  }
}

// Farbschwelle für Auslastungswerte.
export function usageColor(percent) {
  const n = Number(percent)
  if (!Number.isFinite(n)) return 'bg-zinc-600'
  if (n < 60) return 'bg-emerald-500'
  if (n < 85) return 'bg-amber-500'
  return 'bg-red-500'
}
