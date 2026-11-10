"""Clustering input built from the DuckDB store, plus calendar, filter and cross-visit helpers.

The clustering code needs every facility × date × hour × sex × age cell so that it can tell
"no source row" apart from an observed value. That grid exists only inside this module:
cells without a source row get pop 0 and is_filled True, which leaves every sum unchanged
and lets observed ratios and suspected-missing days be counted. API outputs never report
filled cells as observations.
"""
from __future__ import annotations

import calendar as pycal
import threading
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Optional

import duckdb
import holidays as holidays_lib
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, field_validator, model_validator

SEXES = ("F", "M")
AGES = ("20대", "30대")
DOW_LABELS = ("월", "화", "수", "목", "금", "토", "일")
TARGET_LABEL = "분석 대상: 20~30대"
DEFAULT_RANDOM_STATE = 42
# Inclusive hour ranges. Default covers 0-23 exactly once.
DEFAULT_TIME_BINS = [
    {"key": "dawn", "label": "새벽", "start": 0, "end": 6},
    {"key": "commute", "label": "출근", "start": 7, "end": 9},
    {"key": "morning", "label": "오전", "start": 10, "end": 11},
    {"key": "lunch", "label": "점심", "start": 12, "end": 13},
    {"key": "afternoon", "label": "오후", "start": 14, "end": 17},
    {"key": "evening", "label": "저녁", "start": 18, "end": 20},
    {"key": "night", "label": "밤", "start": 21, "end": 23},
]
HOLIDAY_SOURCE = f"holidays {holidays_lib.__version__} (country=KR)"


# ---------------------------------------------------------------- dataset

@dataclass(frozen=True)
class Dataset:
    """Facility keys are the facility names used by the rest of the API."""

    hourly: pd.DataFrame      # full grid: date, facl_id, hour, sex, age, pop, is_filled, ym, dow
    cross_pair: pd.DataFrame  # ym, id_a, id_b, sex, age, pop (one row per undirected pair)
    facilities: pd.DataFrame  # facl_id, facl (sorted)
    fingerprint: str

    @property
    def id_to_name(self) -> dict:
        return dict(zip(self.facilities["facl_id"], self.facilities["facl"]))

    @property
    def facility_ids(self) -> list:
        return list(self.facilities["facl_id"])

    @property
    def date_min(self) -> pd.Timestamp:
        return self.hourly["date"].min()

    @property
    def date_max(self) -> pd.Timestamp:
        return self.hourly["date"].max()


def _build(con: duckdb.DuckDBPyConnection, fingerprint: str) -> Dataset:
    visits = con.execute("SELECT date, facility, hour, sex, age, CAST(population AS DOUBLE) AS pop FROM visits").df()
    relations = con.execute("""SELECT month, base_facility, related_facility, sex, age,
        CAST(population AS DOUBLE) AS pop FROM relations""").df()

    keys = ["date", "facl_id", "hour", "sex", "age"]
    visits = visits.rename(columns={"facility": "facl_id"})
    visits["date"] = pd.to_datetime(visits["date"]).astype("datetime64[ns]")
    visits["hour"] = visits["hour"].astype("int64")
    for c in ("facl_id", "sex", "age"):
        visits[c] = visits[c].astype(object)
    facilities = sorted(visits["facl_id"].unique())
    grid = pd.MultiIndex.from_product(
        [pd.date_range(visits["date"].min(), visits["date"].max()), facilities, range(24), SEXES, AGES], names=keys)
    h = visits.set_index(keys).reindex(grid)
    h["is_filled"] = h["pop"].isna()
    h["pop"] = h["pop"].fillna(0.0)
    h = h.reset_index()
    h["ym"] = h["date"].dt.year * 100 + h["date"].dt.month
    h["dow"] = h["date"].dt.day_of_week

    month = pd.to_datetime(relations["month"])
    cross = pd.DataFrame({
        "ym": month.dt.year * 100 + month.dt.month,
        "id_a": relations["base_facility"].astype(object), "id_b": relations["related_facility"].astype(object),
        "sex": relations["sex"].astype(object), "age": relations["age"].astype(object), "pop": relations["pop"],
    })
    return Dataset(hourly=h, cross_pair=cross,
                   facilities=pd.DataFrame({"facl_id": facilities, "facl": facilities}),
                   fingerprint=fingerprint[:16])


_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()


