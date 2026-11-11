import test from 'node:test'
import assert from 'node:assert/strict'
import { readEvents, writeEvents, validateEvent, parseEventsBackup, readDraft, storeDraft, clearDraft, overlappingEvents, shiftDate, eventKey } from '../src/eventStore.js'
const createStorage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) } }
globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()
const event = { id: 'one', title: '실제 검증용', facility: '농업박물관', type: '행사', start: '2025-06-01', end: '2025-06-07', age: '', sex: '', memo: '' }
test('valid dates and nonblank identity are required', () => {
 assert.equal(validateEvent(event), true)
 for (const bad of [{ id: '' }, { facility: ' ' }, { end: '2025-02-30' }, { end: '2025-05-01' }, { end: '2027-01-01' }]) assert.equal(validateEvent({ ...event, ...bad }), false)
})
test('invalid and duplicate backups are rejected without changing saved data', () => {
 writeEvents([event]); const before = localStorage.getItem(eventKey)
 for (const text of ['null', '{}', '{bad', JSON.stringify({ format: 'culture-events', version: 1, events: [event, event] })]) assert.throws(() => parseEventsBackup(text))
 assert.equal(localStorage.getItem(eventKey), before)
 assert.throws(() => writeEvents([event, event]))
})
test('stale-tab saves cannot overwrite newer records', () => {
 writeEvents([event]); const snapshot = readEvents()
 const other = { ...event, id: 'two', title: '다른 탭 추가' }
 writeEvents([...snapshot, other])
 assert.throws(() => writeEvents([{ ...event, title: '이전 탭 수정' }], snapshot), /다른 탭/)
 assert.equal(readEvents().length, 2)
})
test('corrupt storage cannot be overwritten by an empty fallback', () => {
 localStorage.setItem(eventKey, '{broken')
 assert.throws(() => readEvents())
 assert.throws(() => writeEvents([event], []))
 assert.equal(localStorage.getItem(eventKey), '{broken')
 localStorage.removeItem(eventKey)
})
test('draft survives reads, and clearing is explicit', () => {
 const draft = { value: { ...event, id: '', title: '아직 작성 중' }, base: null }
 storeDraft(draft); assert.deepEqual(readDraft(), draft)
 clearDraft(); assert.equal(readDraft(), null)
})
test('overlap includes closed days, spans and only the same facility', () => {
 const closed = { ...event, id: 'closed', type: '휴관', start: '2025-05-04', end: '2025-05-04' }
 const outside = { ...closed, id: 'outside', end: '2025-05-03', start: '2025-05-03' }
 const elsewhere = { ...closed, id: 'elsewhere', facility: '다른 시설' }
 assert.deepEqual(overlappingEvents(event, [event, closed, outside, elsewhere], 28).map(e => e.id), ['closed'])
 assert.equal(shiftDate('2024-03-01', -1), '2024-02-29')
})
