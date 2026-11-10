import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.clustering.data import TimeBin, build_calendar, load_dataset
from app.clustering.stage1 import InsufficientSample, Stage1Config, apply_exclusions, build_units, run_stage1
from app.clustering.stage2 import Stage2Config, run_stage2
from app.database import DATA_DIR, initialize
from app.main import create_app

FAST = {'stability_runs': 5, 'n_init': 4}


@pytest.fixture(scope='module')
def db_path(tmp_path_factory):
    path = tmp_path_factory.mktemp('db') / 'test.duckdb'
    initialize(DATA_DIR, path)
    return path


@pytest.fixture(scope='module')
def ds(db_path):
    return load_dataset(db_path)


@pytest.fixture(scope='module')
def default_run(ds):
    r = run_stage1(ds, Stage1Config())
    r['run_id'] = 'test-s1'
    return r


@pytest.fixture(scope='module')
def s2(ds, default_run):
    return run_stage2(ds, default_run, Stage2Config())


# ---------------------------------------------------------------- input grid

def test_grid_keeps_source_rows_and_totals(ds):
    h = ds.hourly
    assert len(h) == 365 * 17 * 24 * 2 * 2
    assert int((~h['is_filled']).sum()) == 297608
    assert h['pop'].sum() == pytest.approx(1847115.49)
    assert (h.loc[h['is_filled'], 'pop'] == 0).all()


# ---------------------------------------------------------------- stage 1

def test_default_stage1_matches_methodology(default_run):
    u = default_run['units']
    assert (u['total'], u['kept'], u['excluded']) == (1785, 1441, 344)
    assert u['excluded_by_reason'] == {'zero_pop': 106, 'min_pop': 238, 'low_observed': 0}
    assert u['low_completeness_kept'] == 5
    assert default_run['selection']['k'] == 3
    assert [c['size'] for c in default_run['clusters']] == [771, 341, 329]
    assert [c['name'] for c in default_run['clusters']] == ['오후 집중형', '출근·오전 집중형', '새벽·밤 비중 높은형']


def test_units_follow_facility_week_daytype(ds):
    u = build_units(ds, Stage1Config().resolved(ds))
    cal = build_calendar(pd.date_range('2025-01-01', '2025-12-31'), True)
    assert len(u) == cal.groupby(['week_start', 'day_type']).ngroups * 17
    assert u['n_days'].sum() == 365 * 17
    assert u['pop'].sum() == pytest.approx(ds.hourly['pop'].sum())
    assert u.loc[u['day_type'] == 'weekday', 'n_days'].max() <= 5


def test_holiday_handling_keeps_real_weekday():
    cal_h = build_calendar(pd.date_range('2025-05-01', '2025-05-10'), True).set_index('date')
    cal_w = build_calendar(pd.date_range('2025-05-01', '2025-05-10'), False).set_index('date')
    d = pd.Timestamp('2025-05-05')  # 어린이날, Monday
    assert cal_h.loc[d, 'day_type'] == 'weekend' and cal_w.loc[d, 'day_type'] == 'weekday'
    assert cal_h.loc[d, 'dow'] == 0 and not cal_h.loc[d, 'is_weekend'] and cal_h.loc[d, 'is_holiday']


def test_bins_cover_24_hours_once_and_shares_sum_to_one(default_run):
    hours = [h for b in default_run['time_bins'] for h in range(b['start'], b['end'] + 1)]
    assert sorted(hours) == list(range(24))
    for a in default_run['assignments'][:200]:
        assert sum(a['shares'].values()) == pytest.approx(1.0)


def test_zero_and_min_pop_units_excluded(ds, default_run):
    u = apply_exclusions(build_units(ds, Stage1Config().resolved(ds)), Stage1Config(min_pop=30))
    assert (u.loc[u['pop'] == 0, 'exclude_reason'] == 'zero_pop').all()
    assert (u.loc[(u['pop'] > 0) & (u['pop'] < 30), 'exclude_reason'] == 'min_pop').all()
    assert u.loc[u['pop'] >= 30, 'exclude_reason'].isna().all()
    assert all(a['pop'] >= 30 for a in default_run['assignments'])


def test_constant_feature_dropped_when_single_sex(ds):
    r = run_stage1(ds, Stage1Config(sexes=['F'], **FAST))
    assert any(d['key'] == 'female_share' for d in r['features']['dropped'])
    assert all(f['key'] != 'female_share' for f in r['features']['used'])


def test_excluded_bin_renormalizes(ds):
    r = run_stage1(ds, Stage1Config(excluded_bins=['dawn'], k=4, **FAST))
    assert all('dawn' not in a['shares'] for a in r['assignments'])
    assert sum(r['assignments'][0]['shares'].values()) == pytest.approx(1.0)
    assert r['selection']['mode'] == 'manual' and len(r['clusters']) == 4


def test_standardization(default_run):
    used = [f['key'] for f in default_run['features']['used'] if f['key'].startswith('share_')]
    raw = np.array([[a['shares'][k[6:]] for k in used] for a in default_run['assignments']])
    mean = np.array([default_run['scaler']['mean'][k] for k in used])
    z = (raw - mean) / np.array([default_run['scaler']['scale'][k] for k in used])
    assert np.allclose(z.mean(axis=0), 0, atol=1e-9) and np.allclose(z.std(axis=0), 1)


