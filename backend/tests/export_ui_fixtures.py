"""Local QA fixture export from the real CSV-backed API; not demo product data."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import create_app
with TestClient(create_app()) as client:
    metadata = client.get('/api/metadata').json()
    fixture = { 'metadata': metadata, 'quality': client.get('/api/quality').json(), 'dashboard': {}, 'events': {} }
    for facility in ['', *metadata['facilities']]:
        for age, sex in [('', ''), ('20대', 'F')]:
            params = {k:v for k,v in dict(facility=facility, age=age, sex=sex).items() if v}
            fixture['dashboard'][json.dumps([facility,age,sex], ensure_ascii=False, separators=(',', ':'))] = client.get('/api/dashboard', params=params).json()
    for start, end in [('2025-06-01','2025-06-07'),('2027-02-01','2027-02-03')]:
        for days in [7,28]:
            fixture['events'][f'{start}|{days}'] = client.get('/api/events/analysis', params=dict(facility='농업박물관',start_date=start,end_date=end,window_days=days)).json()
    # Preserve both team clustering screens in the merged-app integration check.
    for stage in (1, 2):
        response = client.post(f'/api/clustering/stage{stage}/run')
        response.raise_for_status()
        fixture[f'clustering/stage{stage}'] = response.json()
    with open(sys.argv[1], 'w') as f: json.dump(fixture, f, ensure_ascii=False)
