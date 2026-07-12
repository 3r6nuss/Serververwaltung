// Zentraler Frontend-Client. Spricht ausschließlich mit dem eigenen
// Express-Proxy unter /api – der API-Key bleibt serverseitig.

const TOKEN_KEY = 'dash_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

// Wird aufgerufen, wenn der Server 401 meldet (Token fehlt oder abgelaufen).
let unauthorizedHandler = null
export function onUnauthorized(fn) {
  unauthorizedHandler = fn
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && path !== '/auth/login') {
    clearToken()
    if (unauthorizedHandler) unauthorizedHandler()
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    // leere/keine JSON-Antwort
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Anfrage fehlgeschlagen (HTTP ${res.status})`)
  }
  // 24fire nutzt teils status:'error' trotz HTTP 200. Eigene Endpunkte
  // markieren sich mit ok:true und werden übersprungen.
  if (data && typeof data === 'object' && !('ok' in data) && data.status && data.status !== 'success') {
    throw new Error(data.message || 'Unbekannter Fehler der 24fire-API.')
  }
  return data
}

export const api = {
  // Meta
  health: () => request('/health'),
  serviceHealth: (refresh = false) => request(`/service-health${refresh ? '?refresh=1' : ''}`),

  // Authentifizierung
  authStatus: () => request('/auth/status'),
  login: (password) => request('/auth/login', { method: 'POST', body: { password } }),
  logout: () => clearToken(),

  // Account
  account: () => request('/account'),
  donations: () => request('/account/donations'),
  affiliate: () => request('/account/affiliate'),
  services: () => request('/services'),
  overview: () => request('/overview'),

  // KVM
  kvmConfig: (id) => request(`/kvm/${id}/config`),
  power: (id, mode) => request(`/kvm/${id}/power`, { method: 'POST', body: { mode } }),

  // Backups
  backups: (id) => request(`/kvm/${id}/backup`),
  createBackup: (id) => request(`/kvm/${id}/backup`, { method: 'POST' }),
  restoreBackup: (id, backup_id) => request(`/kvm/${id}/backup/restore`, { method: 'POST', body: { backup_id } }),
  deleteBackup: (id, backup_id) => request(`/kvm/${id}/backup`, { method: 'DELETE', body: { backup_id } }),

  // Traffic
  trafficCurrent: (id) => request(`/kvm/${id}/traffic/current`),
  trafficLog: (id) => request(`/kvm/${id}/traffic/log`),

  // Monitoring
  incidences: (id) => request(`/kvm/${id}/monitoring/incidences`),
  timings: (id) => request(`/kvm/${id}/monitoring/timings`),

  // DDoS
  ddos: (id) => request(`/kvm/${id}/ddos`),

  // Docker (über SSH auf dem Server; Zugangsdaten werden nicht gespeichert)
  dockerStatus: (creds) => request('/docker', { method: 'POST', body: creds }),
  dockerAction: (creds, action, container) =>
    request('/docker/action', { method: 'POST', body: { ...creds, action, container } }),
  dockerLogs: (creds, container, tail) =>
    request('/docker/logs', { method: 'POST', body: { ...creds, container, tail } }),
  dockerInspect: (creds, container) =>
    request('/docker/inspect', { method: 'POST', body: { ...creds, container } }),
  dockerStats: (creds, container) =>
    request('/docker/stats', { method: 'POST', body: { ...creds, container } }),

  // Zugriffs-Logs (SSH & Docker)
  logs: (type) => request(type ? `/logs?type=${encodeURIComponent(type)}` : '/logs'),

  // Freigabe von GitHub-Updates für den Discord-Kundenkanal
  githubUpdates: () => request('/github-updates'),
  approveGithubUpdate: (id) => request(`/github-updates/${id}/approve`, { method: 'POST' }),
  dismissGithubUpdate: (id) => request(`/github-updates/${id}/dismiss`, { method: 'POST' }),

  // DNS
  dns: (id) => request(`/domain/${id}/dns`),
  addDns: (id, record) => request(`/domain/${id}/dns`, { method: 'PUT', body: record }),
  editDns: (id, record) => request(`/domain/${id}/dns`, { method: 'POST', body: record }),
  removeDns: (id, record_id) => request(`/domain/${id}/dns`, { method: 'DELETE', body: { record_id } }),
}
