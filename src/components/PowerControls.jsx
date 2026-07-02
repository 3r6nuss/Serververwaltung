import { useState } from 'react'
import { Play, Square, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'
import { Button, Modal, Alert } from './ui.jsx'

// Wiederverwendbare Start/Stop/Neustart-Steuerung mit Sicherheitsabfrage
// für unterbrechende Aktionen (Stop/Neustart).
export default function PowerControls({ id, onDone, compact = false }) {
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)

  async function run(mode) {
    setBusy(mode)
    setError(null)
    setConfirm(null)
    try {
      await api.power(id, mode)
      onDone?.(mode)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const labels = { start: 'Starten', stop: 'Stoppen', restart: 'Neustarten' }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={busy === 'start'} onClick={() => run('start')} className={compact ? 'px-2.5 py-1.5' : ''}>
          <Play className="h-4 w-4" />
          {!compact && 'Start'}
        </Button>
        <Button variant="ghost" loading={busy === 'restart'} onClick={() => setConfirm('restart')} className={compact ? 'px-2.5 py-1.5' : ''}>
          <RotateCcw className="h-4 w-4" />
          {!compact && 'Neustart'}
        </Button>
        <Button variant="danger" loading={busy === 'stop'} onClick={() => setConfirm('stop')} className={compact ? 'px-2.5 py-1.5' : ''}>
          <Square className="h-4 w-4" />
          {!compact && 'Stop'}
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <Modal
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={`Server ${confirm ? labels[confirm].toLowerCase() : ''}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Abbrechen
            </Button>
            <Button variant={confirm === 'stop' ? 'danger' : 'primary'} onClick={() => run(confirm)}>
              {confirm && labels[confirm]}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          {confirm === 'stop'
            ? 'Der Server wird heruntergefahren. Laufende Dienste sind danach nicht mehr erreichbar.'
            : 'Der Server wird neu gestartet. Er ist für kurze Zeit nicht erreichbar.'}
        </p>
      </Modal>
    </div>
  )
}
