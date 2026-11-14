import csv
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import DATA_DIR
from app.main import create_app


@pytest.fixture(scope='module')
def client(tmp_path_factory):
    path = tmp_path_factory.mktemp('db') / 'test.duckdb'
    with TestClient(create_app(db_path=path)) as session:
        yield session


def test_totals_match_original_csv(client):
    for suffix, table in [('FST', 'visits'), ('SECD', 'relations')]:
        with next(DATA_DIR.glob(f'*_{suffix}_TBL.csv')).open(encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        expected = sum(Decimal(r['VIST_POPL_CNT']) for r in rows)
        actual = client.get('/api/quality').json()['datasets'][table]
        assert actual['rows'] == len(rows)
        assert Decimal(str(actual['population'])) == expected


def test_combined_filter_matches_csv(client):
    with next(DATA_DIR.glob('*_FST_TBL.csv')).open(encoding='utf-8-sig') as f:
        selected = [r for r in csv.DictReader(f)
                    if r['FACL_NM'] == '농업박물관' and r['SEX_DIVS_CD'] == 'FEMALE'
                    and r['YY10_AGLV_ID'] == '20대'
                    and '2025-05-01' <= r['P_YYYYMMDD'] <= '2025-05-31'
                    and 9 <= int(r['TMZN']) <= 17]
    params = dict(facility='농업박물관', sex='F', age='20대',
                  start_date='2025-05-01', end_date='2025-05-31', hour_start=9, hour_end=17)
    actual = client.get('/api/visits/summary', params=params).json()
    assert actual['observed_rows'] == len(selected)
    assert Decimal(str(actual['population'])) == sum(Decimal(r['VIST_POPL_CNT']) for r in selected)
    for route, extra in [('trend', {'granularity': 'day'}), ('breakdown', {'dimension': 'hour'})]:
        items = client.get('/api/visits/' + route, params={**params, **extra}).json()['items']
        assert sum(Decimal(str(r['population'])) for r in items) == Decimal(str(actual['population']))


def test_relations_filter(client):
    items = client.get('/api/relations', params=dict(start_month='2025-06', end_month='2025-06',
                       base_facility='국토발전전시관', related_facility='배재학당역사박물관', sex='F', age='20대')).json()['items']
    assert len(items) == 1
    assert Decimal(str(items[0]['population'])) == Decimal('108650.56')


@pytest.mark.parametrize('params', [
    {'start_date': '2025-12-01', 'end_date': '2025-01-01'},
    {'hour_start': 20, 'hour_end': 9}, {'sex': 'INVALID'},
    {'age': '40대'}, {'facility': "' OR 1=1 --"},
])
def test_invalid_filters(client, params):
    assert client.get('/api/visits/summary', params=params).status_code == 422


def test_empty_result_and_parallel_queries(client):
    result = client.get('/api/visits/summary', params={'start_date': '2026-01-01'}).json()
    assert result['population'] == 0 and result['observed_days'] == 0
    assert result['first_observed_date'] is None
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.get('/api/metadata'), range(8)))
    assert all(r.status_code == 200 and len(r.json()['facilities']) == 17 for r in results)


def test_unchanged_sources_can_restart(client):
    with TestClient(client.app) as restarted:
        assert restarted.get('/api/health').json() == {'status': 'ok'}


def test_dashboard_consistent_totals_and_comparison(client):
    params = dict(facility='농업박물관', start_date='2025-05-01', end_date='2025-05-31',
                  sex='F', age='20대', hour_start=9, hour_end=17)
    response = client.get('/api/dashboard', params=params)
    assert response.status_code == 200
    data = response.json()
    total = Decimal(str(data['summary']['population']))
    assert total == Decimal(str(client.get('/api/visits/summary', params=params).json()['population']))
    for items in [*data['breakdowns'].values(), *data['trends'].values(), data['audience'], data['heatmap']]:
        assert sum(Decimal(str(item['population'])) for item in items) == total
    previous_params = {**params, 'start_date': '2025-03-31', 'end_date': '2025-04-30'}
    expected = client.get('/api/visits/summary', params=previous_params).json()
    comparison = data['comparison']
    assert comparison['available']
    assert comparison['start_date'] == '2025-03-31'
    assert comparison['population'] == expected['population']
    assert comparison['change_percent'] == round((float(total) / expected['population'] - 1) * 100, 2)
    assert '방문 규모 점검' in {r['goal'] for r in data['strategies']}
    assert '시간대 운영' not in {r['goal'] for r in data['strategies']}
    assert len(data['strategy_diagnostics']) == 7


def test_dashboard_unavailable_comparison_and_empty(client):
    data = client.get('/api/dashboard').json()
    assert not data['comparison']['available']
    assert data['summary']['population'] == 1847115.49
    data = client.get('/api/dashboard', params={'start_date': '2026-01-01', 'end_date': '2026-01-02'}).json()
    assert data['summary']['observed_rows'] == 0
    assert data['strategies'] == []
    assert data['comparison'].get('change_percent') is None
    assert data['heatmap'] == []


