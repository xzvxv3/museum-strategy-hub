import { useState } from 'react'
import { Icon, Mascot } from './ui'
import './Login.css'
import { operatorProfile, demoOperators, quickOperators, startOperatorDemo } from './operatorProfile.js'

export default function Login({ style, onLogin, error, attempts }) {
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [demoFacility, setDemoFacility] = useState(operatorProfile.facility || quickOperators[0].facility)
  const savedId = localStorage.getItem('culture-id') === 'root' ? 'root' : ''

  return <div className="culture-login" style={style}>
    <section className="login-story" aria-label="Museum Flow 소개">
      <div className="login-wordmark">Museum <span>Flow</span><small>MUSEUM INSIGHT PLATFORM</small></div>
      <div className="login-story-content">
        <span className="login-overline">박물관의 다음을 함께</span>
        <h1>데이터로 읽는 하루,<br/>더 나은 박물관의 내일.</h1>
        <p>방문객의 흐름에서 운영의 힌트를 발견하세요.<br/>분석부터 실행까지, Museum Flow가 함께합니다.</p>
        <div className="login-mascot-scene">
          <div className="login-orbit" aria-hidden="true"/>
          <span className="login-scene-note"><Icon name="sprout" size={16}/>작은 발견이 좋은 변화를 만듭니다</span>
          <Mascot variant="welcome"/>
          <span className="login-scene-label">오늘도 반가워요!</span>
        </div>
      </div>
      <div className="login-capabilities">{[['chart', '방문 흐름 분석'], ['bulb', '운영전략 발견'], ['calendar', '실행 계획 관리']].map(([icon, text]) => <span key={icon}><Icon name={icon} size={17}/>{text}</span>)}</div>
    </section>

    <section className="login-entry" aria-labelledby="login-title">
      <div className="login-entry-inner">
        <span className="login-entry-kicker"><span/>MUSEUM FLOW WORKSPACE</span>
        <h2 id="login-title">반가워요, 운영자님.</h2>
        <p className="login-intro">총괄 계정으로 로그인하거나 아래에서 운영자 데모를 선택하세요.</p>
        <form onSubmit={onLogin}>
          <div className="login-field">
            <label htmlFor="login-id">아이디</label>
            <div className="login-input-wrap"><input id="login-id" name="id" autoComplete="username" placeholder="아이디를 입력해 주세요" required defaultValue={savedId} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}/></div>
          </div>
          <div className="login-field">
            <label htmlFor="login-password">비밀번호</label>
            <div className="login-input-wrap"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" required onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} aria-invalid={!!error} aria-describedby={error ? 'login-error' : capsLock ? 'login-caps' : undefined}/><button className="login-password-toggle" type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? '숨기기' : '보기'}</button></div>
            {capsLock && <p id="login-caps" className="login-field-hint" role="status">Caps Lock이 켜져 있습니다.</p>}
          </div>
          <div className="login-form-options"><label htmlFor="login-remember"><input id="login-remember" name="remember" type="checkbox" defaultChecked={!!savedId}/>아이디 저장</label><span>다음 방문을 더 간편하게</span></div>
          {error && <div id="login-error" className="login-error" role="alert"><Icon name="info" size={17}/><p>{error}<br/><span>{attempts ? `남은 시도 ${attempts}회` : '페이지를 새로고침한 뒤 다시 시도해 주세요.'}</span></p></div>}
          <button className="login-submit" disabled={!attempts} type="submit">로그인<Icon name="arrow" size={19}/></button>
        </form>
        <aside className="login-demo" aria-label="데모 계정 안내">
          <div className="login-demo-heading"><span><Icon name="compass" size={18}/>운영자 화면 체험하기</span><span className="login-demo-badge">DEMO</span></div>
          <p>박물관·전시관 등 전체 {demoOperators.length}개 시설 중 담당 시설을 선택하세요.</p>
          <div className="login-quick-heading">빠른 선택 <span>관측일이 충분한 시연 추천 시설</span></div>
          <div className="login-quick-choices">{quickOperators.map(operator => <button key={operator.facility} type="button" aria-pressed={demoFacility === operator.facility} onClick={() => setDemoFacility(operator.facility)}><strong>{operator.facility}</strong></button>)}</div>
          <div className="login-facility-results">전체 시설 · {demoOperators.length}곳 · 가나다순</div>
          <div className="login-facility-list" role="group" aria-label="운영자 데모 시설 선택">{demoOperators.map(operator => <label key={operator.facility} className={demoFacility === operator.facility ? 'selected' : ''}><input type="radio" name="demo-facility" value={operator.facility} checked={demoFacility === operator.facility} onChange={() => setDemoFacility(operator.facility)}/><span>{operator.facility}</span>{demoFacility === operator.facility && <Icon name="check" size={16}/>}</label>)}</div>

          <button type="button" className="login-demo-start" onClick={() => {
            try { startOperatorDemo(demoFacility) }
            catch { setDemoError('데모 시작에 필요한 브라우저 저장 공간을 사용할 수 없습니다. 저장 공간 설정을 확인해 주세요.') }
          }}><span>{demoFacility} 운영자 화면 시작</span><Icon name="arrow" size={17}/></button>
          {demoError && <p className="login-error" role="alert">{demoError}</p>}
          <p className="login-root-note">총괄 운영자는 상단에서 <b>root / 1234</b>로 로그인할 수 있습니다.</p>
        </aside>
        <details className="login-help"><summary>Museum Flow에서는 무엇을 할 수 있나요?</summary><p>시설·기간·관객별 방문 데이터를 비교하고 운영전략을 살펴볼 수 있습니다. 실행 계획과 운영 캘린더로 다음 활동을 준비해 보세요.</p></details>
        <div className="login-entry-footer"><span>Museum Flow · 박물관 운영을 위한 데이터 파트너</span><span>INSIGHT INTO ACTION</span></div>
      </div>
    </section>
  </div>
}
