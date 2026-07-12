import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_COMMITS = 10
const MAX_UPDATES = 100
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_FILE = process.env.GITHUB_UPDATE_STORE_FILE || path.join(__dirname, 'logs', 'github-updates.json')

function loadUpdates() {
  try {
    const stored = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
    if (!Array.isArray(stored)) return []
    return stored.map((update) => update.status === 'sending' ? { ...update, status: 'pending' } : update)
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[github-updates] Warteschlange konnte nicht gelesen werden:', error)
    return []
  }
}

const updates = loadUpdates()

function saveUpdates() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
  fs.writeFileSync(STORE_FILE, JSON.stringify(updates.slice(0, MAX_UPDATES), null, 2))
}

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

function repositoryAllowed(fullName, configuredRepositories) {
  const allowed = configuredRepositories
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  return allowed.includes(fullName.toLowerCase())
}

function branchAllowed(branch, configuredBranches) {
  return configuredBranches
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .includes(branch.toLowerCase())
}

function shorten(text, maxLength) {
  const normalized = String(text || '').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

export function createDiscordMessage(payload) {
  const repository = payload.repository
  const branch = String(payload.ref || '').replace('refs/heads/', '')
  const commits = Array.isArray(payload.commits) ? payload.commits.slice(-MAX_COMMITS) : []
  const description = commits.map((commit) => {
    const message = shorten(commit.message?.split('\n')[0], 220) || 'Ohne Commit-Nachricht'
    const author = commit.author?.username || commit.author?.name || 'Unbekannt'
    return `[${String(commit.id || '').slice(0, 7)}](${commit.url}) **${message}**\n${author}`
  }).join('\n\n')

  const omitted = Math.max(0, (payload.commitCount ?? payload.commits?.length ?? 0) - commits.length)
  const suffix = omitted > 0 ? `\n\n… und ${omitted} weitere Commits` : ''

  return {
    username: `${repository.name} Updates`,
    avatar_url: repository.owner?.avatar_url,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `Update für ${repository.name}`,
      url: payload.compare || repository.html_url,
      description: `${description}${suffix}` || 'Der Branch wurde aktualisiert.',
      color: 0x238636,
      fields: [
        { name: 'Branch', value: branch || 'Unbekannt', inline: true },
        { name: 'Autor', value: payload.pusher?.name || 'Unbekannt', inline: true },
      ],
      footer: { text: repository.full_name },
      timestamp: payload.head_commit?.timestamp || new Date().toISOString(),
    }],
  }
}

function queueUpdate(payload, deliveryId) {
  const existing = deliveryId && updates.find((update) => update.deliveryId === deliveryId)
  if (existing) return existing

  const update = {
    id: crypto.randomUUID(),
    deliveryId,
    status: 'pending',
    receivedAt: new Date().toISOString(),
    payload: {
      ref: payload.ref,
      compare: payload.compare,
      repository: {
        name: payload.repository.name,
        full_name: payload.repository.full_name,
        html_url: payload.repository.html_url,
        owner: { avatar_url: payload.repository.owner?.avatar_url },
      },
      pusher: { name: payload.pusher?.name },
      commits: payload.commits.slice(-MAX_COMMITS).map((commit) => ({
        id: commit.id,
        message: commit.message,
        url: commit.url,
        author: { username: commit.author?.username, name: commit.author?.name },
      })),
      commitCount: payload.commits.length,
      head_commit: { timestamp: payload.head_commit?.timestamp },
    },
  }

  updates.unshift(update)
  updates.splice(MAX_UPDATES)
  saveUpdates()
  return update
}

function findPendingUpdate(id) {
  return updates.find((update) => update.id === id && update.status === 'pending')
}

async function sendToDiscord(update) {
  const discordWebhookUrl = process.env.DISCORD_UPDATE_WEBHOOK_URL || ''
  if (!discordWebhookUrl) throw new Error('Discord-Webhook ist nicht konfiguriert.')

  const response = await fetch(discordWebhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(createDiscordMessage(update.payload)),
  })

  if (!response.ok) {
    const details = shorten(await response.text(), 300)
    throw new Error(`Discord antwortete mit HTTP ${response.status}: ${details}`)
  }
}

export async function handleGithubUpdate(req, res) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || ''

  if (!secret) {
    return res.status(503).json({ ok: false, error: 'Update-Webhook ist nicht konfiguriert.' })
  }

  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), secret)) {
    return res.status(401).json({ ok: false, error: 'Ungültige GitHub-Signatur.' })
  }

  const event = req.get('x-github-event')
  if (event === 'ping') return res.json({ ok: true, event })
  if (event !== 'push') return res.status(202).json({ ok: true, ignored: event })

  const repository = req.body?.repository
  if (!repository?.full_name || !repositoryAllowed(repository.full_name, process.env.GITHUB_UPDATE_REPOSITORIES || '')) {
    return res.status(403).json({ ok: false, error: 'Repository ist nicht freigegeben.' })
  }

  const branch = String(req.body.ref || '').replace('refs/heads/', '')
  const branches = process.env.GITHUB_UPDATE_BRANCHES || 'main,master'
  if (req.body.deleted || !req.body.commits?.length || !branchAllowed(branch, branches)) {
    return res.status(202).json({ ok: true, ignored: 'branch' })
  }

  const deliveryId = req.get('x-github-delivery') || ''
  const existing = deliveryId && updates.find((update) => update.deliveryId === deliveryId)
  if (existing) return res.json({ ok: true, duplicate: true, updateId: existing.id })

  const update = queueUpdate(req.body, deliveryId)
  console.log(`[github-updates] ${repository.full_name}: Update zur Freigabe vorgemerkt.`)
  return res.status(202).json({ ok: true, queued: true, updateId: update.id })
}

export function listGithubUpdates(_req, res) {
  return res.json({ ok: true, updates })
}

export async function approveGithubUpdate(req, res) {
  const update = findPendingUpdate(req.params.id)
  if (!update) return res.status(404).json({ ok: false, error: 'Ausstehendes Update wurde nicht gefunden.' })

  update.status = 'sending'
  saveUpdates()
  try {
    await sendToDiscord(update)
    update.status = 'sent'
    update.decidedAt = new Date().toISOString()
    saveUpdates()
    return res.json({ ok: true, update })
  } catch (error) {
    update.status = 'pending'
    saveUpdates()
    console.error('[github-updates] Discord-Benachrichtigung fehlgeschlagen:', error.message)
    return res.status(502).json({ ok: false, error: error.message })
  }
}

export function dismissGithubUpdate(req, res) {
  const update = findPendingUpdate(req.params.id)
  if (!update) return res.status(404).json({ ok: false, error: 'Ausstehendes Update wurde nicht gefunden.' })

  update.status = 'dismissed'
  update.decidedAt = new Date().toISOString()
  saveUpdates()
  return res.json({ ok: true, update })
}
