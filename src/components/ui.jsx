// Composite-Komponenten auf Basis von shadcn/ui.
// Behalten die bisherigen, projektspezifischen APIs bei und bauen intern
// auf den shadcn-Primitives unter ./ui/ auf. So bleiben die Seiten unverändert.
import { Loader2, AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usageColor } from '../lib/format.js'

import { Card as ShCard } from '@/components/ui/card'
import { Button as ShButton } from '@/components/ui/button'
import { Badge as ShBadge } from '@/components/ui/badge'
import { Alert as ShAlert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs as TabsRoot, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Karte direkt aus shadcn übernehmen.
export const Card = ShCard

export function Spinner({ className }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

// Kopfbereich einer Karte mit Titel, Untertitel, Icon und optionaler Aktion.
export function CardHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// Alte Varianten auf shadcn-Varianten abbilden.
const VARIANT_MAP = { primary: 'default', danger: 'destructive', ghost: 'outline' }

// Button mit Ladezustand.
export function Button({
  variant = 'ghost',
  size,
  loading,
  disabled,
  className,
  children,
  ...props
}) {
  const mapped = VARIANT_MAP[variant] || variant
  return (
    <ShButton
      variant={mapped}
      size={size}
      className={className}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </ShButton>
  )
}

// Badge: neutrale Basis, Farbklassen lassen sich per className überschreiben.
export function Badge({ children, className }) {
  return (
    <ShBadge variant="secondary" className={cn('gap-1 font-medium', className)}>
      {children}
    </ShBadge>
  )
}

export function StatusDot({ status, className }) {
  const map = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    unknown: 'bg-zinc-500',
  }
  const color = map[status] || 'bg-zinc-500'
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      {status === 'online' && (
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', color)} />
      )}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', color)} />
    </span>
  )
}

export function StatCard({ icon: Icon, label, value, hint, accent = 'text-fire-400' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn('h-4 w-4', accent)} />}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )
}

export function UsageBar({ label, percent, valueText }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{valueText ?? `${p.toFixed(0)} %`}</span>
      </div>
      <Progress value={p} indicatorClassName={usageColor(p)} />
    </div>
  )
}

export function Loading({ label = 'Lädt …', className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <ShAlert variant="error">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{String(error)}</span>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Erneut versuchen
          </Button>
        )}
      </AlertDescription>
    </ShAlert>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, hint }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// Kontrollierte Tab-Leiste (Icon + Label) auf Basis von shadcn Tabs.
export function Tabs({ tabs, active, onChange }) {
  return (
    <TabsRoot value={active} onValueChange={onChange}>
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <TabsTrigger key={t.id} value={t.id}>
              {Icon && <Icon className="h-4 w-4" />}
              {t.label}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </TabsRoot>
  )
}

// Modal auf Basis von shadcn Dialog; behält die open/onClose/footer-API bei.
export function Modal({ open, onClose, title, children, footer }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose?.()
      }}
    >
      <DialogContent>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

// Inline-Meldung; bildet kind auf die shadcn-Alert-Variante ab.
export function Alert({ kind = 'info', children }) {
  return <ShAlert variant={kind}>{children}</ShAlert>
}
