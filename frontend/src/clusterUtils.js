import { useEffect, useState } from 'react'
import { getApi, postApi } from './api'

// Cluster / group colors stay fixed so the same id reads the same in every chart.
const CLUSTER_COLORS = ['#176B68', '#5688A8', '#BD8B47', '#7964A0', '#B4656F', '#6B8E3A', '#3E7CB1', '#9B7440', '#4F9D94', '#8A8F98']
export const clusterColor = i => CLUSTER_COLORS[Number(i) % CLUSTER_COLORS.length]
export const num = (v, digits = 0) => v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const pct = (v, digits = 1) => v == null || Number.isNaN(Number(v)) ? '—' : `${(v * 100).toFixed(digits)}%`
export const pp = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%p`
export const ymLabel = ym => `${Math.floor(ym / 100)}.${String(ym % 100).padStart(2, '0')}`
const sexLabel = { F: '여성', M: '남성' }

export function scopeLabel(filters, metadata) {
  const start = filters.start_date || metadata.visits.start_date
  const end = filters.end_date || metadata.visits.end_date
  return `${start} ~ ${end} · ${filters.age || '20·30대 전체'} · ${sexLabel[filters.sex] || '전체 성별'}`
}

// Reuse ongoing training across tab remounts and facility-only filter changes.
const pendingRuns = new Map()
function train(stage, params) {
  const training = { ...params }
  delete training.facility
  const key = JSON.stringify([stage, training])
  if (!pendingRuns.has(key)) {
    const promise = postApi(`clustering/stage${stage}/run`, training)
      .finally(() => pendingRuns.delete(key))
    pendingRuns.set(key, promise)
  }
  return pendingRuns.get(key)
}

/** Both stages start automatically when no saved result exists. */
export function useClusterResult(stage, filters) {
  const key = JSON.stringify({ start_date: filters.start_date, end_date: filters.end_date, sex: filters.sex, age: filters.age, facility: filters.facility })
  const [state, setState] = useState({ requestKey: '', data: null, error: '', running: false })
  const [attempt, setAttempt] = useState(0)
  const requestKey = JSON.stringify([stage, key, attempt])
  useEffect(() => {
    const controller = new AbortController()
    const params = JSON.parse(key)
    const timer = setTimeout(async () => {
      try {
        let data = await getApi(`clustering/stage${stage}`, params, controller.signal)
        if (controller.signal.aborted) return
        if (!data.available) {
          setState({ requestKey, data: null, error: '', running: true })
          await train(stage, params)
          if (controller.signal.aborted) return
          // Fetch the view for the latest facility without retraining for that facility.
          data = await getApi(`clustering/stage${stage}`, params, controller.signal)
        }
        if (!controller.signal.aborted) setState({ requestKey, data, error: '', running: false })
      } catch (error) {
        if (!controller.signal.aborted) setState({ requestKey, data: null, error: error.message, running: false })
      }
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [stage, key, requestKey])
  const current = state.requestKey === requestKey
  return { data: current ? state.data : null, error: current ? state.error : '', loading: !current,
    running: current && state.running,
    run: () => setAttempt(x => x + 1),
    retry: () => setAttempt(x => x + 1) }
}
