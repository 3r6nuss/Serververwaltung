import { useState } from 'react'
import {
  Network,
  Cpu,
  MemoryStick,
  HardDrive,
  Gauge,
  Server,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { Card, CardHeader, Badge } from '../../components/ui.jsx'
import { formatMemMB, formatGB, cn } from '../../lib/format.js'

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value))
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          /* ignore */
        }
      }}
      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
      title="Kopieren"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Field({ label, value, mono, copy }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="flex items-center gap-1">
        <span className={cn('text-sm text-zinc-200', mono && 'font-mono')}>{value ?? '–'}</span>
        {copy && <CopyButton value={value} />}
      </span>
    </div>
  )
}

export default function OverviewTab({ config }) {
  const [showPw, setShowPw] = useState(false)
  if (!config) return null

  const primaryIp = config.ipv4?.[0]?.ip_address
  const sshPort = config.monitoring?.port && config.monitoring?.enabled ? config.monitoring.port : 22
  const sshCmd = primaryIp
    ? sshPort !== 22
      ? `ssh -p ${sshPort} ${config.username}@${primaryIp}`
      : `ssh ${config.username}@${primaryIp}`
    : null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Verbindung / Zugangsdaten */}
      <Card>
        <CardHeader title="Zugangsdaten" icon={KeyRound} subtitle="SSH-Login & Verbindung" />
        <div className="divide-y divide-zinc-800 px-4">
          <Field label="Hostname" value={config.hostname} mono copy />
          <Field label="Primäre IP" value={primaryIp} mono copy />
          <Field label="Benutzer" value={config.username} mono copy />
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs text-zinc-500">Passwort</span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-sm text-zinc-200">
                {showPw ? config.password : '••••••••••'}
              </span>
              <button
                onClick={() => setShowPw((v) => !v)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                title={showPw ? 'Verbergen' : 'Anzeigen'}
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <CopyButton value={config.password} />
            </span>
          </div>
        </div>
        {sshCmd && (
          <div className="border-t border-zinc-800 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <TerminalSquare className="h-3.5 w-3.5" /> SSH-Befehl
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950/70 px-3 py-2">
              <code className="truncate font-mono text-xs text-fire-300">{sshCmd}</code>
              <CopyButton value={sshCmd} />
            </div>
          </div>
        )}
      </Card>

      {/* Hardware / Specs */}
      <Card>
        <CardHeader title="Spezifikationen" icon={Server} subtitle={config.os?.displayname || config.os?.name} />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Spec icon={Cpu} label="CPU-Kerne" value={config.cores ?? '–'} />
          <Spec icon={MemoryStick} label="Arbeitsspeicher" value={config.mem ? formatMemMB(config.mem) : '–'} />
          <Spec icon={HardDrive} label="Speicherplatz" value={config.disk ? formatGB(config.disk) : '–'} />
          <Spec icon={Gauge} label="Netzwerk" value={config.network_speed ? `${config.network_speed} Mbit/s` : '–'} />
        </div>
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <ShieldCheck className="h-4 w-4" /> Monitoring
            </span>
            <Badge className={config.monitoring?.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700/40 text-zinc-400'}>
              {config.monitoring?.enabled ? 'Aktiv' : 'Deaktiviert'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* IPv4 */}
      {config.ipv4?.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="IPv4-Adressen" icon={Network} subtitle={`${config.ipv4.length} Adresse(n)`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">IP-Adresse</th>
                  <th className="px-4 py-2 font-medium">Gateway</th>
                  <th className="px-4 py-2 font-medium">DDoS</th>
                  <th className="px-4 py-2 font-medium">rDNS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {config.ipv4.map((ip) => (
                  <tr key={ip.ip_address} className="text-zinc-300">
                    <td className="px-4 py-2 font-mono">{ip.ip_address}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{ip.ip_gateway || '–'}</td>
                    <td className="px-4 py-2">{ip.ddos_protection || '–'}</td>
                    <td className="px-4 py-2 text-zinc-500">{ip.rdns || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* IPv6 */}
      {config.ipv6?.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="IPv6-Adressen" icon={Network} subtitle={`${config.ipv6.length} Adresse(n)`} />
          <div className="space-y-1 p-4">
            {config.ipv6.map((ip) => (
              <div key={ip.ip_address} className="flex items-center justify-between gap-2 font-mono text-xs text-zinc-300">
                <span>{ip.ip_address}</span>
                <span className="text-zinc-600">{ip.ip_gateway || ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Spec({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}
