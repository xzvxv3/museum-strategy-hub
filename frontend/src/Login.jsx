import { useRef, useState } from 'react'
import { Icon, Mascot } from './ui'
import './Login.css'

export default function Login({ style, onLogin, error, attempts }) {
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef(null)
  const [capsLock, setCapsLock] = useState(false)
  const savedId = localStorage.getItem('culture-id') || ''

  function fillDemo() {
    const form = formRef.current
    form.elements.id.value = 'abcd'
    form.elements.password.value = '1234'
    form.elements.password.focus()
  }

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
        <p className="login-intro">박물관의 새로운 인사이트를 만나러 갈까요?</p>
        <form ref={formRef} onSubmit={onLogin}>
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
          <div className="login-demo-heading"><span><Icon name="compass" size={18}/>처음 방문하셨나요?</span><span className="login-demo-badge">DEMO</span></div>
          <p>데모 계정으로 Museum Flow를 둘러보세요.</p>
          <div className="login-demo-account"><span>아이디 <b>abcd</b></span><span>비밀번호 <b>1234</b></span><button type="button" onClick={fillDemo}>계정 입력<Icon name="arrow" size={14}/></button></div>
          <small>UI 체험용 계정이며 실제 사용자 인증은 제공하지 않습니다.</small>
        </aside>
        <details className="login-help"><summary>Museum Flow에서는 무엇을 할 수 있나요?</summary><p>시설·기간·관객별 방문 데이터를 비교하고 운영전략을 살펴볼 수 있습니다. 실행 계획과 운영 캘린더로 다음 활동을 준비해 보세요.</p></details>
        <div className="login-entry-footer"><span>Museum Flow · 박물관 운영을 위한 데이터 파트너</span><span>INSIGHT INTO ACTION</span></div>
      </div>
    </section>
  </div>
}
