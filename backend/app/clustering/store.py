"""Clustering results as JSON files keyed by a hash of the resolved config and the data fingerprint.

The same config on the same data always maps to the same run id, so a stored result is reused
instead of being recomputed.
"""
import hashlib
import json
import os
from pathlib import Path


def run_id(stage: int, config: dict, data_fingerprint: str) -> str:
    canon = json.dumps(config, sort_keys=True, ensure_ascii=False, default=str)
    return f"s{stage}-" + hashlib.sha256(f"{canon}|{data_fingerprint}".encode()).hexdigest()[:16]


class RunStore:
    def __init__(self, directory):
        self.directory = Path(directory)

    def load(self, run_id: str):
        path = self.directory / f"{run_id}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None

    def save(self, run_id: str, result: dict) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        tmp = self.directory / f"{run_id}.json.tmp"
        tmp.write_text(json.dumps(result, ensure_ascii=False, default=str), encoding="utf-8")
        os.replace(tmp, self.directory / f"{run_id}.json")
