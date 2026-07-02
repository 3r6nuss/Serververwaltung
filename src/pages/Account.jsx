import { User, Mail, Wallet, Star, Hash, CalendarClock, MapPin, HeartHandshake, Users, BadgeEuro } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAsync } from '../lib/hooks.js'
import { Card, CardHeader, Loading, ErrorState, EmptyState, StatCard, Badge, Alert } from '../components/ui.jsx'
import { formatDate } from '../lib/format.js'

function euro(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '–'
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

// Wandelt technische Keys in lesbare Labels.
function humanize(key) {
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function Account() {
  const account = useAsync(() => api.account(), [])
  const donations = useAsync(() => api.donations(), [])
  const affiliate = useAsync(() => api.affiliate(), [])

  const setupNeeded = /API-Key/i.test(account.error || '')

  if (account.loading) return <Loading label="Lade Account-Daten …" />
  if (account.error) {
    return setupNeeded ? (
      <Alert kind="warning">
        Kein API-Key hinterlegt. Trage <code>FIRE_API_KEY</code> in die <code>.env</code> ein und starte neu.
      </Alert>
    ) : (
      <ErrorState error={account.error} onRetry={account.refetch} />
    )
  }

  const a = account.data?.data || {}
  const addr = a.invoice_address || {}
  const fullName = [a.firstname, a.lastname].filter(Boolean).join(' ') || '–'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        {a.profile_image ? (
          <img src={a.profile_image} alt="" className="h-16 w-16 rounded-full border border-zinc-800 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
            <User className="h-7 w-7 text-zinc-500" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-zinc-100">{fullName}</h1>
            {a.is_plus_user && (
              <Badge className="bg-amber-500/15 text-amber-400">
                <Star className="h-3 w-3" /> 24fire+
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
            <Mail className="h-3.5 w-3.5" /> {a.email || '–'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Wallet} label="Guthaben" value={euro(a.balance)} />
        <StatCard icon={Star} label="24fire+" value={a.is_plus_user ? 'Aktiv' : 'Nein'} accent={a.is_plus_user ? 'text-amber-400' : 'text-zinc-500'} />
        <StatCard icon={Hash} label="Discord-ID" value={a.discord_id || '–'} />
        <StatCard icon={CalendarClock} label="Registriert" value={a.registry_date ? formatDate(a.registry_date, { hour: undefined, minute: undefined }) : '–'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Rechnungsadresse */}
        <Card>
          <CardHeader title="Rechnungsadresse" icon={MapPin} />
          <div className="p-4">
            {Object.keys(addr).length === 0 ? (
              <EmptyState icon={MapPin} title="Keine Adresse hinterlegt" />
            ) : (
              <dl className="space-y-2 text-sm">
                <Row label="Name" value={addr.name} />
                <Row label="Straße" value={[addr.street, addr.number].filter(Boolean).join(' ')} />
                <Row label="PLZ / Ort" value={[addr.zip, addr.city].filter(Boolean).join(' ')} />
                <Row label="Land" value={addr.country} />
              </dl>
            )}
          </div>
        </Card>

        {/* Affiliate */}
        <Card>
          <CardHeader title="Affiliate" icon={Users} />
          <div className="p-4">
            {affiliate.loading ? (
              <Loading />
            ) : affiliate.error ? (
              <ErrorState error={affiliate.error} onRetry={affiliate.refetch} />
            ) : (
              <KeyValues data={affiliate.data?.data} empty="Keine Affiliate-Daten" emptyIcon={Users} />
            )}
          </div>
        </Card>
      </div>

      {/* Spenden */}
      <Card>
        <CardHeader title="Spenden" icon={HeartHandshake} />
        <div className="p-4">
          {donations.loading ? (
            <Loading />
          ) : donations.error ? (
            <ErrorState error={donations.error} onRetry={donations.refetch} />
          ) : (
            <DonationList data={donations.data?.data} />
          )}
        </div>
      </Card>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-200">{value || '–'}</dd>
    </div>
  )
}

// Rendert die primitiven Felder eines Objekts als Liste (defensiv, da API-Form unklar).
function KeyValues({ data, empty, emptyIcon }) {
  if (!data || typeof data !== 'object') {
    return <EmptyState icon={emptyIcon} title={empty} />
  }
  const entries = Object.entries(data).filter(([, v]) => v == null || typeof v !== 'object')
  if (entries.length === 0) return <EmptyState icon={emptyIcon} title={empty} />
  return (
    <dl className="space-y-2 text-sm">
      {entries.map(([k, v]) => (
        <Row key={k} label={humanize(k)} value={String(v ?? '–')} />
      ))}
    </dl>
  )
}

function DonationList({ data }) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.donations) ? data.donations : null

  if (list) {
    if (list.length === 0) return <EmptyState icon={HeartHandshake} title="Noch keine Spenden" />
    return (
      <div className="space-y-2">
        {list.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-zinc-300">
              <BadgeEuro className="h-4 w-4 text-emerald-400" />
              {d.name || d.donator || d.username || 'Anonym'}
            </span>
            <span className="flex items-center gap-3">
              {d.amount != null && <span className="font-medium text-emerald-400">{euro(d.amount)}</span>}
              {d.date && <span className="text-xs text-zinc-500">{formatDate(d.date)}</span>}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Fallback: Objekt mit Kennzahlen.
  return <KeyValues data={data} empty="Keine Spenden-Daten" emptyIcon={HeartHandshake} />
}
