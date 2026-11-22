import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { operatorProfile } from './operatorProfile.js'
import { initializeAgricultureCapstone } from './agricultureCapstoneSeed.js'

const capstoneSetup = (() => {
  try { return initializeAgricultureCapstone(operatorProfile, localStorage, sessionStorage) }
  catch { return { status: 'error', error: '시연 자료를 준비하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.' } }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App capstoneSetup={capstoneSetup}/>
  </StrictMode>,
)
