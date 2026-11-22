export const APP_ROUTES = [
  { path: '/dashboard', page: '홈' },
  { path: '/analytics/visits', page: '데이터 분석', tab: '방문 현황' },
  { path: '/analytics/audience', page: '데이터 분석', tab: '관객 구성' },
  { path: '/analytics/relations', page: '데이터 분석', tab: '시설 비교·연관 방문' },
  { path: '/facilities/compare', page: '시설 비교' },
  { path: '/facility-types/patterns', page: '시설·방문 유형', typeTab: '방문 패턴' },
  { path: '/facility-types/similar-museums', page: '시설·방문 유형', typeTab: '유사 박물관' },
  { path: '/strategies', page: '운영전략' },
  { path: '/execution-plans', page: '실행 계획' },
  { path: '/calendar', page: '운영 캘린더' },
  { path: '/event-analysis', page: '행사 전후 분석' },
  { path: '/settings', page: '설정' },
]
const statuses = { ready: '준비', active: '진행 중', completed: '완료' }

export function resolveAppRoute(address) {
  const url = new URL(address, 'http://localhost')
  let path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/analytics') path = '/analytics/visits'
  if (path === '/facility-types') path = '/facility-types/patterns'
  const match = APP_ROUTES.find(route => route.path === path) || APP_ROUTES[0]
  if (match.page !== '실행 계획') return { ...match }
  return { ...match, planId: url.searchParams.get('plan') || null, planStatus: statuses[url.searchParams.get('status')] || '전체', planFacility: url.searchParams.get('facility') || '' }
}

export function appRouteHref(route) {
  const match = APP_ROUTES.find(item => item.page === route.page && (!route.tab || item.tab === route.tab) && (!route.typeTab || item.typeTab === route.typeTab)) || APP_ROUTES[0]
  if (match.page !== '실행 계획') return match.path
  const query = new URLSearchParams()
  if (route.planId) query.set('plan', route.planId)
  const state = Object.entries(statuses).find(([, label]) => label === route.planStatus)?.[0]
  if (state) query.set('status', state)
  if (route.planFacility) query.set('facility', route.planFacility)
  return `${match.path}${query.size ? `?${query}` : ''}`
}

export const readAppRoute = () => resolveAppRoute(window.location.href)
