const number = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const signed = value => `${value > 0 ? '+' : ''}${number(value)}`

export function buildExpectedEffects(data) {
  if (!data?.comparison_available || !Number.isFinite(data.change_percent)) return []
  const before = data.periods.find(period => period.key === 'before')
  const during = data.periods.find(period => period.key === 'during')
  const after = data.periods.find(period => period.key === 'after')
  if (!before || !during || !after) return []
  const increased = data.change_percent > 5
  const decreased = data.change_percent < -5
  const audienceChanges = before.population > 0 && after.population > 0 ? after.audience.map(row => {
    const previous = before.audience.find(item => item.age === row.age && item.sex === row.sex)
    return { label: `${row.age} ${row.sex === 'F' ? '여성' : '남성'}`, change: (row.population / after.population - (previous?.population || 0) / before.population) * 100 }
  }).filter(row => Number.isFinite(row.change)).sort((a, b) => b.change - a.change) : []
  const audience = audienceChanges[0]?.change > 0.1 ? audienceChanges[0] : null
  return [
    {
      icon: 'chart', category: '방문 흐름',
      title: increased ? '방문 흐름을 이어갈 후속 운영' : decreased ? '방문 회복을 위한 운영 보완' : '현재 방문 수준을 유지하는 운영',
      evidence: `전후 변화 ${signed(data.change_percent)}%`,
      description: increased ? '후속 안내와 재방문 프로그램으로 행사 이후의 관심을 이어가는 방안을 검토합니다.' : decreased ? '홍보·전시 안내·운영 일정을 점검하고 다음 행사에서 보완할 운영안을 마련합니다.' : '방문 추이를 더 관찰하면서 운영 규모와 프로그램 구성을 조정하는 방안을 검토합니다.',
    },
    {
      icon: 'user', category: '관객 프로그램', title: '관객층에 맞춘 해설·체험 구성',
      evidence: audience ? `${audience.label} 구성비 ${signed(audience.change)}%p` : '구성비 변화가 뚜렷하지 않음',
      description: audience ? '비중이 높아진 관객층을 참고해 해설·체험의 내용과 안내 채널을 더 적합하게 구성할 수 있습니다.' : '관객 구성을 지속적으로 확인하고 프로그램 대상과 안내 방식의 적합도를 점검합니다.',
    },
    {
      icon: 'calendar', category: '운영 배치', title: '안내 인력과 체험 회차 조정',
      evidence: Number.isFinite(during.daily_average) ? `행사 중 관측일 평균 ${number(during.daily_average)}명` : '행사 기간의 방문 규모 확인 필요',
      description: '행사 기간과 방문 규모를 참고해 인력·체험 회차를 조정하고 혼잡과 운영 공백을 줄이는 방안을 검토합니다.',
    },
  ]
}
