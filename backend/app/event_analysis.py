"""Descriptive event comparisons; never estimates causal event effects."""
from datetime import date, timedelta
from typing import Literal, Optional
from fastapi import HTTPException, Query


def register_event_analysis(app, run):
    @app.get('/api/events/analysis')
    def event_analysis(
        facility: str, start_date: date, end_date: date,
        window_days: int = Query(28, ge=7, le=56),
        age: Optional[Literal['20대', '30대']] = None,
        sex: Optional[Literal['F', 'M']] = None,
    ):
        if (start_date > end_date or (end_date - start_date).days > 365
                or start_date.year < 1901 or end_date.year > 2099
                or window_days not in (7, 14, 28, 56)):
            raise HTTPException(422, '행사 기간은 366일 이내, 비교 기간은 7·14·28·56일로 지정해 주세요.')
        if not run('SELECT 1 FROM visits WHERE facility = ? LIMIT 1', [facility]):
            raise HTTPException(422, '분석할 시설을 확인해 주세요.')
        bounds = run('SELECT min(date) AS first, max(date) AS last FROM visits WHERE facility = ?', [facility])[0]
        clauses, params = ['facility = ?'], [facility]
        for key, value in [('age', age), ('sex', sex)]:
            if value:
                clauses.append(f'{key} = ?')
                params.append(value)
        periods = [
            ('before', '행사 전', start_date - timedelta(days=window_days), start_date - timedelta(days=1)),
            ('during', '행사 중', start_date, end_date),
            ('after', '행사 후', end_date + timedelta(days=1), end_date + timedelta(days=window_days)),
        ]
        results = []
        for key, label, first, last in periods:
            where = ' AND '.join(clauses) + ' AND date BETWEEN ? AND ?'
            args = params + [first, last]
            daily = run(f'SELECT date AS period, sum(population) AS population FROM visits WHERE {where} GROUP BY date ORDER BY date', args)
            audience = run(f'SELECT age, sex, sum(population) AS population FROM visits WHERE {where} GROUP BY age, sex ORDER BY age, sex', args)
            days = (last - first).days + 1
            total = sum((r['population'] for r in daily), 0)
            weekday_values = {n: [] for n in range(7)}
            for row in daily:
                weekday_values[row['period'].weekday()].append(row['population'])
            standardized = (sum(sum(v) / len(v) for v in weekday_values.values()) / 7
                            if all(weekday_values.values()) else None)
            in_range = bool(bounds['first'] and bounds['first'] <= first and last <= bounds['last'])
            ready = in_range and len(daily) / days >= .8 and (key == 'during' or standardized is not None)
            reason = ('분석 대기: 해당 시설의 제공 데이터 기간 밖입니다.' if not in_range
                      else '관측일이 비교 기간의 80% 미만입니다.' if len(daily) / days < .8
                      else '모든 요일의 관측 자료가 필요합니다.' if key != 'during' and standardized is None else None)
            results.append(dict(key=key, label=label, start_date=first, end_date=last,
                                calendar_days=days, observed_days=len(daily), coverage=len(daily) / days,
                                population=total if daily else None,
                                daily_average=total / len(daily) if daily else None,
                                weekday_adjusted_average=standardized, ready=ready, reason=reason,
                                daily=daily, audience=audience))
        before, _, after = results
        available = before['ready'] and after['ready'] and before['weekday_adjusted_average'] > 0
        change = ((after['weekday_adjusted_average'] / before['weekday_adjusted_average'] - 1) * 100
                  if available else None)
        return dict(facility=facility, age=age, sex=sex, window_days=window_days, periods=results,
                    comparison_available=available, change_percent=change,
                    comparison_reason=None if available else (before['reason'] or after['reason'] or '행사 전 기준값이 0이므로 증감률을 계산하지 않습니다.'),
                    notes=['전후 각 기간은 7일의 배수입니다. 요일별 관측일 평균을 구한 뒤 7개 요일을 동일 가중치로 평균합니다.',
                           '양쪽 기간이 제공 범위 안이고 각각 80% 이상 관측되며 모든 요일이 존재할 때만 증감률을 표시합니다.',
                           '관측일은 행이 하나 이상 있는 날입니다. 모든 시간·관객 조합의 완전성을 보장하지 않습니다.',
                           '계절·휴관·다른 행사 등의 영향을 분리하지 않았으므로 행사 효과나 인과관계를 뜻하지 않습니다.',
                           '20·30대 방문 인구 집계이며 고유 방문자 수가 아닙니다.'])
