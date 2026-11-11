import { useEffect, useState } from 'react'
import { getApi } from './api'

// Key every result to its request; stale results never appear after filter changes.
export default function useAnalysis(path, params, enabled = true) {
  const key = JSON.stringify(params)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    getApi(path, JSON.parse(key), controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, path, attempt, data }) })
      .catch(error => { if (!controller.signal.aborted) setState({ key, path, attempt, error: error.message }) })
    return () => controller.abort()
  }, [path, key, enabled, attempt])
  const current = enabled && state?.key === key && state?.path === path && state?.attempt === attempt ? state : null
  return { data: current?.data, error: current?.error, loading: enabled && !current, retry: () => setAttempt(v => v + 1) }
}