def test_k_candidates_evaluated(default_run):
    ks = [e['k'] for e in default_run['evaluation']]
    assert ks == list(range(3, 9))
    for e in default_run['evaluation']:
        assert -1 <= e['silhouette'] <= 1 and 0 <= e['stability_ari_mean'] <= 1
        assert sum(e['sizes']) == default_run['units']['kept']
    assert default_run['selection']['mode'] == 'auto' and default_run['selection']['reason']


def test_fixed_seed_reproducible(ds):
    a = run_stage1(ds, Stage1Config(**FAST))
    b = run_stage1(ds, Stage1Config(**FAST))
    assert [x['cluster'] for x in a['assignments']] == [x['cluster'] for x in b['assignments']]
    assert a['evaluation'] == b['evaluation']


def test_insufficient_sample_refused(ds):
    with pytest.raises(InsufficientSample):
        run_stage1(ds, Stage1Config(start='2025-03-03', end='2025-03-09', facilities=['구세군역사박물관']))


def test_invalid_bins_rejected():
    with pytest.raises(ValueError):
        Stage1Config(time_bins=[TimeBin(key='a', label='a', start=0, end=10), TimeBin(key='b', label='b', start=12, end=23)])


# ---------------------------------------------------------------- stage 2

def test_default_stage2_matches_methodology(s2):
    assert s2['selection']['k'] == 6
    assert [g['size'] for g in s2['groups']] == [4, 4, 3, 2, 2, 2]
    assert [m['name'] for m in s2['groups'][0]['members']] == [
        '농업박물관', '샬트르성바오로수녀회역사박물관', '서울도시건축전시관', '서울시종합자료관']
    assert [e['k'] for e in s2['evaluation']] == [2, 3, 4, 5, 6]


def test_facility_features_match_direct_computation(ds, default_run, s2):
    ft = {r['id']: r['raw'] for r in s2['feature_table']}
    name = '종이나라박물관'
    h = ds.hourly[ds.hourly['facl_id'] == name]
    assert ft[name]['female_share'] == pytest.approx(h.loc[h['sex'] == 'F', 'pop'].sum() / h['pop'].sum())
    assert ft[name]['evening_share'] == pytest.approx(h.loc[h['hour'].between(18, 20), 'pop'].sum() / h['pop'].sum())
    comp = next(c for c in default_run['facility_composition'] if c['id'] == name)
    assert ft[name]['pattern_c0'] == pytest.approx(comp['shares']['0'])
    for raw in ft.values():
        assert sum(raw[f"pattern_c{c['id']}"] for c in default_run['clusters']) == pytest.approx(1.0)
        assert 0 < raw['cross_total_pct'] <= 1 and 0 <= raw['cross_entropy'] <= 1
    assert s2['cross']['months_used'] == list(range(202501, 202513))


def test_groups_dendrogram_consistent(s2):
    for g in s2['groups']:
        for m in g['members']:
            assert s2['assignments'][m['id']] == g['id']
    assert s2['labels_by_k'][str(s2['selection']['k'])] == s2['assignments']
    d = s2['dendrogram']
    assert sorted(d['leaves']) == sorted(s2['assignments'])
    assert len(d['icoord']) == len(d['leaves']) - 1
    hs = [d['cut_heights'][str(k)] for k in range(2, 7)]
    assert hs == sorted(hs, reverse=True)


def test_scaled_features_standardized(s2):
    used = [u['key'] for u in s2['features']['used']]
    z = np.array([[r['scaled'][k] for k in used] for r in s2['feature_table']])
    assert np.allclose(z.mean(axis=0), 0, atol=1e-9) and np.allclose(z.std(axis=0), 1)


def test_feature_toggle_and_sensitivity(ds, default_run, s2):
    r = run_stage2(ds, default_run, Stage2Config(features={'weekend_share': True, 'evening_share': True, 'female_share': True}, k=3))
    assert {u['key'] for u in r['features']['used']} == {'weekend_share', 'evening_share', 'female_share'}
    assert r['selection']['mode'] == 'manual' and len(r['groups']) == 3
    with pytest.raises(ValueError):
        run_stage2(ds, default_run, Stage2Config(features={'weekend_share': True}))
    assert {'drop_cross', 'drop_pattern', 'balanced_groups'} <= {s['variant'] for s in s2['sensitivity']}


# ---------------------------------------------------------------- API

def test_api_runs_once_then_reuses_stored_result(db_path):
    params = {'sex': 'F', 'facility': '국립극장'}
    with TestClient(create_app(db_path=db_path)) as client:
        assert client.get('/api/clustering/stage1', params=params).json()['available'] is False
        assert client.get('/api/clustering/stage2', params=params).json()['available'] is False
        ran = client.post('/api/clustering/stage2/run', params=params).json()
        assert ran['available'] and ran['scope']['sexes'] == ['F']
        assert ran['facility_view']['facility']['id'] == '국립극장'
        s1 = client.get('/api/clustering/stage1', params=params).json()
        assert s1['available'] and s1['run_id'] == ran['parent_run_id']
        assert s1['facility_view']['id'] == '국립극장' and 'assignments' not in s1
        assert client.get('/api/clustering/stage2', params=params).json()['run_id'] == ran['run_id']
        assert client.get('/api/clustering/stage1', params={'facility': '없는 시설'}).status_code == 422
        assert client.get('/api/clustering/stage1', params={'start_date': '2025-12-01', 'end_date': '2025-01-01'}).status_code == 422
