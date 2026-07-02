import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Flame, LayoutDashboard, Globe, UserRound, Menu, X, ExternalLink, ScrollText, LogOut } from 'lucide-react'
import { cn } from '../lib/format.js'
import { api, getToken } from '../lib/api.js'
import { useAsync } from '../lib/hooks.js'
import { StatusDot } from './ui.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/domains', label: 'Domains & DNS', icon: Globe },
  { to: '/logs', label: 'Zugriffe', icon: ScrollText },
  { to: '/account', label: 'Account', icon: UserRound },
]

function ApiStatus() {
  const { data, error } = useAsync(() => api.health(), [])
  const configured = data?.configured
  const status = error ? 'offline' : configured ? 'online' : 'unknown'
  const label = error ? 'API nicht erreichbar' : configured ? 'API-Key aktiv' : 'Kein API-Key'
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
      <StatusDot status={status} />
      <span>{label}</span>
    </div>
  )
}

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fire-500 to-fire-700 shadow-lg shadow-fire-900/40">
          <Flame className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-100">24fire</div>
          <div className="text-xs text-zinc-500">Server-Verwaltung</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-fire-600/15 text-fire-300 ring-1 ring-fire-600/30'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
              )
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 px-3 py-4">
        <ApiStatus />
        {getToken() && (
          <button
            onClick={() => {
              api.logout()
              window.location.reload()
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Abmelden
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
        <a
          href="https://cp.24fire.de"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Control Panel
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-screen">
      {/* Desktop-Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-950/60 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile-Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-zinc-800 bg-zinc-950 animate-fade-in">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-Topbar */}
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-zinc-800 p-2 text-zinc-300"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-fire-500" />
            <span className="text-sm font-semibold">24fire · Server-Verwaltung</span>
          </div>
        </header>

        <main key={location.pathname} className="mx-auto w-full max-w-7xl flex-1 animate-fade-in px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
