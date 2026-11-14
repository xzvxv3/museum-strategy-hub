import { operatorProfile, operatorStorage } from './operatorProfile.js'
export const eventKey = operatorStorage('events')
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1901-01-01' && value <= '2099-12-31'
}
export function validateEvent(v) {
  return v && typeof v.id === 'string' && v.id.trim().length > 0 && v.id.length <= 100 && typeof v.title === 'string' && v.title.trim().length > 0 && v.title.length <= 100 && typeof v.facility === 'string' && v.facility.trim().length > 0 && v.facility.length <= 100 && ['전시', '행사', '휴관'].includes(v.type) && validDate(v.start) && validDate(v.end) && v.start <= v.end && (new Date(v.end) - new Date(v.start)) / 86400000 <= 365 && ['', '20대', '30대'].includes(v.age) && ['', 'F', 'M'].includes(v.sex) && typeof v.memo === 'string' && v.memo.length <= 2000
}
export function readEvents() {
  const raw = JSON.parse(localStorage.getItem(eventKey) ?? localStorage.getItem('culture-operations-events-v1') ?? '[]')
  if (!Array.isArray(raw) || raw.length > 2000 || raw.some(v => !validateEvent(v)) || new Set(raw.map(v => v.id)).size !== raw.length) throw new Error('저장된 일정 형식을 읽을 수 없습니다. 기존 기록을 덮어쓰지 않도록 저장을 중지했습니다.')
  return raw.filter(event => operatorProfile.isRoot || event.facility === operatorProfile.facility)
}
export function writeEvents(events, expected) {
  if (expected !== undefined && JSON.stringify(readEvents()) !== JSON.stringify(expected)) throw new Error('다른 탭에서 일정이 변경되었습니다. 저장된 일정을 다시 불러온 뒤 변경 내용을 확인해 주세요.')
  if (!Array.isArray(events) || events.length > 2000 || events.some(v => !validateEvent(v)) || new Set(events.map(v => v.id)).size !== events.length) throw new Error('일정은 2,000개까지 저장할 수 있습니다. 입력 내용을 확인해 주세요.')
  if (!operatorProfile.isRoot && events.some(event => event.facility !== operatorProfile.facility)) throw new Error('담당 박물관의 일정만 저장할 수 있습니다.')
  localStorage.setItem(eventKey, JSON.stringify(events))
}
export function parseEventsBackup(text) {
  const b = JSON.parse(text)
  if (!b || b.format !== 'culture-events' || b.version !== 1 || !Array.isArray(b.events) || b.events.length > 2000 || b.events.some(v => !validateEvent(v)) || new Set(b.events.map(v => v.id)).size !== b.events.length) throw new Error('올바른 Museum Flow 일정 백업 파일이 아닙니다.')
  if (!operatorProfile.isRoot && b.events.some(event => event.facility !== operatorProfile.facility)) throw new Error('담당 박물관의 일정 백업만 가져올 수 있습니다.')
  return b.events
}
export function dateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const draftKey = operatorStorage('event-draft')
export function readDraft() {
  try {
    const entry = JSON.parse(sessionStorage.getItem(draftKey) || 'null')
    const v = entry?.value
    if (!v || !['id', 'title', 'facility', 'type', 'start', 'end', 'age', 'sex', 'memo'].every(k => typeof v[k] === 'string') || v.memo.length > 2000 || v.title.length > 100) return null
    if (entry.base !== null && !validateEvent(entry.base)) return null
    return { value: v, base: entry.base }
  } catch { return null }
}
export function storeDraft(entry) { sessionStorage.setItem(draftKey, JSON.stringify(entry)) }
export function clearDraft() { sessionStorage.removeItem(draftKey) }
export function shiftDate(value, days) {
  const d = new Date(`${value}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function overlappingEvents(event, events, days) {
  const first = shiftDate(event.start, -days), last = shiftDate(event.end, days)
  return events.filter(v => v.id !== event.id && v.facility === event.facility && v.start <= last && v.end >= first)
}
