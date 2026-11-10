"""Clustering endpoints. GET returns a stored result for the filter scope; POST .../run computes it."""
import threading
from datetime import date
from typing import Literal, Optional

from fastapi import Depends, HTTPException

from . import stage1, stage2
from .data import load_dataset
from .store import RunStore, run_id

NOT_RUN = '이 조건의 군집 분석 결과가 아직 없습니다. 분석을 실행해 주세요.'


def add_clustering_routes(app, db_path, storage_dir):
    store = RunStore(storage_dir)
    lock = threading.Lock()  # one clustering run at a time

    def scope(
        start_date: Optional[date] = None, end_date: Optional[date] = None,
        sex: Optional[Literal['F', 'M']] = None, age: Optional[Literal['20대', '30대']] = None,
        facility: Optional[str] = None,
    ):
        """Date, sex and age set the training scope; facility only selects the highlighted facility."""
        if start_date and end_date and start_date > end_date:
            raise HTTPException(422, 'start_date must be <= end_date')
        ds = load_dataset(db_path)
        if facility and facility not in ds.id_to_name:
            raise HTTPException(422, 'Unknown facility')
        cfg = stage1.Stage1Config(start=start_date, end=end_date,
                                  sexes=[sex] if sex else None, ages=[age] if age else None)
        s1_id = run_id(1, cfg.resolved(ds).model_dump(mode='json'), ds.fingerprint)
        cfg2 = stage2.Stage2Config(stage1_run_id=s1_id)
        s2_id = run_id(2, cfg2.model_dump(mode='json'), ds.fingerprint)
        return {'ds': ds, 'cfg': cfg, 's1_id': s1_id, 'cfg2': cfg2, 's2_id': s2_id, 'facility': facility}

    def ensure_stage1(s):
        result = store.load(s['s1_id'])
        if result is None:
            try:
                result = stage1.run_stage1(s['ds'], s['cfg'])
            except stage1.InsufficientSample as e:
                raise HTTPException(422, str(e))
            result['run_id'] = s['s1_id']
            store.save(s['s1_id'], result)
        return result

    def ensure_stage2(s):
        result = store.load(s['s2_id'])
        if result is None:
            s1 = ensure_stage1(s)
            try:
                result = stage2.run_stage2(s['ds'], s1, s['cfg2'])
            except ValueError as e:
                raise HTTPException(422, str(e))
            result['run_id'] = s['s2_id']
            store.save(s['s2_id'], result)
        return result

    def stage1_view(result, facility):
        # Unit-level rows are kept on disk only; the screens use the aggregates.
        out = {k: v for k, v in result.items() if k not in ('assignments', 'excluded_units')}
        out['available'] = True
        out['facility_view'] = stage1.facility_view(result, facility) if facility else None
        return out

    def stage2_view(result, facility):
        return {**result, 'available': True,
                'facility_view': stage2.facility_view(result, facility) if facility else None}

    @app.get('/api/clustering/stage1')
    def stage1_get(s=Depends(scope)):
        result = store.load(s['s1_id'])
        return stage1_view(result, s['facility']) if result else {'available': False, 'reason': NOT_RUN}

    @app.post('/api/clustering/stage1/run')
    def stage1_run(s=Depends(scope)):
        with lock:
            return stage1_view(ensure_stage1(s), s['facility'])

    @app.get('/api/clustering/stage2')
    def stage2_get(s=Depends(scope)):
        result = store.load(s['s2_id'])
        return stage2_view(result, s['facility']) if result else {'available': False, 'reason': NOT_RUN}

    @app.post('/api/clustering/stage2/run')
    def stage2_run(s=Depends(scope)):
        with lock:
            return stage2_view(ensure_stage2(s), s['facility'])
