import { useState, useEffect } from 'react'
import { Globe, Plus, Pencil, Trash2, ChevronRight, Server } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAsync } from '../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, Button, Badge, Modal, Alert } from '../components/ui.jsx'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '../lib/format.js'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']

const EMPTY = { record_id: null, type: 'A', name: '', data: '', ttl: 3600 }

export default function Domains() {
  const services = useAsync(() => api.services(), [])
  const domains = services.data?.data?.services?.DOMAIN || []
  const [selected, setSelected] = useState(null)

  // Erste Domain automatisch wählen.
  useEffect(() => {
    if (!selected && domains.length) setSelected(domains[0])
  }, [domains, selected])

  const setupNeeded = /API-Key/i.test(services.error || '')

  if (services.loading) return <Loading label="Lade Domains …" />
  if (services.error) {
    return setupNeeded ? (
      <Alert kind="warning">Kein API-Key hinterlegt. Trage <code>FIRE_API_KEY</code> in die <code>.env</code> ein.</Alert>
    ) : (
      <ErrorState error={services.error} onRetry={services.refetch} />
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Domains &amp; DNS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Verwalte deine Domains und DNS-Einträge.</p>
      </div>

      {domains.length === 0 ? (
        <EmptyState icon={Globe} title="Keine Domains gefunden" hint="Auf diesem Account sind keine Domains registriert." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          {/* Domain-Liste */}
          <Card className="h-fit">
            <CardHeader title="Domains" icon={Globe} subtitle={`${domains.length} gesamt`} />
            <div className="p-2">
              {domains.map((d) => {
                const isActive = selected?.internal_id === d.internal_id
                return (
                  <button
                    key={d.internal_id}
                    onClick={() => setSelected(d)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-accent'
                    )}
                  >
                    <span className="truncate font-medium">{d.name}</span>
                    <ChevronRight className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  </button>
                )
              })}
            </div>
          </Card>

          {/* DNS-Verwaltung */}
          {selected ? (
            <DnsManager domain={selected} />
          ) : (
            <EmptyState icon={Server} title="Domain auswählen" />
          )}
        </div>
      )}
    </div>
  )
}

function DnsManager({ domain }) {
  const id = domain.internal_id
  const { data, loading, error, refetch } = useAsync(() => api.dns(id), [id])
  const [editing, setEditing] = useState(null) // record object oder null
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const records = data?.data || []

  async function save(form) {
    setBusy(true)
    setMsg(null)
    try {
      if (form.record_id) {
        await api.editDns(id, { record_id: form.record_id, type: form.type, name: form.name, data: form.data, ttl: Number(form.ttl) })
        setMsg({ kind: 'success', text: 'Eintrag aktualisiert.' })
      } else {
        await api.addDns(id, { type: form.type, name: form.name, data: form.data, ttl: Number(form.ttl) })
        setMsg({ kind: 'success', text: 'Eintrag hinzugefügt.' })
      }
      setEditing(null)
      refetch()
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removing) return
    setBusy(true)
    setMsg(null)
    try {
      await api.removeDns(id, removing.record_id)
      setMsg({ kind: 'success', text: 'Eintrag gelöscht.' })
      setRemoving(null)
      refetch()
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
      setRemoving(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title={domain.name}
        icon={Globe}
        subtitle={`${records.length} DNS-Einträge`}
        action={
          <Button variant="primary" onClick={() => setEditing(EMPTY)}>
            <Plus className="h-4 w-4" /> Eintrag
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : records.length === 0 ? (
          <EmptyState icon={Globe} title="Keine DNS-Einträge" hint="Lege deinen ersten Eintrag an." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Wert</TableHead>
                <TableHead>TTL</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.record_id} className="group">
                  <TableCell>
                    <Badge className="font-mono">{r.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate font-mono">{r.name || '@'}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-muted-foreground">{r.data}</TableCell>
                  <TableCell className="text-muted-foreground">{r.ttl}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditing({ ...EMPTY, ...r })}
                        title="Bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-900/40 hover:text-red-300"
                        onClick={() => setRemoving(r)}
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <RecordForm open={editing != null} initial={editing} busy={busy} onClose={() => setEditing(null)} onSave={save} />

      <Modal
        open={removing != null}
        onClose={() => setRemoving(null)}
        title="DNS-Eintrag löschen?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Eintrag <span className="font-mono text-foreground">{removing?.type} {removing?.name || '@'}</span> wird gelöscht.
        </p>
      </Modal>
    </Card>
  )
}

function RecordForm({ open, initial, busy, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (open) setForm({ ...EMPTY, ...initial })
  }, [open, initial])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isEdit = Boolean(form.record_id)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'DNS-Eintrag bearbeiten' : 'DNS-Eintrag hinzufügen'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={() => onSave(form)} loading={busy} disabled={!form.data.trim()}>
            {isEdit ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>TTL (Sek.)</Label>
            <Input type="number" value={form.ttl} onChange={set('ttl')} min={60} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Name / Subdomain</Label>
          <Input value={form.name} onChange={set('name')} placeholder="@ oder z. B. www" className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Wert</Label>
          <Input value={form.data} onChange={set('data')} placeholder="z. B. 1.2.3.4" className="font-mono" />
        </div>
      </div>
    </Modal>
  )
}
