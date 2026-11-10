from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .clustering.routes import add_clustering_routes
from .database import DATA_DIR, DB_PATH, initialize, query
from .strategies import build_strategy_analysis

NOTES = [
    '20대·30대만 포함하며 전체 연령의 방문 특성을 대표하지 않습니다.',
    '방문 인구 합계는 고유 방문자 수가 아닙니다. 원자료의 소수값을 보존합니다.',
    '누락된 조합을 0으로 채우지 않습니다. 체류시간·재방문율은 제공하지 않습니다.',
]


def create_app(data_dir=DATA_DIR, db_path=DB_PATH):
    @asynccontextmanager
    async def lifespan(app):
        initialize(data_dir, db_path)
        yield

    app = FastAPI(title='Culture+ Analytics API', version='0.1.0', lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
        allow_methods=['GET', 'POST'], allow_headers=['*'],
    )
    add_clustering_routes(app, db_path, Path(db_path).parent / 'clustering')

    def run(sql, params=()):
        return query(db_path, sql, params)

    def filters(
        start_date: Optional[date] = None, end_date: Optional[date] = None,
        facility: Optional[str] = None,
        sex: Optional[Literal['F', 'M']] = None,
        age: Optional[Literal['20대', '30대']] = None,
        hour_start: int = Query(0, ge=0, le=23),
        hour_end: int = Query(23, ge=0, le=23),
    ):
        if start_date and end_date and start_date > end_date:
            raise HTTPException(422, 'start_date must be <= end_date')
        if hour_start > hour_end:
            raise HTTPException(422, 'hour_start must be <= hour_end')
        if facility and not run('SELECT 1 FROM visits WHERE facility = ? LIMIT 1', [facility]):
            raise HTTPException(422, 'Unknown facility')
        clauses, params = ['hour BETWEEN ? AND ?'], [hour_start, hour_end]
        for column, operator, value in [
            ('date', '>=', start_date), ('date', '<=', end_date),
            ('facility', '=', facility), ('sex', '=', sex), ('age', '=', age),
        ]:
            if value is not None:
                clauses.append(f'{column} {operator} ?')
                params.append(value)
        return ' AND '.join(clauses), params

    @app.get('/api/health')
    def health():
        run('SELECT count(*) FROM visits')
        return {'status': 'ok'}

    @app.get('/api/metadata')
    def metadata():
        return {
            'facilities': [r['facility'] for r in run('SELECT DISTINCT facility FROM visits ORDER BY facility')],
            'ages': ['20대', '30대'], 'sexes': ['F', 'M'],
            'visits': run('SELECT min(date) AS start_date, max(date) AS end_date, count(*) AS rows FROM visits')[0],
            'relations': run('SELECT min(month) AS start_month, max(month) AS end_month, count(*) AS rows FROM relations')[0],
            'notes': NOTES,
        }

    @app.get('/api/visits/summary')
    def summary(selection=Depends(filters)):
        where, params = selection
        result = run(f'''SELECT coalesce(sum(population),0) AS population,
            count(*) AS observed_rows, count(DISTINCT date) AS observed_days,
            min(date) AS first_observed_date, max(date) AS last_observed_date
            FROM visits WHERE {where}''', params)[0]
        result['notes'] = NOTES
        return result

    @app.get('/api/visits/trend')
    def trend(granularity: Literal['day', 'week', 'month'] = 'month', selection=Depends(filters)):
        where, params = selection
        unit = {'day': 'day', 'week': 'week', 'month': 'month'}[granularity]
        return {'items': run(f"""SELECT CAST(date_trunc('{unit}', date) AS DATE) AS period,
            sum(population) AS population, count(*) AS observed_rows
            FROM visits WHERE {where} GROUP BY 1 ORDER BY 1""", params),
            'granularity': granularity, 'week_starts_on': 'Monday', 'missing_periods_filled': False}

    @app.get('/api/visits/breakdown')
    def breakdown(dimension: Literal['facility', 'hour', 'sex', 'age', 'weekday'] = 'facility', selection=Depends(filters)):
        where, params = selection
        column = {'facility': 'facility', 'hour': 'hour', 'sex': 'sex', 'age': 'age', 'weekday': 'isodow(date)'}[dimension]
        return {'dimension': dimension, 'weekday_numbering': 'Monday=1, Sunday=7',
                'items': run(f'''SELECT {column} AS category, sum(population) AS population,
                    count(*) AS observed_rows FROM visits WHERE {where} GROUP BY 1 ORDER BY 1''', params)}

    @app.get('/api/relations')
    def relations(
        start_month: Optional[str] = Query(None, pattern=r'^2025-(0[1-9]|1[0-2])$'),
        end_month: Optional[str] = Query(None, pattern=r'^2025-(0[1-9]|1[0-2])$'),
        base_facility: Optional[str] = None, related_facility: Optional[str] = None,
        sex: Optional[Literal['F', 'M']] = None, age: Optional[Literal['20대', '30대']] = None,
    ):
        if start_month and end_month and start_month > end_month:
            raise HTTPException(422, 'start_month must be <= end_month')
        facilities = {r['facility'] for r in run('SELECT DISTINCT facility FROM visits')}
        if any(f and f not in facilities for f in (base_facility, related_facility)):
            raise HTTPException(422, 'Unknown facility')
        clauses, params = ['true'], []
        for column, op, value in [
            ('month', '>=', start_month + '-01' if start_month else None),
            ('month', '<=', end_month + '-01' if end_month else None),
            ('base_facility', '=', base_facility), ('related_facility', '=', related_facility),
            ('sex', '=', sex), ('age', '=', age),
        ]:
            if value is not None:
                clauses.append(f'{column} {op} ?')
                params.append(value)
        return {'items': run(f'''SELECT month, base_facility, related_facility,
            sum(population) AS population FROM relations WHERE {' AND '.join(clauses)}
            GROUP BY 1,2,3 ORDER BY 1,2,3''', params),
            'notes': ['기준·상대 시설은 이동 방향이나 방문 순서를 뜻한다고 단정할 수 없습니다.',
                      'FST 대비 비율과 고유 교차방문자 수를 산출하지 않습니다.']}

    @app.get('/api/quality')
    def quality():
        return {'datasets': {table: run(f'''SELECT count(*) AS rows,
                    count(*) FILTER (WHERE population = 0) AS zero_rows,
                    sum(population) AS population, max(population) AS max_population
                    FROM {table}''')[0] for table in ('visits', 'relations')},
                'startup_validation': '필수값·자료형·음수·성별·연령·시간·차원 중복 검증 통과',
                'notes': NOTES}

    @app.get('/api/dashboard')
    def dashboard(
        selection=Depends(filters),
        start_date: Optional[date] = None, end_date: Optional[date] = None,
        facility: Optional[str] = None,
        sex: Optional[Literal['F', 'M']] = None,
        age: Optional[Literal['20대', '30대']] = None,
    ):
        """One consistent filter scope for every visit chart and strategy."""
        where, params = selection
        bounds = run('SELECT min(date) AS first, max(date) AS last FROM visits')[0]
        start, end = start_date or bounds['first'], end_date or bounds['last']
        summary = run(f'''SELECT coalesce(sum(population),0) AS population,
            count(*) AS observed_rows, count(DISTINCT date) AS observed_days,
            count(*) FILTER (WHERE population=0) AS zero_rows
            FROM visits WHERE {where}''', params)[0]
        groups = {}
        for name, column in [('hour', 'hour'), ('age', 'age'), ('sex', 'sex'),
                             ('weekday', 'isodow(date)'), ('facility', 'facility')]:
            groups[name] = run(f'''SELECT {column} AS category, sum(population) AS population,
                count(DISTINCT date) AS observed_days FROM visits WHERE {where}
                GROUP BY 1 ORDER BY 1''', params)
        audience = run(f'''SELECT age, sex, sum(population) AS population
            FROM visits WHERE {where} GROUP BY 1,2 ORDER BY 1,2''', params)
        heatmap = run(f'''SELECT isodow(date) AS weekday, hour,
            sum(population) AS population, count(*) AS observed_rows,
            count(DISTINCT date) AS observed_days
            FROM visits WHERE {where} GROUP BY 1,2 ORDER BY 1,2''', params)
        heatmap_audience = run(f'''SELECT isodow(date) AS weekday, hour, age, sex,
            sum(population) AS population FROM visits WHERE {where}
            GROUP BY 1,2,3,4 ORDER BY 1,2,3,4''', params)
        trends = {}
        for unit in ('day', 'week', 'month'):
            trends[unit] = run(f'''SELECT CAST(date_trunc('{unit}',date) AS DATE) AS period,
                sum(population) AS population FROM visits WHERE {where} GROUP BY 1 ORDER BY 1''', params)
        previous_end = start - timedelta(days=1)
        previous_start = previous_end - (end - start)
        comparison = {'start_date': previous_start, 'end_date': previous_end,
                      'available': False, 'reason': '이전 동일 길이 기간이 CSV 제공 범위를 벗어납니다.'}
        if bounds['first'] <= previous_start <= previous_end <= bounds['last']:
            # Date filters are inserted after the two hour parameters by filters().
            date_count = int(start_date is not None) + int(end_date is not None)
            previous_where = where.replace('date >= ?', 'true').replace('date <= ?', 'true')
            previous_params = params[:2] + params[2 + date_count:]
            previous = run(f'''SELECT coalesce(sum(population),0) AS population, count(*) AS observed_rows, count(DISTINCT date) AS observed_days
                FROM visits WHERE {previous_where} AND date BETWEEN ? AND ?''',
                previous_params + [previous_start, previous_end])[0]
            comparison = {**comparison, **previous, 'available': previous['observed_rows'] > 0,
                          'reason': None if previous['observed_rows'] else '이전 기간에 관측 행이 없습니다.'}
            comparison['change_percent'] = (
                round(float((summary['population'] - previous['population']) / previous['population'] * 100), 2)
                if previous['population'] and previous['observed_rows'] and summary['observed_rows'] else None)
        data = {'summary': summary, 'breakdowns': groups, 'audience': audience, 'heatmap': heatmap,
                'heatmap_audience': heatmap_audience, 'trends': trends, 'comparison': comparison,
                'range': {'start_date': start, 'end_date': end}, 'notes': NOTES}
        data.update(build_strategy_analysis(run, where, params, data, start, end, facility, sex, age))
        return data

    return app


app = create_app()
