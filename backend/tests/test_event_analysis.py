import csv
from datetime import date, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from app.main import create_app

@pytest.fixture(scope='module')
def event_client(tmp_path_factory):
    root = tmp_path_factory.mktemp('events')
    with (root / 'sample_FST_TBL.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['P_YYYYMMDD', 'FACL_NM', 'TMZN', 'SEX_DIVS_CD', 'YY10_AGLV_ID', 'VIST_POPL_CNT'])
        for n in range(120):
            day = date(2025, 1, 1) + timedelta(days=n)
            for facility in ['정상', '누락', '영', '요일누락']:
                if facility == '누락' and date(2025, 1, 8) <= day <= date(2025, 1, 22): continue
                if facility == '요일누락' and day.weekday() == 6: continue
                for age in ['20대', '30대']:
                    for sex in ['F', 'M']:
                        value = (day.weekday() + 1) * (2 if day >= date(2025, 2, 12) else 1) * (3 if sex == 'F' else 1) * (2 if age == '30대' else 1)
                        writer.writerow([day, facility, 12, sex, age, 0 if facility == '영' else value])
    with (root / 'sample_SECD_TBL.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['P_YYYYMM', 'TRGT_BASE_FACL_NM', 'TRGT_RLTV_FACL_NM', 'SEX_DIVS_CD', 'YY10_AGLV_ID', 'VIST_POPL_CNT'])
        writer.writerow(['202501', '정상', '누락', 'F', '20대', '12.5'])
    with TestClient(create_app(data_dir=root, db_path=root / 'test.duckdb')) as client:
        yield client

def test_weekday_adjusted_comparison_and_filters(event_client):
    result = event_client.get('/api/events/analysis', params=dict(facility='정상', start_date='2025-02-05', end_date='2025-02-11', age='30대', sex='F')).json()
    assert result['comparison_available']
    assert result['change_percent'] == pytest.approx(100)
    before, during, after = result['periods']
    assert before['start_date'] == '2025-01-08'
    assert after['start_date'] == '2025-02-12'
    assert before['weekday_adjusted_average'] == 24
    assert after['weekday_adjusted_average'] == 48
    assert before['observed_days'] == 28
    assert during['calendar_days'] == 7
    assert before['audience'] == [{'age': '30대', 'sex': 'F', 'population': 672}]

@pytest.mark.parametrize('facility,reason', [('누락', '80%'), ('영', '0이므로'), ('요일누락', '모든 요일')])
def test_unreliable_comparisons_are_not_computed(event_client, facility, reason):
    result = event_client.get('/api/events/analysis', params={'facility': facility, 'start_date': '2025-02-05', 'end_date': '2025-02-11'}).json()
    assert result['change_percent'] is None
    assert not result['comparison_available']
    assert reason in result['comparison_reason']

def test_out_of_range_is_pending_not_zero(event_client):
    result = event_client.get('/api/events/analysis', params={'facility': '정상', 'start_date': '2026-01-01', 'end_date': '2026-01-03'}).json()
    assert result['change_percent'] is None
    assert '분석 대기' in result['comparison_reason']
    assert all(p['population'] is None and p['observed_days'] == 0 for p in result['periods'])

@pytest.mark.parametrize('updates', [dict(window_days=8), dict(facility='없는시설'), dict(start_date='2025-03-01'), dict(end_date='2027-01-01'), dict(start_date='0001-01-01'), dict(sex='X')])
def test_invalid_input(event_client, updates):
    params = dict(facility='정상', start_date='2025-02-05', end_date='2025-02-11')
    params.update(updates)
    assert event_client.get('/api/events/analysis', params=params).status_code == 422

def test_real_data_periods_match_csv(tmp_path):
    from app.database import DATA_DIR
    with TestClient(create_app(db_path=tmp_path / 'real.duckdb')) as client:
        result = client.get('/api/events/analysis', params=dict(facility='농업박물관', start_date='2025-06-01', end_date='2025-06-07', age='20대')).json()
    with next(DATA_DIR.glob('*_FST_TBL.csv')).open(encoding='utf-8-sig') as f:
        rows = [r for r in csv.DictReader(f) if r['FACL_NM'] == '농업박물관' and r['YY10_AGLV_ID'] == '20대']
    for period in result['periods']:
        selected = [r for r in rows if period['start_date'] <= r['P_YYYYMMDD'] <= period['end_date']]
        total = sum(Decimal(r['VIST_POPL_CNT']) for r in selected)
        assert float(total) == pytest.approx(period['population'])
        assert len({r['P_YYYYMMDD'] for r in selected}) == period['observed_days']
