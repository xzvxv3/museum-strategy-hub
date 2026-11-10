import { useEffect, useRef, useState } from 'react'
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

/** Stored result for the filter scope (GET) plus an explicit run (POST) when none exists yet. */
export function useClusterResult(stage, filters) {
  const key = JSON.stringify({ start_date: filters.start_date, end_date: filters.end_date, sex: filters.sex, age: filters.age, facility: filters.facility })
  const latest = useRef(key)
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const [running, setRunning] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    latest.current = key
    const controller = new AbortController()
    getApi(`clustering/stage${stage}`, JSON.parse(key), controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setState({ key, data: null, error: error.message }) })
    return () => controller.abort()
  }, [stage, key, attempt])
  // A run started under other filters must not overwrite the current scope's state.
  const run = () => {
    const runKey = key
    setRunning(runKey)
    postApi(`clustering/stage${stage}/run`, JSON.parse(runKey))
      .then(data => { if (latest.current === runKey) setState({ key: runKey, data, error: '' }) })
      .catch(error => { if (latest.current === runKey) setState({ key: runKey, data: null, error: error.message }) })
      .finally(() => setRunning(current => current === runKey ? '' : current))
  }
  const current = state.key === key
  return { data: current ? state.data : null, error: current ? state.error : '', loading: !current, running: running === key,
    run, retry: () => setAttempt(x => x + 1) }
}