def test_heatmap_matches_original_cells(client):
    from datetime import date

    with next(DATA_DIR.glob('*_FST_TBL.csv')).open(encoding='utf-8-sig') as f:
        rows = [r for r in csv.DictReader(f) if r['FACL_NM'] == '농업박물관'
                and '2025-05-01' <= r['P_YYYYMMDD'] <= '2025-05-31'
                and r['SEX_DIVS_CD'] == 'FEMALE' and r['YY10_AGLV_ID'] == '20대'
                and 9 <= int(r['TMZN']) <= 17]
    result = client.get('/api/dashboard', params=dict(facility='농업박물관',
                        start_date='2025-05-01', end_date='2025-05-31',
                        sex='F', age='20대', hour_start=9, hour_end=17)).json()['heatmap']
    for cell in result:
        selected = [r for r in rows if date.fromisoformat(r['P_YYYYMMDD']).isoweekday() == cell['weekday']
                    and int(r['TMZN']) == cell['hour']]
        assert Decimal(str(cell['population'])) == sum(Decimal(r['VIST_POPL_CNT']) for r in selected)
        assert cell['observed_rows'] == len(selected)
        assert cell['observed_days'] == len({r['P_YYYYMMDD'] for r in selected})
    assert sum(c['observed_rows'] for c in result) == len(rows)
    detail = client.get('/api/dashboard', params=dict(facility='농업박물관',
                        start_date='2025-05-01', end_date='2025-05-31',
                        sex='F', age='20대', hour_start=9, hour_end=17)).json()['heatmap_audience']
    for cell in result:
        segments = [r for r in detail if r['weekday'] == cell['weekday'] and r['hour'] == cell['hour']]
        assert sum(Decimal(str(r['population'])) for r in segments) == Decimal(str(cell['population']))
        assert all(r['age'] == '20대' and r['sex'] == 'F' for r in segments)


def test_dashboard_invalid_and_zero_population(client):
    assert client.get('/api/dashboard', params={'hour_start': 20, 'hour_end': 9}).status_code == 422
    data = client.get('/api/dashboard', params=dict(facility='구세군역사박물관',
                      start_date='2025-05-01', end_date='2025-05-01', hour_start=10,
                      hour_end=10, sex='M', age='30대')).json()
    assert data['summary']['population'] == 0
    assert data['strategies'] == []


def test_new_strategy_eligibility(client):
    data = client.get('/api/dashboard', params={'facility': '농업박물관'}).json()
    goals = {row['goal']: row for row in data['strategies']}
    assert '평일·주말 운영' in goals
    assert '월별 운영 준비' in goals
    assert '시설 연계' not in goals
    months = goals['월별 운영 준비']['chart']['items']
    assert len(months) == 12
    for row in months:
        assert row['observed_days'] >= 24
        assert Decimal(str(row['daily_average'])) == round(Decimal(str(row['population'])) / row['observed_days'], 2)
    short = client.get('/api/dashboard', params={'start_date': '2025-05-01', 'end_date': '2025-05-01'}).json()
    assert not {'평일·주말 운영', '월별 운영 준비', '시설 연계'} & {r['goal'] for r in short['strategies']}
    partial = client.get('/api/dashboard', params={'start_date': '2025-01-02', 'end_date': '2025-02-27'}).json()
    assert '월별 운영 준비' not in {r['goal'] for r in partial['strategies']}


def test_weekday_and_relation_evidence_matches_source(client):
    from datetime import date
    params = dict(facility='농업박물관', start_date='2025-05-01', end_date='2025-05-31')
    data = client.get('/api/dashboard', params=params).json()
    goals = {row['goal']: row for row in data['strategies']}
    with next(DATA_DIR.glob('*_FST_TBL.csv')).open(encoding='utf-8-sig') as f:
        rows = [r for r in csv.DictReader(f) if r['FACL_NM'] == '농업박물관'
                and '2025-05-01' <= r['P_YYYYMMDD'] <= '2025-05-31']
    for item in goals['평일·주말 운영']['chart']['items']:
        selected = [r for r in rows if (date.fromisoformat(r['P_YYYYMMDD']).isoweekday() <= 5) == (item['label'] == '평일')]
        expected = sum(Decimal(r['VIST_POPL_CNT']) for r in selected)
        days = len({r['P_YYYYMMDD'] for r in selected})
        assert Decimal(str(item['population'])) == expected
        assert item['observed_days'] == days
        assert Decimal(str(item['daily_average'])) == round(expected / days, 2)
    relation_data = client.get('/api/dashboard', params={'facility': '국토발전전시관'}).json()
    goals = {row['goal']: row for row in relation_data['strategies']}
    with next(DATA_DIR.glob('*_SECD_TBL.csv')).open(encoding='utf-8-sig') as f:
        relations = [r for r in csv.DictReader(f) if r['TRGT_BASE_FACL_NM'] == '국토발전전시관']
    for item in goals['시설 연계']['chart']['items']:
        expected = sum(Decimal(r['VIST_POPL_CNT']) for r in relations if r['TRGT_RLTV_FACL_NM'] == item['label'])
        assert Decimal(str(item['population'])) == expected
    assert goals['시설 연계']['chart']['start_month'] == '2025-01'


def test_partial_hour_filter_does_not_infer_full_day_time_concentration(client):
    params = {'facility': '농업박물관', 'hour_start': 9, 'hour_end': 11}
    response = client.get('/api/dashboard', params=params)
    assert response.status_code == 200
    data = response.json()
    assert data['summary']['population'] > 0

    goals = {item['goal'] for item in data['strategies']}
    assert '시간대 운영' not in goals
    assert '집계 범위 점검' not in goals

    diagnostics = {item['code']: item for item in data['strategy_diagnostics']}
    for code in ('hour_concentration', 'night_scope'):
        assert diagnostics[code]['matched'] is False
        assert '전체 하루의 시간 집중도 판정 제외' in diagnostics[code]['reason']

    full_day = client.get('/api/dashboard', params={'facility': '농업박물관'}).json()
    full_day_diagnostics = {item['code']: item for item in full_day['strategy_diagnostics']}
    assert '시간 필터' not in full_day_diagnostics['hour_concentration']['reason']