def load_dataset(db_path) -> Dataset:
    """Cached per database file; rebuilt when the loaded CSV fingerprint changes."""
    with _CACHE_LOCK, duckdb.connect(str(db_path), read_only=True) as con:
        fingerprint = con.execute("SELECT fingerprint FROM source_version").fetchone()[0]
        cached = _CACHE.get(str(db_path))
        if cached is None or cached[0] != fingerprint:
            cached = (fingerprint, _build(con, fingerprint))
            _CACHE[str(db_path)] = cached
        return cached[1]


# ---------------------------------------------------------------- calendar

@lru_cache(maxsize=8)
def korean_holidays(years: tuple) -> dict:
    kr = holidays_lib.country_holidays("KR", years=list(years), language="ko")
    return {pd.Timestamp(d): name for d, name in kr.items()}


def build_calendar(dates, holiday_as_weekend: bool = True) -> pd.DataFrame:
    """One row per unique date. The real weekday is kept; `day_type` counts holidays as
    'weekend' only when `holiday_as_weekend` is True."""
    uniq = pd.DatetimeIndex(pd.to_datetime(pd.Series(dates).unique())).normalize().sort_values()
    hol = korean_holidays(tuple(sorted({d.year for d in uniq})))
    cal = pd.DataFrame({"date": uniq})
    cal["dow"] = cal["date"].dt.day_of_week
    cal["is_weekend"] = cal["dow"] >= 5
    cal["holiday_name"] = cal["date"].map(hol)
    cal["is_holiday"] = cal["holiday_name"].notna()
    weekend_like = cal["is_weekend"] | (cal["is_holiday"] & holiday_as_weekend)
    cal["day_type"] = weekend_like.map({True: "weekend", False: "weekday"})
    cal["week_start"] = cal["date"] - pd.to_timedelta(cal["dow"], unit="D")
    cal["ym"] = cal["date"].dt.year * 100 + cal["date"].dt.month
    return cal


# ---------------------------------------------------------------- filters

class AnalysisFilter(BaseModel):
    """Empty/None lists mean 'all'. Facilities are facility names."""

    start: Optional[date] = None
    end: Optional[date] = None
    facilities: Optional[list[str]] = None
    sexes: Optional[list[str]] = None
    ages: Optional[list[str]] = None
    holiday_as_weekend: bool = True

    @field_validator("sexes")
    @classmethod
    def _sexes(cls, v):
        if v is not None and any(s not in SEXES for s in v):
            raise ValueError(f"알 수 없는 성별 코드: {v}")
        return v or None

    @field_validator("ages")
    @classmethod
    def _ages(cls, v):
        if v is not None and any(a not in AGES for a in v):
            raise ValueError(f"알 수 없는 연령대: {v}")
        return v or None

    @model_validator(mode="after")
    def _range(self):
        if self.start and self.end and self.start > self.end:
            raise ValueError("분석 시작일이 종료일보다 늦습니다.")
        return self

    def resolved(self, ds: Dataset) -> "AnalysisFilter":
        """Fill None with dataset bounds/all values; validate facility names."""
        if self.facilities:
            unknown = [f for f in self.facilities if f not in ds.id_to_name]
            if unknown:
                raise ValueError(f"알 수 없는 시설: {unknown}")
        return AnalysisFilter(
            start=self.start or ds.date_min.date(),
            end=self.end or ds.date_max.date(),
            facilities=sorted(self.facilities) if self.facilities else ds.facility_ids,
            sexes=sorted(self.sexes) if self.sexes else list(SEXES),
            ages=sorted(self.ages) if self.ages else list(AGES),
            holiday_as_weekend=self.holiday_as_weekend,
        )


def filter_hourly(ds: Dataset, f: AnalysisFilter) -> pd.DataFrame:
    r = f.resolved(ds)
    h = ds.hourly
    mask = ((h["date"] >= pd.Timestamp(r.start)) & (h["date"] <= pd.Timestamp(r.end))
            & h["facl_id"].isin(r.facilities) & h["sex"].isin(r.sexes) & h["age"].isin(r.ages))
    return h.loc[mask].copy()


