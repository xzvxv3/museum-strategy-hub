import { useState } from 'react'
import { Card, Icon } from './ui'
import { operatorProfile, operatorStorage } from './operatorProfile.js'

export default function Settings({ primary, sidebar, setTheme, preferences, setPreferences, notify }) {
  const [account] = useState(() => {
    try { return JSON.parse(localStorage.getItem(operatorStorage('account')) || '{}') } catch { return {} }
  })
  const saveAccount = event => {
    event.preventDefault()
    try {
      localStorage.setItem(operatorStorage('account'), JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))))
      notify('계정 정보를 저장했습니다.')
    } catch { notify('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.') }
  }
  return <div className="settings-grid settings-workspace">
    <div>
      <Card title="운영자 프로필">
        <div className="settings-account-badge"><Icon name="museum" size={20}/><div><strong>{operatorProfile.facility || '전체 시설'}</strong><span>{operatorProfile.role}</span></div></div>
        <form onSubmit={saveAccount}>
          <label>계정<input value={operatorProfile.isRoot ? 'root' : operatorProfile.facility + ' 운영자'} disabled/></label>
          <label>표시 이름<input name="name" defaultValue={account.name || operatorProfile.role} maxLength={80} required/></label>
          <label>이메일<input name="email" type="email" defaultValue={account.email || ''} maxLength={254}/></label>
          <button className="primary account-save" type="submit">프로필 저장</button>
        </form>
      </Card>
    </div>
    <div>
      <Card title="화면 테마" action={<button className="text-button" onClick={() => { setTheme('primary', '#176b68'); setTheme('sidebar', '#163638') }}>기본 색상</button>}>
        <div className="settings-color-preview" aria-hidden="true"><span style={{ background: sidebar }}/><div><i style={{ background: primary }}/><i/><i/></div></div>
        {[['primary', '메인 컬러', primary], ['sidebar', '사이드바 컬러', sidebar]].map(([key, label, value]) => <label className="theme-field" key={key}>{label}<input aria-label={label} type="color" value={value} onChange={event => setTheme(key, event.target.value)}/><code>{value}</code></label>)}
      </Card>
      <Card title="화면 편의 설정">
        <div className="settings-preference-row"><div><strong id="settings-scale-label">화면 배율</strong><p>본문과 차트를 함께 확대합니다.</p></div><select aria-labelledby="settings-scale-label" value={preferences.scale} onChange={event => setPreferences({ ...preferences, scale: Number(event.target.value) })}><option value={1}>기본 · 100%</option><option value={1.1}>크게 · 110%</option><option value={1.2}>더 크게 · 120%</option></select></div>
      </Card>
    </div>
  </div>
}
