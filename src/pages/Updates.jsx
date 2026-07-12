import { useCallback, useEffect, useState } from 'react'
import { Check, GitCommitHorizontal, Megaphone, RefreshCw, Send, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatDate } from '../lib/format.js'
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Modal } from '../components/ui.jsx'

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-500/15 text-amber-300',
    sending: 'bg-sky-500/15 text-sky-300',
    sent: 'bg-emerald-500/15 text-emerald-300',
    dismissed: 'bg-zinc-700/40 text-zinc-400',
  }
  const labels = {
    pending: 'Ausstehend',
    sending: 'Wird gesendet',
    sent: 'Veröffentlicht',
    dismissed: 'Verworfen',
  }
  return <Badge className={styles[status]}>{labels[status] || status}</Badge>
}

function UpdateCard({ update, busy, onApprove, onDismiss }) {
  const payload = update.payload
  const branch = String(payload.ref || '').replace('refs/heads/', '')

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{payload.repository.full_name}</h2>
            <StatusBadge status={update.status} />
            <Badge className="bg-sky-500/10 text-sky-300">{branch}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Eingegangen {formatDate(update.receivedAt, { second: '2-digit' })}
            {update.decidedAt ? ` · Bearbeitet ${formatDate(update.decidedAt, { second: '2-digit' })}` : ''}
          </p>
        </div>
        {update.status === 'pending' && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => onApprove(update)}>
              <Send className="h-4 w-4" /> Veröffentlichen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === `${update.id}:dismiss`}
              onClick={() => onDismiss(update.id)}
            >
              <X className="h-4 w-4" /> Verwerfen
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border/70">
        {payload.commits.map((commit) => (
          <div key={commit.id} className="flex gap-3 px-4 py-3">
            <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <a
                href={commit.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                {commit.message?.split('\n')[0] || 'Ohne Commit-Nachricht'}
              </a>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {commit.id?.slice(0, 7)} · {commit.author?.username || commit.author?.name || 'Unbekannt'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function Updates() {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.githubUpdates()
      setUpdates(result.updates || [])
    } catch (loadError) {
      setError(loadError.message || String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(id, action) {
    setBusy(`${id}:${action}`)
    setError(null)
    try {
      if (action === 'approve') await api.approveGithubUpdate(id)
      else await api.dismissGithubUpdate(id)
      setSelected(null)
      await load()
    } catch (actionError) {
      setError(actionError.message || String(actionError))
    } finally {
      setBusy('')
    }
  }

  const pending = updates.filter((update) => update.status === 'pending' || update.status === 'sending')
  const history = updates.filter((update) => update.status === 'sent' || update.status === 'dismissed')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Update-Freigaben</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prüfe GitHub-Änderungen, bevor sie im Kundenkanal veröffentlicht werden.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Aktualisieren
        </Button>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {loading && updates.length === 0 ? (
        <Loading label="Lade Update-Freigaben …" />
      ) : pending.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Check}
            title="Keine offenen Freigaben"
            hint="Neue Pushes auf freigegebenen Branches erscheinen automatisch hier."
          />
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Offen ({pending.length})</h2>
          {pending.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              busy={busy}
              onApprove={setSelected}
              onDismiss={(id) => decide(id, 'dismiss')}
            />
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Verlauf</h2>
          {history.map((update) => (
            <UpdateCard key={update.id} update={update} busy={busy} />
          ))}
        </section>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Update im Kundenkanal veröffentlichen?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>Abbrechen</Button>
            <Button
              variant="primary"
              loading={busy === `${selected?.id}:approve`}
              onClick={() => decide(selected.id, 'approve')}
            >
              <Megaphone className="h-4 w-4" /> Jetzt veröffentlichen
            </Button>
          </>
        )}
      >
        <p className="text-sm text-muted-foreground">
          Die Commit-Nachrichten von <span className="font-medium text-foreground">{selected?.payload.repository.full_name}</span>
          {' '}werden sofort an Discord gesendet. Dieser Schritt lässt sich dort nicht automatisch zurücknehmen.
        </p>
      </Modal>
    </div>
  )
}