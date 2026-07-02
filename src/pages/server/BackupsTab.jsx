import { useState } from 'react'
import { DatabaseBackup, Plus, RotateCcw, Trash2, HardDriveDownload, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAsync } from '../../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, Button, Badge, Modal, Alert } from '../../components/ui.jsx'
import { formatDate, formatMB } from '../../lib/format.js'

function statusMeta(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'finished') return { icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-400', label: 'Fertig' }
  if (s === 'running') return { icon: Clock, cls: 'bg-amber-500/15 text-amber-400', label: 'Läuft' }
  if (s === 'failed') return { icon: XCircle, cls: 'bg-red-500/15 text-red-400', label: 'Fehler' }
  return { icon: Clock, cls: 'bg-zinc-700/40 text-zinc-300', label: status || 'Unbekannt' }
}

export default function BackupsTab({ id }) {
  const { data, loading, error, refetch } = useAsync(() => api.backups(id), [id])
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState(null) // { type:'restore'|'delete', backup }
  const [msg, setMsg] = useState(null)

  const backups = data?.data || []

  async function create() {
    setBusy(true)
    setMsg(null)
    try {
      await api.createBackup(id)
      setMsg({ kind: 'success', text: 'Backup wurde gestartet.' })
      setTimeout(refetch, 1500)
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function runAction() {
    if (!action) return
    setBusy(true)
    setMsg(null)
    try {
      if (action.type === 'restore') {
        await api.restoreBackup(id, action.backup.backup_id)
        setMsg({ kind: 'success', text: 'Wiederherstellung gestartet.' })
      } else {
        await api.deleteBackup(id, action.backup.backup_id)
        setMsg({ kind: 'success', text: 'Backup gelöscht.' })
      }
      setAction(null)
      setTimeout(refetch, 1200)
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
      setAction(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Backups"
        icon={DatabaseBackup}
        subtitle={`${backups.length} Sicherung(en)`}
        action={
          <Button variant="primary" onClick={create} loading={busy}>
            <Plus className="h-4 w-4" /> Backup erstellen
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : backups.length === 0 ? (
          <EmptyState icon={DatabaseBackup} title="Keine Backups vorhanden" hint="Erstelle dein erstes Backup mit dem Button oben rechts." />
        ) : (
          backups.map((b) => {
            const meta = statusMeta(b.status)
            const Icon = meta.icon
            return (
              <div
                key={b.backup_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <HardDriveDownload className="h-5 w-5 text-zinc-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {b.backup_description?.trim() || 'Ohne Beschreibung'}
                      </span>
                      <Badge className={meta.cls}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {(b.backup_os || '').replaceAll('_', ' ')} · {b.size != null ? formatMB(b.size) : '–'} ·{' '}
                      {formatDate(b.created)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setAction({ type: 'restore', backup: b })}>
                    <RotateCcw className="h-4 w-4" /> Wiederherstellen
                  </Button>
                  <Button variant="danger" onClick={() => setAction({ type: 'delete', backup: b })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Modal
        open={action != null}
        onClose={() => setAction(null)}
        title={action?.type === 'restore' ? 'Backup wiederherstellen?' : 'Backup löschen?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Abbrechen
            </Button>
            <Button variant={action?.type === 'delete' ? 'danger' : 'primary'} onClick={runAction} loading={busy}>
              {action?.type === 'restore' ? 'Wiederherstellen' : 'Löschen'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          {action?.type === 'restore'
            ? 'Der Server wird auf den Stand dieses Backups zurückgesetzt. Alle seither vorgenommenen Änderungen gehen verloren.'
            : 'Dieses Backup wird unwiderruflich gelöscht.'}
        </p>
      </Modal>
    </Card>
  )
}
