const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export const getApi = (path, params = {}, signal) => request('GET', path, params, signal)
export const postApi = (path, params = {}, signal) => request('POST', path, params, signal)

async function request(method, path, params, signal) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))
  let response
  try {
    response = await fetch(`${base}/api/${path}?${query}`, { method, signal })
  } catch (error) {
  if (error?.name === 'AbortError') throw error

  throw new Error(
    'API 서버와 통신할 수 없습니다. 네트워크와 백엔드 실행 상태를 확인해 주세요.',
    { cause: error }
  )
}
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : ''
    if ([502, 503, 504].includes(response.status)) {
      throw new Error('백엔드 서버에 연결하지 못했습니다. 서버(8000)가 실행 중인지 확인해 주세요.')
    }
    if (response.status === 422) {
      throw new Error(detail || '분석 조건이 올바르지 않습니다. 기간과 필터를 확인해 주세요.')
    }
    if (response.status >= 500) {
      throw new Error(detail || `서버 요청 처리 중 문제가 발생했습니다. (HTTP ${response.status})`)
    }
    throw new Error(detail || `요청을 처리하지 못했습니다. (HTTP ${response.status})`)
  }
  return response.json()
}
