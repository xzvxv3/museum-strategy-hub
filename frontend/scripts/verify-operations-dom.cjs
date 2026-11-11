const { JSDOM, VirtualConsole } = require('jsdom')
const { buildSync } = require('esbuild')
const { getQueriesForElement, fireEvent, waitFor } = require('@testing-library/dom')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'backend/tests/.operations-fixtures.json'),'utf8'))
const errors = []
const vc = new VirtualConsole(); vc.on('jsdomError', e => { if(!e.message.includes('navigation')) errors.push(e.message) })
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'http://localhost:5173', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc })
const w=dom.window; global.window=w;global.document=w.document;global.MutationObserver=w.MutationObserver
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){}
w.fetch=async url=>{
 const u = new URL(url,'http://localhost:5173'); const q=u.searchParams; const path=u.pathname.replace('/api/',''); let value;
 if(path==='dashboard') value=fixtures.dashboard[JSON.stringify([q.get('facility')||'',q.get('age')||'',q.get('sex')||''])]
 else if(path==='events/analysis') value=fixtures.events[`${q.get('start_date')}|${q.get('window_days')}`]
 else value=fixtures[path]
 if(!value) throw new Error('Unknown fixture request '+url)
 return {ok:true,json:async()=>value}
}
const bundle=buildSync({entryPoints:[root+'/frontend/src/main.jsx'],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl'}})
w.eval(bundle.outputFiles[0].text)
const ui=getQueriesForElement(w.document.body)
const click = async el=>{fireEvent.click(el);await new Promise(r=>setTimeout(r,15))}
const fill = async(el,value)=>{fireEvent.change(el,{target:{value}});await new Promise(r=>setTimeout(r,15))}
const nav=async name=>click(getQueriesForElement(w.document.querySelector('.sidebar nav')).getByRole('button',{name,exact:true}))
const wait=async selector=>waitFor(()=>assert.ok(w.document.querySelector(selector)),{container:w.document.body,timeout:10000})
const formLabel=name=>ui.getByLabelText(name,{exact:true})
;(async()=>{
 await wait('.home-total-value')
 // Both team clustering tabs must survive the App.jsx three-way merge.
 await nav('데이터 분석')
 for (const name of ['방문 패턴 군집', '유사 박물관 그룹']) {
   await click(ui.getByRole('tab', {name, exact:true}))
   await wait('.cluster-page')
   assert.ok(w.document.querySelector('.cluster-page').textContent.length > 500)
   assert.equal(ui.queryByRole('button', {name:'집계 CSV 다운로드',exact:true}), null)
 }
 await nav('시설 비교'); await wait('.compare-main'); assert.equal(w.document.querySelectorAll('.compare-main').length,3)
 await fill(formLabel('시설 선택 1'),'농업박물관')
 const expected=fixtures.dashboard[JSON.stringify(['농업박물관','',''])]
 const displayed=Number(w.document.querySelector('.compare-main strong').textContent.replace(/[^\d.]/g,''))
 assert.ok(Math.abs(displayed-expected.summary.population/expected.summary.observed_days)<.06)
 await nav('행사 전후 분석')
 await click(ui.getByRole('button',{name:'+ 일정 등록',exact:true}))
 await fill(formLabel('일정 이름'),'검증용 행사')
 await fill(formLabel('시설'),'농업박물관')
 await fill(formLabel('시작일'),'2025-06-01')
 await fill(formLabel('종료일'),'2025-06-07')
 await fill(formLabel('운영 메모'),'테스트 기록')
 await click(ui.getByRole('button',{name:'일정 저장',exact:true})); await wait('.event-result')
 assert.equal(JSON.parse(w.localStorage.getItem('culture-operations-events-v1')).length,1)
 assert.equal(w.document.querySelectorAll('.event-period').length,3)
 assert.ok(!w.document.querySelector('.event-result strong').textContent.includes('—'))
 await click(ui.getByRole('button',{name:'수정',exact:true}));await fill(formLabel('일정 이름'),'수정 검증');await click(ui.getByRole('button',{name:'일정 저장',exact:true}))
 await click(ui.getByRole('button',{name:'운영 캘린더 보기',exact:true}));await fill(formLabel('캘린더 월'),'2025-06')
 await click(ui.getByRole('button',{name:'2025-06-03, 일정 1개',exact:true}));assert.ok(w.document.querySelector('.calendar-detail').textContent.includes('수정 검증'))
 await click(w.document.querySelector('.calendar-detail-item'));await wait('.event-result')
 // Existing execution plans appear on their deadline and open their real editor.
 const plan={strategy:{goal:'시간대 운영',title:'테스트 실행 계획',action:'테스트'},scope:{facility:'농업박물관',start_date:'2025-06-01',end_date:'2025-06-07',age:'',sex:''},owner:'검증',due:'2025-06-03',memo:'',checks:[false,false,false,false],updated_at:'2026-11-09T00:00:00Z'}
 const planId=JSON.stringify(['농업박물관','2025-06-01','2025-06-07','','','시간대 운영'])
 w.localStorage.setItem('culture-execution-plans-v1',JSON.stringify({[planId]:plan}))
 await nav('운영 캘린더');await fill(formLabel('캘린더 월'),'2025-06');await click(ui.getByRole('button',{name:'2025-06-03, 일정 2개',exact:true}));
 const buttons=w.document.querySelectorAll('.calendar-detail-item');await click(buttons[1]);assert.ok(w.document.body.textContent.includes('테스트 실행 계획'))
 await nav('행사 전후 분석');await wait('.event-result');await click(ui.getByRole('button',{name:'수정',exact:true}));await fill(formLabel('시작일'),'2027-02-01');await fill(formLabel('종료일'),'2027-02-03');await click(ui.getByRole('button',{name:'일정 저장',exact:true}));await wait('.event-result')
 assert.equal(w.document.querySelector('.event-result strong').textContent,'—')
 assert.ok(w.document.querySelector('.event-result').textContent.includes('분석 대기'))
 await click(ui.getByRole('button',{name:'삭제',exact:true}));await click(ui.getByRole('button',{name:'삭제 확인',exact:true}));assert.equal(w.document.querySelectorAll('.event-list-item').length,0)
 assert.equal(JSON.parse(w.localStorage.getItem('culture-operations-events-v1')).length,0)
 // Draft survives leaving Operations and mounting it again.
 await click(ui.getByRole('button',{name:'+ 일정 등록',exact:true}));await fill(formLabel('일정 이름'),'복구할 임시 입력')
 await nav('시설 비교');await wait('.compare-main');await nav('행사 전후 분석')
 assert.equal(formLabel('일정 이름').value,'복구할 임시 입력')
 await click(ui.getByRole('button',{name:'취소',exact:true}));assert.equal(w.sessionStorage.getItem('culture-event-draft-v1'),null)
 // Restore the last deletion before leaving Operations; records cannot disappear silently.
 await click(ui.getByRole('button',{name:'+ 일정 등록',exact:true}));await fill(formLabel('일정 이름'),'복구 테스트')
 await fill(formLabel('시설'),'농업박물관');await fill(formLabel('시작일'),'2025-06-01');await fill(formLabel('종료일'),'2025-06-07')
 await click(ui.getByRole('button',{name:'일정 저장',exact:true}));await wait('.event-result')
 await click(ui.getByRole('button',{name:'삭제',exact:true}));await click(ui.getByRole('button',{name:'삭제 확인',exact:true}))
 await click(ui.getByRole('button',{name:'삭제한 일정 복구',exact:true}));await wait('.event-result');assert.equal(w.document.querySelectorAll('.event-list-item').length,1)
 // Search must never show details for a filtered-out event.
 await fill(formLabel('일정 검색'),'일치하지 않는 검색어');assert.equal(w.document.querySelector('.event-result'),null)
 await fill(formLabel('일정 검색'),'');await wait('.event-result')
 // Another registered closure inside the window is disclosed in the analysis.
 const saved=JSON.parse(w.localStorage.getItem('culture-operations-events-v1'))
 w.localStorage.setItem('culture-operations-events-v1',JSON.stringify([...saved,{...saved[0],id:'overlap',title:'휴관 검증',type:'휴관',start:'2025-05-20',end:'2025-05-20'}]))
 w.dispatchEvent(new w.StorageEvent('storage',{key:'culture-operations-events-v1'}));await new Promise(r=>setTimeout(r,15))
 await click(ui.getByRole('button',{name:'저장된 일정 다시 불러오기',exact:true}));await wait('.ops-overlap')
 assert.ok(w.document.querySelector('.ops-overlap').textContent.includes('휴관 검증'))
 // A stale draft cannot overwrite a record edited in another tab, even after reload.
 await click(ui.getByRole('button',{name:'수정',exact:true}));await fill(formLabel('일정 이름'),'덮어쓰면 안 되는 초안')
 const current=JSON.parse(w.localStorage.getItem('culture-operations-events-v1'))
 current[0].title='다른 탭 최신 이름';w.localStorage.setItem('culture-operations-events-v1',JSON.stringify(current))
 await click(ui.getByRole('button',{name:'일정 저장',exact:true}))
 assert.equal(JSON.parse(w.localStorage.getItem('culture-operations-events-v1'))[0].title,'다른 탭 최신 이름')
 await click(ui.getByRole('button',{name:'저장된 일정 다시 불러오기',exact:true}));await click(ui.getByRole('button',{name:'일정 저장',exact:true}))
 assert.ok(w.document.body.textContent.includes('편집 중 원래 일정이 변경되거나 삭제되었습니다'))
 assert.equal(formLabel('일정 이름').value,'덮어쓰면 안 되는 초안')
 await click(ui.getByRole('button',{name:'취소',exact:true}))
 // Failed analytics can be retried without losing saved events.
 const originalFetch=w.fetch;w.fetch=async url=>String(url).includes('events/analysis')?{ok:false,status:503,json:async()=>({detail:'검증용 조회 실패'})}:originalFetch(url)
 await fill(formLabel('전후 비교 기간'),'7');await waitFor(()=>assert.ok(w.document.body.textContent.includes('검증용 조회 실패')),{container:w.document.body})
 w.fetch=originalFetch;await click(ui.getByRole('button',{name:'다시 시도',exact:true}));await wait('.event-result')
 // Compare date dialog keeps reversed date clicks ordered; calendar CSS is scoped.
 await nav('시설 비교');await wait('.compare-main');await click(ui.getByRole('button',{name:'분석 기간 선택',exact:true}));await wait('.range-dialog')
 await click(ui.getByRole('button',{name:'2025-01-20',exact:true}));await click(ui.getByRole('button',{name:'2025-01-10',exact:true}));
 const range=w.document.querySelector('.range-preview').textContent;assert.ok(range.indexOf('2025-01-10')<range.indexOf('2025-01-20'))
 await click(ui.getByRole('button',{name:'기간 적용',exact:true}));assert.ok(w.document.querySelector('.date-range-trigger').textContent.includes('2025-01-10 ~ 2025-01-20'))
 assert.deepEqual(errors,[])
 console.log('PASS merged clustering tabs and DOM interactions: real API comparison values, event create/edit/delete/localStorage, calendar date selection, existing plan linkage, future pending state. Plus drafts, undo, filtered detail, overlap warnings, date range ordering. Visual layout not tested by jsdom.')
 dom.window.close()
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1})
