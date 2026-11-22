import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import './PlanModal.css'

export default function PlanModal({ dialogRef, title, children }) {
  const titleId = useId()
  const drag = useRef(null)
  const move = (left, top) => {
    const panel = dialogRef.current
    const bounds = panel.getBoundingClientRect()
    Object.assign(panel.style, {
      margin: '0', right: 'auto', bottom: 'auto',
      left: `${Math.max(12, Math.min(left, window.innerWidth - bounds.width - 12))}px`,
      top: `${Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12))}px`,
    })
  }
  useEffect(() => {
    const resize = () => {
      const panel = dialogRef.current
      if (!panel?.open || !panel.style.left) return
      const bounds = panel.getBoundingClientRect()
      Object.assign(panel.style, {
        left: `${Math.max(12, Math.min(bounds.left, window.innerWidth - bounds.width - 12))}px`,
        top: `${Math.max(12, Math.min(bounds.top, window.innerHeight - bounds.height - 12))}px`,
      })
    }
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    observer.observe(dialogRef.current)
    return () => { window.removeEventListener('resize', resize); observer.disconnect() }
  }, [dialogRef])
  return createPortal(<dialog ref={dialogRef} className="plan-modal" aria-labelledby={titleId} onClose={() => { drag.current = null }}>
    <div className="plan-modal-heading" tabIndex={0} aria-label="창 이동: 드래그하거나 방향키를 사용하세요"
      onPointerDown={event => {
        if (event.button !== 0 || event.target.closest('button')) return
        const bounds = dialogRef.current.getBoundingClientRect()
        drag.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => { if (drag.current) move(event.clientX - drag.current.x, event.clientY - drag.current.y) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const bounds = dialogRef.current.getBoundingClientRect()
        move(bounds.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), bounds.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0))
      }}>
      <div><span className="plan-modal-kicker">실행 계획 · 상단을 잡아 이동</span><h2 id={titleId}>{title}</h2></div>
      <button type="button" className="outline" onClick={() => dialogRef.current.close()}>닫기</button>
    </div>
    <div className="plan-modal-body">{children}</div>
  </dialog>, document.querySelector('.app') || document.body)
}
