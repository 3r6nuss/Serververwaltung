import { useState, useEffect, useCallback } from 'react'
import { Flame, Lock } from 'lucide-react'
import { api, setToken, onUnauthorized } from '../lib/api.js'
import { Button, Spinner } from './ui.jsx'
import { Input } from './ui/input.jsx'
import { Label } from './ui/label.jsx'

// Vollbild-Anmeldemaske.
function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(password)
      if (res?.token) {
        setToken(res.token)
        onSuccess()
      } else {
        setError('Login fehlgeschlagen.')
      }
    } catch {
      setError('Falsches Passwort.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fire-500 to-fire-700 shadow-lg shadow-fire-900/40">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">24fire · Server-Verwaltung</h1>
            <p className="text-sm text-muted-foreground">Bitte melde dich an.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="grid gap-1.5">
            <Label htmlFor="login-pw">Passwort</Label>
            <Input
              id="login-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!password}>
            <Lock className="h-4 w-4" /> Anmelden
          </Button>
        </form>
      </div>
    </div>
  )
}

// Sperrt die App hinter einer Anmeldung, sofern der Server Auth verlangt.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, required: false, authed: false })

  const check = useCallback(async () => {
    try {
      const res = await api.authStatus()
      setState({ loading: false, required: !!res.required, authed: !!res.authenticated })
    } catch {
      // Server nicht erreichbar → sicherheitshalber Login zeigen.
      setState({ loading: false, required: true, authed: false })
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  useEffect(() => {
    onUnauthorized(() => setState((s) => ({ ...s, authed: false })))
  }, [])

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Lädt …
      </div>
    )
  }

  if (state.required && !state.authed) {
    return <LoginScreen onSuccess={() => setState((s) => ({ ...s, authed: true }))} />
  }

  return children
}
