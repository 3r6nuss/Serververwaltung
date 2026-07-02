import { useCallback, useEffect, useRef, useState } from 'react'

// Generischer Data-Fetching-Hook mit Lade-/Fehlerstatus und refetch().
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ loading: immediate, error: null, data: null })
  const mounted = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current()
      if (mounted.current) setState({ loading: false, error: null, data })
      return data
    } catch (err) {
      if (mounted.current) setState({ loading: false, error: err?.message || String(err), data: null })
      return undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mounted.current = true
    if (immediate) run()
    return () => {
      mounted.current = false
    }
  }, [run, immediate])

  return {
    ...state,
    refetch: run,
    setData: (data) => setState((s) => ({ ...s, data })),
  }
}

// Intervall-Hook für Auto-Refresh.
export function useInterval(callback, delay) {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    if (delay == null) return
    const id = setInterval(() => saved.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
