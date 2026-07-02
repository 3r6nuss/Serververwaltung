// -----------------------------------------------------------------------------
// Schlanker Client für die 24fire REST-API v2
// Doku: https://apidocs.24fire.de/
// Basis-URL: https://manage.24fire.de/api  ·  Auth-Header: X-Fire-Apikey
// -----------------------------------------------------------------------------

const BASE_URL = 'https://manage.24fire.de/api'
const DEFAULT_TIMEOUT = 20000

/**
 * Führt eine Anfrage gegen die 24fire-API aus und liefert immer ein
 * einheitliches Ergebnis { ok, status, json } zurück – auch bei Fehlern.
 *
 * @param {string} path   z.B. "/account" oder "/kvm/<id>/config"
 * @param {object} opts
 * @param {string} opts.apiKey  24fire API-Key
 * @param {string} [opts.method='GET']
 * @param {Record<string,string>} [opts.body]  wird als x-www-form-urlencoded gesendet
 * @param {number} [opts.timeout]
 */
export async function fireRequest(path, { apiKey, method = 'GET', body, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      json: {
        status: 'error',
        message: 'Kein API-Key konfiguriert. Bitte FIRE_API_KEY in der .env-Datei setzen.',
      },
    }
  }

  const headers = { 'X-Fire-Apikey': apiKey, Accept: 'application/json' }
  let payload
  if (body && Object.keys(body).length > 0) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(body).toString()
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { status: 'error', message: text || 'Ungültige Antwort der 24fire-API' }
    }
    return { ok: res.ok, status: res.status, json }
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return {
      ok: false,
      status: aborted ? 504 : 502,
      json: {
        status: 'error',
        message: aborted
          ? 'Zeitüberschreitung bei der Anfrage an die 24fire-API.'
          : `Verbindungsfehler zur 24fire-API: ${err?.message || err}`,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

// Bequeme Kurzform, die direkt den JSON-Body zurückgibt (für interne Aggregation).
export async function fireJson(path, opts) {
  const { json } = await fireRequest(path, opts)
  return json
}