class TimeBin(BaseModel):
    key: str
    label: str
    start: int = Field(ge=0, le=23)
    end: int = Field(ge=0, le=23)

    @model_validator(mode="after")
    def _order(self):
        if self.start > self.end:
            raise ValueError(f"시간 구간 {self.label}: 시작({self.start})이 끝({self.end})보다 큽니다.")
        return self

    @property
    def hours(self) -> list:
        return list(range(self.start, self.end + 1))

    @property
    def range_label(self) -> str:
        return f"{self.start:02d}:00~{self.end:02d}:59"


def default_time_bins() -> list:
    return [TimeBin(**b) for b in DEFAULT_TIME_BINS]


def validate_time_bins(bins: list, require_full_cover: bool = True) -> None:
    """Bins must not overlap; by default they must cover all 24 hours exactly once."""
    seen: dict = {}
    keys = set()
    for b in bins:
        if b.key in keys:
            raise ValueError(f"시간 구간 키 중복: {b.key}")
        keys.add(b.key)
        for hr in b.hours:
            if hr in seen:
                raise ValueError(f"{hr}시가 '{seen[hr]}'와 '{b.label}' 구간에 중복 포함됩니다.")
            seen[hr] = b.label
    if require_full_cover:
        missing = sorted(set(range(24)) - set(seen))
        if missing:
            raise ValueError(f"시간 구간에 포함되지 않은 시간이 있습니다: {missing}")


# ---------------------------------------------------------------- seasonal / cross metrics

def monthly_daily_avg(h: pd.DataFrame, ids: list) -> pd.DataFrame:
    """Facility × month daily average over days with at least one source row; facility-days
    without any source row are suspected missing data, not zero."""
    day = h.groupby(["facl_id", "ym", "date"]).agg(pop=("pop", "sum"), obs=("is_filled", lambda s: (~s).sum()))
    day = day[day["obs"] > 0]
    pop = day.groupby(level=[0, 1])["pop"].sum().unstack()
    n = day.groupby(level=[0, 1]).size().unstack()
    months = sorted(h["ym"].unique())
    return pop.reindex(index=ids, columns=months) / n.reindex(index=ids, columns=months)


def _months(start: date, end: date, full_only: bool) -> list:
    out = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        last = pycal.monthrange(y, m)[1]
        if not full_only or (date(y, m, 1) >= start and date(y, m, last) <= end):
            out.append(y * 100 + m)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _normalized_entropy(values: np.ndarray, n_candidates: int) -> Optional[float]:
    v = np.asarray(values, dtype=float)
    v = v[v > 0]
    if v.sum() <= 0 or n_candidates < 2:
        return None
    p = v / v.sum()
    return float(-(p * np.log(p)).sum() / np.log(n_candidates))


def cross_metrics(ds: Dataset, f: AnalysisFilter) -> dict:
    """Per-facility cross metrics within months fully inside the period, counting both pair roles."""
    r = f.resolved(ds)
    cp = ds.cross_pair
    months = [m for m in _months(r.start, r.end, True) if m in set(cp["ym"])]
    ids = r.facilities
    base = {"months_used": months, "months_excluded": [m for m in _months(r.start, r.end, False) if m not in months]}
    if not months:
        empty = pd.DataFrame({"id": ids})
        for c in ("cross_total", "pct_rank", "n_partners", "entropy"):
            empty[c] = np.nan
        return {**base, "available": False, "table": empty,
                "reason": "분석 기간에 완전히 포함된 월이 없어 월 단위 교차방문 지표를 계산할 수 없습니다."}
    pairs = cp.loc[cp["ym"].isin(months) & cp["sex"].isin(r.sexes) & cp["age"].isin(r.ages)]
    a = pairs.groupby(["id_a", "id_b"])["pop"].sum().reset_index()
    pm = pd.concat([a.rename(columns={"id_a": "facility", "id_b": "partner"}),
                    a.rename(columns={"id_b": "facility", "id_a": "partner"})], ignore_index=True)
    pm = pm.groupby(["facility", "partner"])["pop"].sum().reset_index()
    n_candidates = len(ds.facility_ids) - 1
    rows = []
    for fid in ids:
        sub = pm[(pm["facility"] == fid) & (pm["pop"] > 0)]
        rows.append({"id": fid, "cross_total": float(sub["pop"].sum()), "n_partners": int(len(sub)),
                     "entropy": _normalized_entropy(sub["pop"].to_numpy(), n_candidates)})
    t = pd.DataFrame(rows)
    t["pct_rank"] = t["cross_total"].rank(method="average", pct=True)
    return {**base, "available": True, "reason": None, "table": t}
