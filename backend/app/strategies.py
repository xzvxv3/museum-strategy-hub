"""Measured, scope-dependent strategy rules; thresholds are review heuristics, not forecasts."""
from calendar import monthrange
from datetime import date, timedelta
from statistics import mean, pstdev

RULE_VERSION = '2.0'


def build_strategy_analysis(run, where, params, data, start, end, facility=None, sex=None, age=None):
    strategies, diagnostics = [], []
    total = float(data['summary']['population'])
    observed = data['summary']['observed_days']
    span = max(1, (end - start).days + 1)
    usable = total > 0 and observed >= 14 and observed / span >= .5
    profile = {'facility': facility, 'observed_days': observed, 'calendar_days': span,
               'day_coverage': round(observed / span, 4), 'supported': usable, 'rule_version': RULE_VERSION}

    def judge(code, goal, condition, reason, payload=None, priority=1):
        matched = bool(condition)
        if not usable and code != 'sustained_relation':
            reason = f'기본 관측 지원 부족(관측 {observed}일, 날짜 비율 {observed / span:.1%}; 14일·50% 이상 필요). ' + reason
        diagnostics.append({'code': code, 'goal': goal, 'matched': matched, 'reason': reason})
        if matched:
            strategies.append({'id': code, 'goal': goal, 'trigger': reason, 'priority': priority,
                               'rule_version': RULE_VERSION, **payload})

    # A time concentration strategy is warranted only when the top 3 hours contain >=30%.
    hours = sorted(data['breakdowns']['hour'], key=lambda row: (-float(row['population']), row['category']))
    top_three = hours[:3]
    peak_share = sum(float(row['population']) for row in top_three) / total if total else 0
    night_share = sum(float(row['population']) for row in hours if row['category'] <= 5) / total if total else 0
    profile.update(top_three_hour_share=round(peak_share, 4), night_share=round(night_share, 4),
                   peak_hours=[row['category'] for row in top_three])
    full_day_scope = params[0] == 0 and params[1] == 23
    hour_scope_reason = (
        f'시간 필터 {params[0]:02d}~{params[1]:02d}시가 적용되어 전체 하루의 시간 집중도 판정 제외'
        if not full_day_scope else None
    )
    hour_label = '·'.join(f"{row['category']:02d}시" for row in top_three)
    peak_safe = bool(hours and 6 <= hours[0]['category'] <= 21)
    judge('hour_concentration', '시간대 운영', usable and full_day_scope and peak_share >= .30 and peak_safe and night_share < .15,
          hour_scope_reason or f'상위 3시간 비중 {peak_share:.1%} / 기준 30% 이상; 관측 {observed}일',
          {'title': f'{hour_label} 집중 수요에 맞춘 안내 배치',
           'evidence': f'{hour_label} 합계 비중 {peak_share:.1%} · 최다 {hours[0]["category"]:02d}시' if hours else '관측 없음',
           'action': f'{facility or "선택 범위"}의 방문이 집중된 {hour_label}에 안내·해설 인력을 배치하는 방안을 검토하세요. 실제 개관시간을 먼저 확인하고 다른 시간의 수요도 함께 점검하세요.',
           'metric': '상위 3시간 방문 비중과 시간대별 방문 규모'}, priority=2)
    judge('night_scope', '집계 범위 점검', usable and full_day_scope and night_share >= .15,
          hour_scope_reason or f'00~05시 비중 {night_share:.1%} / 기준 15% 이상',
          {'title': '새벽 집계 범위 확인 후 운영 판단',
           'evidence': f'00~05시 집계 {night_share:.1%} · 방문 인구 합계 {total * night_share:.2f}명',
           'action': '새벽 집계가 실제 관람인지 주변 활동을 포함하는지 CSV만으로 확정할 수 없습니다. 집계 범위를 내부에서 검토하기 전 새벽 프로그램 운영으로 연결하지 마세요.',
           'metric': '새벽 시간대 방문 인구와 집계 범위', 'chart': {'type': 'hours'}}, priority=3)

    # Do not infer audience concentration from a filter that predetermines the group.
    top_audience = max(data['audience'], key=lambda row: float(row['population']), default=None)
    audience_share = float(top_audience['population']) / total if total and top_audience else 0
    audience_label = f"{top_audience['age']} {'여성' if top_audience['sex'] == 'F' else '남성'}" if top_audience else '관측 없음'
    profile.update(top_audience=audience_label, top_audience_share=round(audience_share, 4))
    audience_reason = ('연령·성별 조건이 제한되어 구성 집중도 판정 제외' if age or sex else
                       f'최대 집단 {audience_label} {audience_share:.1%} / 기준 45% 이상')
    judge('audience_concentration', '관객 프로그램', usable and not age and not sex and audience_share >= .45,
          audience_reason, {'title': f'{audience_label} 중심 프로그램과 관객층 확대 검토',
           'evidence': f'{audience_label} {audience_share:.1%} · {top_audience["population"]}명' if top_audience else '관측 없음',
           'action': f'{audience_label} 대상 전시 소개를 검토하되, 다른 20·30대 집단을 위한 안내도 함께 구성하세요. 높은 비중은 선호나 프로그램 효과를 뜻하지 않습니다.',
           'metric': '20·30대 내 연령·성별 구성비와 집단별 방문 규모'}, priority=2)

    day_types = run(f'''SELECT CASE WHEN isodow(date)<=5 THEN '평일' ELSE '주말' END AS label,
        sum(population) AS population, count(DISTINCT date) AS observed_days
        FROM visits WHERE {where} GROUP BY 1 ORDER BY 1''', params)
    for row in day_types:
        row['daily_average'] = round(float(row['population']) / row['observed_days'], 2)
    by_type = {row['label']: row for row in day_types}
    weekday = by_type.get('평일', {})
    weekend = by_type.get('주말', {})
    ratio = weekend.get('daily_average', 0) / weekday['daily_average'] if weekday.get('daily_average') else None
    day_support = usable and span >= 28 and weekday.get('observed_days', 0) >= 10 and weekend.get('observed_days', 0) >= 4
    day_difference = ratio is not None and (ratio >= 1.3 or ratio <= 1 / 1.3)
    profile['weekend_to_weekday_ratio'] = round(ratio, 4) if ratio is not None else None
    dominant = '주말' if ratio is not None and ratio >= 1 else '평일'
    judge('day_type_gap', '평일·주말 운영', day_support and day_difference,
          f'주말/평일 관측일 평균 {ratio:.2f}배 / 기준 ≥1.30배 또는 ≤0.77배; 평일 {weekday.get("observed_days", 0)}일·주말 {weekend.get("observed_days", 0)}일(28일 범위·평일 10일·주말 4일 이상 필요)' if ratio is not None else '평일 평균이 0이거나 비교 관측일이 부족합니다.',
          {'title': f'{dominant} 수요 중심 해설·체험 운영 검토',
           'evidence': ' · '.join(f"{row['label']} 관측일 평균 {row['daily_average']}명 ({row['observed_days']}일)" for row in day_types),
           'action': f'{dominant}의 관측일 평균 수요가 상대적으로 높아 해당 요일의 해설·체험 운영을 우선 검토하세요. 다른 요일을 저수요 문제로 단정하지 말고 휴관일·프로그램 일정과 함께 확인하세요.',
           'metric': '평일·주말 관측일 평균 방문 인구', 'chart': {'type': 'day_types', 'items': day_types}}, priority=2)

    monthly = run(f'''SELECT CAST(date_trunc('month',date) AS DATE) AS month,
        sum(population) AS population, count(DISTINCT date) AS observed_days
        FROM visits WHERE {where} GROUP BY 1 ORDER BY 1''', params)
    full_months = [row for row in monthly if start <= row['month']
                   and date(row['month'].year, row['month'].month, monthrange(row['month'].year, row['month'].month)[1]) <= end
                   and row['observed_days'] / monthrange(row['month'].year, row['month'].month)[1] >= .8]
    for row in full_months:
        row['daily_average'] = round(float(row['population']) / row['observed_days'], 2)
    averages = [row['daily_average'] for row in full_months]
    cv = pstdev(averages) / mean(averages) if len(averages) >= 2 and mean(averages) > 0 else None
    profile.update(monthly_cv=round(cv, 4) if cv is not None else None, comparable_months=len(full_months))
    busiest = max(full_months, key=lambda row: row['daily_average'], default=None)
    judge('monthly_variation', '월별 운영 준비', usable and len(full_months) >= 3 and cv is not None and cv >= .50,
          f'월별 평균 변동계수 {cv:.2f} / 기준 0.50 이상; 비교 {len(full_months)}개월 / 기준 3개월 이상' if cv is not None else f'충분히 관측된 완전한 달이 {len(full_months)}개로 비교 부족',
          {'title': f'{busiest["month"].month}월 집중 수요에 대비한 월별 운영안' if busiest else '월별 운영 준비',
           'evidence': f'{busiest["month"]:%Y-%m} 관측일 평균 {busiest["daily_average"]}명 · 월별 평균 변동계수 {cv:.2f}' if busiest and cv is not None else '비교 부족',
           'action': '월별 차이가 커서 일정한 인력·프로그램 운영보다 월별 운영안을 검토할 여지가 있습니다. 관측이 많은 달을 참고하되 휴관·전시 일정을 확인하고 다음 해의 반복 패턴으로 예측하지 마세요.',
           'metric': '월별 관측일 평균 방문 인구와 관측일 수', 'chart': {'type': 'monthly', 'items': full_months}}, priority=2)

    # Explicit range comparison, or a clearly labelled recent-3-month comparison for an annual view.
    comparison_rows = []
    previous = data['comparison']
    if usable and previous.get('available') and previous.get('observed_days', 0) / span >= .8 and observed / span >= .8:
        comparison_rows = [
            {'label': '이전 동일 길이 기간', 'start_date': previous['start_date'], 'end_date': previous['end_date'],
             'observed_days': previous['observed_days'], 'population': previous['population']},
            {'label': '선택 기간', 'start_date': start, 'end_date': end, 'observed_days': observed,
             'population': data['summary']['population']},
        ]
    elif usable and len(full_months) >= 6:
        six = full_months[-6:]
        indexes = [row['month'].year * 12 + row['month'].month for row in six]
        if all(b - a == 1 for a, b in zip(indexes, indexes[1:])):
            for label, rows in [('직전 3개월', six[:3]), ('최근 3개월', six[3:])]:
                last = rows[-1]['month']
                comparison_rows.append({'label': label, 'start_date': rows[0]['month'],
                    'end_date': date(last.year, last.month, monthrange(last.year, last.month)[1]),
                    'observed_days': sum(row['observed_days'] for row in rows),
                    'population': sum(row['population'] for row in rows)})
    for row in comparison_rows:
        row['daily_average'] = round(float(row['population']) / row['observed_days'], 2)
    delta = ((comparison_rows[1]['daily_average'] / comparison_rows[0]['daily_average'] - 1) * 100
             if len(comparison_rows) == 2 and comparison_rows[0]['daily_average'] > 0 else None)
    profile['recent_comparison'] = {'change_percent': round(delta, 2) if delta is not None else None,
                                    'items': comparison_rows}
    comparison_name = comparison_rows[1]['label'] if comparison_rows else '방문 규모'
    judge('visit_change', '방문 규모 점검', delta is not None and abs(delta) >= 20,
          f'{comparison_name} 관측일 평균 {delta:+.1f}% / 기준 ±20% 이상' if delta is not None else '비교 기간 또는 관측일 부족',
          {'title': f'{comparison_name} 방문 {"감소 대응" if delta is not None and delta < 0 else "증가 흐름 점검"}',
           'evidence': f'{comparison_rows[0]["start_date"]} ~ {comparison_rows[0]["end_date"]} 대비 {comparison_name} 관측일 평균 {delta:+.1f}%' if delta is not None else '비교 부족',
           'action': ('방문 감소 구간의 전시 안내·홍보와 운영 일정을 점검하고 개선안을 시범 운영하세요.' if delta is not None and delta < 0 else '방문 증가 구간의 안내 수용력을 확인하고 관객 구성과 운영 변화를 함께 점검하세요.') + ' 관측일 평균 비교이며 감소·증가 원인과 실행 효과를 단정하지 않습니다.',
           'metric': '같은 관객 조건의 기간별 관측일 평균 방문 인구',
           'chart': {'type': 'period', 'items': comparison_rows}}, priority=3 if delta is not None and delta < 0 else 2)

    candidates, role = [], '기준 시설'
    relation_note = '시설 하나를 선택해야 연계 특성을 판정할 수 있습니다.'
    if facility and total <= 0:
        relation_note = '선택 범위의 FST 방문 인구가 없어 시설 연계 검토를 보류합니다.'
    if facility and total > 0:
        # Prefer the recorded base role; if unavailable, examine the recorded relative role separately.
        for own, other, label in [('base_facility', 'related_facility', '기준 시설'),
                                  ('related_facility', 'base_facility', '상대 시설')]:
            clauses, values = [f'{own} = ?', 'month BETWEEN ? AND ?'], [facility, start.replace(day=1), end.replace(day=1)]
            for column, value in [('sex', sex), ('age', age)]:
                if value is not None:
                    clauses.append(f'{column} = ?')
                    values.append(value)
            rows = run(f'''SELECT {other} AS label, month, sum(population) AS population
                FROM relations WHERE {' AND '.join(clauses)} GROUP BY 1,2 HAVING sum(population)>0
                ORDER BY 1,2''', values)
            grouped = {}
            for row in rows:
                entry = grouped.setdefault(row['label'], {'label': row['label'], 'population': 0., 'observed_months': 0, 'max_month': 0.})
                entry['population'] += float(row['population'])
                entry['observed_months'] += 1
                entry['max_month'] = max(entry['max_month'], float(row['population']))
            candidates = sorted(grouped.values(), key=lambda row: (-row['population'], row['label']))
            if candidates:
                role = label
                break
        relation_total = sum(row['population'] for row in candidates)
        for row in candidates:
            row['share'] = round(row['population'] / relation_total, 4)
            row['max_month_share'] = round(row['max_month'] / row['population'], 4)
            row['population'] = round(row['population'], 2)
        if candidates:
            top = candidates[0]
            relation_note = f"{role} 역할 · {top['label']} 비중 {top['share']:.1%} / 기준 50% 이상; 양수 관측 {top['observed_months']}개월 / 기준 3개월 이상; 한 달 집중 {top['max_month_share']:.1%} / 기준 60% 이하"
        else:
            relation_note = '선택 범위의 양수 시설 쌍 집계가 없습니다.'
    relation_match = bool(candidates and candidates[0]['share'] >= .5 and candidates[0]['observed_months'] >= 3
                          and candidates[0]['max_month_share'] <= .6)
    top_relation = candidates[0] if candidates else None
    profile['relation'] = {'role': role, 'partner_count': len(candidates), 'top': top_relation}
    judge('sustained_relation', '시설 연계', relation_match, relation_note,
          {'title': f'{top_relation["label"]} 지속 연계 후보 검토' if top_relation else '시설 연계 후보 검토',
           'evidence': f'{start:%Y-%m} ~ {end:%Y-%m} {top_relation["label"]} {top_relation["share"]:.1%} · 양수 관측 {top_relation["observed_months"]}개월' if top_relation else '관측 없음',
           'action': f'{facility}을 {role}로 기록한 SECD 집계에서 여러 달 확인된 상대 시설을 협력 후보로 검토하세요. 실제 방문 순서·이동 방향이나 협력 효과를 뜻하지 않으며 FST 방문 인구 대비 비율이 아닙니다.',
           'metric': '역할을 구분한 시설 쌍 집계 내 비중과 관측 월 수',
           'chart': {'type': 'relations', 'items': candidates[:5], 'base_facility': facility,
                     'role': role, 'start_month': f'{start:%Y-%m}', 'end_month': f'{end:%Y-%m}',
                     'note': '선택일이 포함된 월 전체의 SECD 집계. 비중의 분모는 같은 역할의 시설 쌍 집계 합이며 고유 방문자 수나 교차방문율이 아닙니다.'}}, priority=1)
    strategies.sort(key=lambda row: -row['priority'])
    return {'strategies': strategies, 'facility_profile': profile, 'strategy_diagnostics': diagnostics,
            'strategy_rule_version': RULE_VERSION}
