const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export const getApi = (path, params = {}, signal) => request('GET', path, params, signal)
export const postApi = (path, params = {}, signal) => request('POST', path, params, signal)

async function request(method, path, params, signal) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))
  const response = await fetch(`${base}/api/${path}?${query}`, { method, signal })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : `조회에 실패했습니다 (${response.status}). 필터를 확인해 주세요.`)
  }
  return response.json()
}
