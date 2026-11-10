"""Stage 1: K-means clustering of time-of-day detection patterns.

Analysis unit (default): facility × week (Monday start) × day type (weekday / weekend-like).
Features: share of detected population per time bin (sum to 1) + optional female / 30대 share.
Absolute volume is kept aside, never a feature. Clusters describe units, not people.
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from .data import (DEFAULT_RANDOM_STATE, DOW_LABELS, HOLIDAY_SOURCE, TARGET_LABEL, AnalysisFilter, Dataset,
                   TimeBin, build_calendar, default_time_bins, filter_hourly, validate_time_bins)

MIN_UNITS = 30
ZERO_VAR = 1e-12
NAME_MIN_DIFF = 0.02          # share points: below this a profile counts as flat
DAYTYPE_DOMINANT = 0.8        # share of weekday/weekend units to prefix the name
TIE_SILHOUETTE = 0.01
HOLIDAY_BUCKET = 7            # dow unit: holidays bucket when holiday_as_weekend
UNIT_LABELS = {"week_daytype": "시설 × 주 × 평일/주말", "day": "시설 × 일", "dow": "시설 × 요일"}
STABILITY_N_INIT = 3  # sub-sample refits only; the reported model uses cfg.n_init


class InsufficientSample(ValueError):
    pass


class Stage1Config(BaseModel):
    start: Optional[date] = None
    end: Optional[date] = None
    facilities: Optional[list[str]] = None
    sexes: Optional[list[str]] = None
    ages: Optional[list[str]] = None
    holiday_as_weekend: bool = True
    unit: Literal["week_daytype", "day", "dow"] = "week_daytype"
    time_bins: list[TimeBin] = Field(default_factory=default_time_bins)
    excluded_bins: list[str] = Field(default_factory=list)
    include_female_share: bool = True
    include_age30_share: bool = True
    min_pop: float = Field(default=30, ge=0)
    min_observed_ratio: float = Field(default=0.0, ge=0, le=1)
    k_min: int = Field(default=3, ge=2, le=15)
    k_max: int = Field(default=8, ge=2, le=15)
    k: Optional[int] = Field(default=None, ge=2, le=15)
    random_state: int = DEFAULT_RANDOM_STATE
    n_init: int = Field(default=10, ge=1, le=50)
    stability_runs: int = Field(default=20, ge=2, le=100)
    stability_sample_frac: float = Field(default=0.8, ge=0.5, le=0.95)
    min_cluster_share: float = Field(default=0.03, ge=0, le=0.5)
    min_stability: float = Field(default=0.6, ge=0, le=1)

    @model_validator(mode="after")
    def _check(self):
        if self.k_min > self.k_max:
            raise ValueError("k 후보 최솟값이 최댓값보다 큽니다.")
        validate_time_bins(self.time_bins, require_full_cover=True)
        keys = {b.key for b in self.time_bins}
        unknown = [k for k in self.excluded_bins if k not in keys]
        if unknown:
            raise ValueError(f"알 수 없는 제외 구간: {unknown}")
        if len(keys - set(self.excluded_bins)) < 2:
            raise ValueError("군집화에는 최소 2개의 시간대 구간이 필요합니다.")
        return self

    def filter(self) -> AnalysisFilter:
        return AnalysisFilter(start=self.start, end=self.end, facilities=self.facilities, sexes=self.sexes,
                              ages=self.ages, holiday_as_weekend=self.holiday_as_weekend)

    def resolved(self, ds: Dataset) -> "Stage1Config":
        r = self.filter().resolved(ds)
        return self.model_copy(update={"start": r.start, "end": r.end, "facilities": r.facilities,
                                       "sexes": r.sexes, "ages": r.ages,
                                       "excluded_bins": sorted(self.excluded_bins)})

    @property
    def used_bins(self) -> list[TimeBin]:
        return [b for b in self.time_bins if b.key not in set(self.excluded_bins)]


# ---------------------------------------------------------------- units

def build_units(ds: Dataset, cfg: Stage1Config) -> pd.DataFrame:
    """Aggregate hourly rows into analysis units with bin shares and bookkeeping columns."""
    r = cfg.filter().resolved(ds)
    h = filter_hourly(ds, r)
    if h.empty:
        return pd.DataFrame()
    cal = build_calendar(pd.date_range(r.start, r.end), r.holiday_as_weekend)
    h = h.merge(cal[["date", "day_type", "week_start", "is_holiday"]], on="date", how="left")
    bins = cfg.used_bins
    hb = {hr: b.key for b in bins for hr in b.hours}
    h["bin"] = h["hour"].map(hb)
    h = h[h["bin"].notna()]

    if cfg.unit == "week_daytype":
        h["unit_key"] = h["week_start"].dt.strftime("%Y-%m-%d") + "|" + h["day_type"]
    elif cfg.unit == "day":
        h["unit_key"] = h["date"].dt.strftime("%Y-%m-%d")
    else:
        bucket = h["dow"].where(~(h["is_holiday"] & r.holiday_as_weekend), HOLIDAY_BUCKET)
        h["unit_key"] = bucket.map(lambda d: "공휴일" if d == HOLIDAY_BUCKET else DOW_LABELS[int(d)])
        h["day_type"] = bucket.map(lambda d: "weekend" if d >= 5 else "weekday")

    keys = ["facl_id", "unit_key"]
    h["female_pop"] = np.where(h["sex"] == "F", h["pop"], 0.0)
    h["age30_pop"] = np.where(h["age"] == "30대", h["pop"], 0.0)
    h["observed"] = ~h["is_filled"]
    g = h.groupby(keys, sort=True)
    units = g.agg(
        pop=("pop", "sum"), female_pop=("female_pop", "sum"), age30_pop=("age30_pop", "sum"),
        rows=("pop", "size"), observed_rows=("observed", "sum"), n_days=("date", "nunique"),
        period_start=("date", "min"), period_end=("date", "max"), day_type=("day_type", "first"),
    ).reset_index()
    pv = h.pivot_table(index=keys, columns="bin", values="pop", aggfunc="sum", fill_value=0.0)
    pv = pv.reindex(columns=[b.key for b in bins], fill_value=0.0).reset_index()
    units = units.merge(pv, on=keys, how="left")

    day_obs = h.groupby(["facl_id", "unit_key", "date"])["observed"].sum().reset_index()
    miss = day_obs[day_obs["observed"] == 0].groupby(["facl_id", "unit_key"]).size().rename("missing_days")
    units = units.merge(miss, on=keys, how="left")
    units["missing_days"] = units["missing_days"].fillna(0).astype(int)

    units["observed_ratio"] = units["observed_rows"] / units["rows"]
    tot = units["pop"].replace(0, np.nan)
    for b in bins:
        units[f"share_{b.key}"] = units[b.key] / tot
    units["female_share"] = units["female_pop"] / tot
    units["age30_share"] = units["age30_pop"] / tot
    units["ym"] = units["period_start"].dt.year * 100 + units["period_start"].dt.month
    units["week_start"] = units["period_start"] - pd.to_timedelta(units["period_start"].dt.day_of_week, unit="D")
    return units.sort_values(keys).reset_index(drop=True)


def apply_exclusions(units: pd.DataFrame, cfg: Stage1Config) -> pd.DataFrame:
    reason = pd.Series(None, index=units.index, dtype=object)
    reason[units["pop"] <= 0] = "zero_pop"
    reason[reason.isna() & (units["pop"] < cfg.min_pop)] = "min_pop"
    reason[reason.isna() & (units["observed_ratio"] < cfg.min_observed_ratio)] = "low_observed"
    out = units.copy()
    out["exclude_reason"] = reason
    return out


# ---------------------------------------------------------------- model

def feature_columns(cfg: Stage1Config) -> list[tuple[str, str, str]]:
    cols = [(f"share_{b.key}", b.label, "bin") for b in cfg.used_bins]
    if cfg.include_female_share:
        cols.append(("female_share", "여성 비중", "female"))
    if cfg.include_age30_share:
        cols.append(("age30_share", "30대 비중", "age30"))
    return cols


def _fit(X: np.ndarray, k: int, cfg: Stage1Config, seed: int | None = None, n_init: int | None = None) -> KMeans:
    return KMeans(n_clusters=k, n_init=n_init or cfg.n_init,
                  random_state=cfg.random_state if seed is None else seed).fit(X)


def evaluate_k(X: np.ndarray, k: int, cfg: Stage1Config) -> tuple[dict, np.ndarray]:
    km = _fit(X, k, cfg)
    labels = km.labels_
    n = len(X)
    sizes = np.bincount(labels, minlength=k)
    rng = np.random.default_rng(cfg.random_state)
    m = int(round(cfg.stability_sample_frac * n))
    aris = []
    for s in range(cfg.stability_runs):
        idx = np.sort(rng.choice(n, size=m, replace=False))
        sub = _fit(X[idx], k, cfg, seed=cfg.random_state + 1 + s, n_init=min(cfg.n_init, STABILITY_N_INIT))
        aris.append(adjusted_rand_score(labels[idx], sub.labels_))
    shares = sizes / n
    ev = {
        "k": k,
        "silhouette": float(silhouette_score(X, labels)) if k > 1 else None,
        "stability_ari_mean": float(np.mean(aris)),
        "stability_ari_std": float(np.std(aris)),
        "sizes": sorted([int(x) for x in sizes], reverse=True),
        "min_share": float(shares.min()),
        "max_share": float(shares.max()),
        "inertia": float(km.inertia_),
    }
    return ev, labels


def select_k(evals: list[dict], cfg: Stage1Config) -> dict:
    rule = (f"자격 조건: 최소 군집 비중 ≥ {cfg.min_cluster_share:.0%} 그리고 안정성(ARI 평균) ≥ {cfg.min_stability}. "
            f"자격 후보 중 실루엣 최댓값 선택, 실루엣 차이 {TIE_SILHOUETTE} 이내면 안정성이 높은 후보, 그다음 작은 k.")
    for e in evals:
        notes = []
        if e["min_share"] < cfg.min_cluster_share:
            notes.append(f"매우 작은 군집(최소 비중 {e['min_share']:.1%})")
        if e["stability_ari_mean"] < cfg.min_stability:
            notes.append(f"안정성 낮음(ARI {e['stability_ari_mean']:.2f})")
        if e["max_share"] > 0.6:
            notes.append(f"한 군집에 집중(최대 비중 {e['max_share']:.1%})")
        e["notes"] = notes
        e["eligible"] = e["min_share"] >= cfg.min_cluster_share and e["stability_ari_mean"] >= cfg.min_stability
    if cfg.k is not None:
        e = next((x for x in evals if x["k"] == cfg.k), None)
        return {"k": cfg.k, "mode": "manual", "rule": rule,
                "reason": f"사용자가 k={cfg.k}를 직접 지정했습니다." + (f" 주의: {', '.join(e['notes'])}" if e and e["notes"] else ""),
                "warnings": e["notes"] if e else []}
    eligible = [e for e in evals if e["eligible"]]
    if not eligible:
        best = max(evals, key=lambda e: (e["stability_ari_mean"], -e["k"]))
        return {"k": best["k"], "mode": "auto", "rule": rule,
                "reason": f"자격 조건을 만족하는 후보가 없어 안정성이 가장 높은 k={best['k']}를 선택했습니다. 결과 해석에 주의가 필요합니다.",
                "warnings": ["자격 조건을 만족하는 k 후보 없음"]}
    top = max(e["silhouette"] for e in eligible)
    near = [e for e in eligible if top - e["silhouette"] <= TIE_SILHOUETTE]
    best = max(near, key=lambda e: (e["stability_ari_mean"], -e["k"]))
    others = ", ".join(f"k={e['k']}" for e in evals if not e["eligible"])
    reason = (f"k={best['k']}: 실루엣 {best['silhouette']:.3f}, 안정성 ARI {best['stability_ari_mean']:.2f}, "
              f"최소 군집 비중 {best['min_share']:.1%}.")
    if len(near) > 1:
        reason += f" 실루엣 차이 {TIE_SILHOUETTE} 이내 후보({', '.join('k=' + str(e['k']) for e in near)}) 중 안정성이 가장 높습니다."
    if others:
        reason += f" 제외된 후보: {others}."
    return {"k": best["k"], "mode": "auto", "rule": rule, "reason": reason, "warnings": []}


def _relabel(labels: np.ndarray, X: np.ndarray) -> np.ndarray:
    """Deterministic ids: by cluster size desc, ties by centroid first coordinate."""
    ks = np.unique(labels)
    order = sorted(ks, key=lambda c: (-(labels == c).sum(), float(X[labels == c, 0].mean())))
    mapping = {old: new for new, old in enumerate(order)}
    return np.array([mapping[x] for x in labels])


def suggest_names(mean_shares: dict[int, dict], overall: dict, bins: list[TimeBin], daytype: dict[int, dict]) -> dict[int, str]:
    labels = {b.key: b.label for b in bins}
    active = {"evening", "night"}
    names: dict[int, str] = {}
    for cid, ms in mean_shares.items():
        diffs = sorted(((ms[k] - overall[k], k) for k in labels), reverse=True)
        top_diff, top_key = diffs[0]
        if top_diff < NAME_MIN_DIFF:
            name = "시간대 분산형"
        else:
            keys = [top_key]
            if len(diffs) > 1 and diffs[1][0] >= max(NAME_MIN_DIFF, 0.5 * top_diff):
                keys.append(diffs[1][1])
            keys_sorted = sorted(keys, key=lambda k: bins.index(next(b for b in bins if b.key == k)))
            label = "·".join(labels[k] for k in keys_sorted)
            if top_key == "dawn":
                name = f"{label} 비중 높은형"
            elif set(keys) <= active:
                name = f"{label} 활성형"
            else:
                name = f"{label} 집중형"
        dt = daytype[cid]
        n = max(1, dt.get("weekday", 0) + dt.get("weekend", 0))
        if dt.get("weekday", 0) / n >= DAYTYPE_DOMINANT:
            name = f"평일 {name}"
        elif dt.get("weekend", 0) / n >= DAYTYPE_DOMINANT:
            name = f"주말 {name}"
        names[cid] = name
    seen: dict[str, int] = {}
    for cid in sorted(names):
        base = names[cid]
        if base in seen:
            names[cid] = f"{base} ({cid})"
            first = seen[base]
            if not names[first].endswith(f"({first})"):
                names[first] = f"{base} ({first})"
        seen[base] = cid
    return names


# ---------------------------------------------------------------- run

def run_stage1(ds: Dataset, cfg_in: Stage1Config) -> dict:
    # Small matrices: OpenMP thread start-up costs more than it saves.
    with threadpool_limits(1):
        return _run_stage1(ds, cfg_in)


def _run_stage1(ds: Dataset, cfg_in: Stage1Config) -> dict:
    cfg = cfg_in.resolved(ds)
    units = build_units(ds, cfg)
    if units.empty:
        raise InsufficientSample("선택한 조건에 해당하는 데이터가 없습니다.")
    units = apply_exclusions(units, cfg)
    kept = units[units["exclude_reason"].isna()].reset_index(drop=True)
    excluded = units[units["exclude_reason"].notna()]

    feats = feature_columns(cfg)
    dropped = []
    used = []
    for col, label, kind in feats:
        if len(kept) and float(kept[col].std(ddof=0)) > ZERO_VAR:
            used.append((col, label, kind))
        else:
            dropped.append({"key": col, "label": label, "reason": "분산 0(모든 단위에서 값이 같음)"})

    k_hi = cfg.k_max if cfg.k is None else max(cfg.k_max, cfg.k)
    k_lo = cfg.k_min if cfg.k is None else min(cfg.k_min, cfg.k)
    if len(kept) < max(MIN_UNITS, k_hi + 1):
        raise InsufficientSample(
            f"군집분석에 사용할 분석 단위가 부족합니다(유지 {len(kept)}개, 최소 {max(MIN_UNITS, k_hi + 1)}개 필요). "
            "기간·성별·연령 조건을 넓혀 주세요.")
    if len(used) < 2:
        raise InsufficientSample("분산이 있는 특징이 2개 미만이라 군집화할 수 없습니다.")

    cols = [c for c, _, _ in used]
    raw = kept[cols].to_numpy(dtype=float)
    scaler = StandardScaler().fit(raw)
    X = scaler.transform(raw)

    evals, label_sets = [], {}
    for k in range(k_lo, k_hi + 1):
        ev, lab = evaluate_k(X, k, cfg)
        evals.append(ev)
        label_sets[k] = lab
    sel = select_k(evals, cfg)
    k = sel["k"]
    labels = _relabel(label_sets[k], X)
    kept["cluster"] = labels

    bins = cfg.used_bins
    bin_cols = [f"share_{b.key}" for b in bins]
    overall = {b.key: float(kept[f"share_{b.key}"].mean()) for b in bins}
    facility_kept = kept.groupby("facl_id").size()
    month_tot = kept.groupby("ym").size()

    clusters, mean_shares, daytypes = [], {}, {}
    for cid in range(k):
        c = kept[kept["cluster"] == cid]
        ms = {b.key: float(c[f"share_{b.key}"].mean()) for b in bins}
        mean_shares[cid] = ms
        daytypes[cid] = {t: int((c["day_type"] == t).sum()) for t in ("weekday", "weekend")}
        fc = c.groupby("facl_id").size().sort_values(ascending=False)
        mc = c.groupby("ym").size()
        q = c["pop"].quantile([0, 0.25, 0.5, 0.75, 1]).tolist()
        diff = {kk: ms[kk] - overall[kk] for kk in ms}
        clusters.append({
            "id": cid,
            "size": int(len(c)),
            "share": float(len(c) / len(kept)),
            "mean_shares": ms,
            "diff_vs_overall": diff,
            "top_bins": [kk for kk, v in sorted(diff.items(), key=lambda x: -x[1]) if v > 0][:2],
            "mean_female_share": float(c["female_share"].mean()),
            "mean_age30_share": float(c["age30_share"].mean()),
            "day_type": daytypes[cid],
            "top_facilities": [
                {"id": f, "name": ds.id_to_name[f], "count": int(n), "share_of_cluster": float(n / len(c)),
                 "share_of_facility": float(n / facility_kept[f])} for f, n in fc.head(5).items()
            ],
            "monthly": [{"ym": int(m), "count": int(mc.get(m, 0)), "share": float(mc.get(m, 0) / month_tot[m])}
                        for m in month_tot.index],
            "pop_stats": {"min": q[0], "q1": q[1], "median": q[2], "q3": q[3], "max": q[4],
                          "median_daily": float((c["pop"] / c["n_days"]).median())},
        })
    suggested = suggest_names(mean_shares, overall, bins, daytypes)
    for c in clusters:
        c["suggested_name"] = suggested[c["id"]]
        c["name"] = suggested[c["id"]]

    comp = []
    for f in cfg.facilities:
        fk = kept[kept["facl_id"] == f]
        counts = {str(cid): int((fk["cluster"] == cid).sum()) for cid in range(k)}
        tot = len(fk)
        ptot = float(fk["pop"].sum())
        comp.append({
            "id": f, "name": ds.id_to_name[f], "units": tot, "counts": counts,
            "shares": {cid: (n / tot if tot else None) for cid, n in counts.items()},
            "pop_weighted_shares": {str(cid): (float(fk.loc[fk["cluster"] == cid, "pop"].sum()) / ptot if ptot else None)
                                    for cid in range(k)},
        })

    def _timeline(col: str, fmt) -> list[dict]:
        out = []
        for key, g in kept.groupby(col):
            cnt = g.groupby("cluster").size()
            out.append({**fmt(key), "counts": {str(c): int(cnt.get(c, 0)) for c in range(k)},
                        "shares": {str(c): float(cnt.get(c, 0) / len(g)) for c in range(k)}})
        return out

    def _unit_rows(df: pd.DataFrame, extra: list[str]) -> list[dict]:
        out = []
        for row in df.itertuples(index=False):
            d = {"facility_id": row.facl_id, "unit_key": row.unit_key,
                 "period_start": row.period_start.strftime("%Y-%m-%d"), "period_end": row.period_end.strftime("%Y-%m-%d"),
                 "day_type": row.day_type, "n_days": int(row.n_days), "pop": float(row.pop),
                 "observed_ratio": float(row.observed_ratio), "missing_days": int(row.missing_days)}
            for e in extra:
                v = getattr(row, e)
                d[e] = int(v) if e == "cluster" else (None if pd.isna(v) else v)
            out.append(d)
        return out

    assignments = _unit_rows(kept, ["cluster"])
    for a, row in zip(assignments, kept[bin_cols].itertuples(index=False)):
        a["shares"] = {b.key: float(v) for b, v in zip(bins, row)}
    excl_by_reason = excluded["exclude_reason"].value_counts()
    by_fac = []
    for f in cfg.facilities:
        tot = int((units["facl_id"] == f).sum())
        ex = int(((units["facl_id"] == f) & units["exclude_reason"].notna()).sum())
        by_fac.append({"id": f, "name": ds.id_to_name[f], "total": tot, "kept": tot - ex, "excluded": ex,
                       "excluded_ratio": ex / tot if tot else None})

    cal = build_calendar(pd.date_range(cfg.start, cfg.end), cfg.holiday_as_weekend)
    return {
        "stage": 1,
        "config": cfg.model_dump(mode="json"),
        "data_fingerprint": ds.fingerprint,
        "holiday_source": HOLIDAY_SOURCE,
        "target_label": TARGET_LABEL,
        "unit_label": UNIT_LABELS[cfg.unit],
        "holidays_applied": [{"date": d.strftime("%Y-%m-%d"), "name": n, "real_weekend": bool(w)} for d, n, w in
                             cal.loc[cal["is_holiday"], ["date", "holiday_name", "is_weekend"]].itertuples(index=False)],
        "time_bins": [{"key": b.key, "label": b.label, "start": b.start, "end": b.end, "range": b.range_label,
                       "excluded": b.key in cfg.excluded_bins} for b in cfg.time_bins],
        "features": {"used": [{"key": c, "label": l, "kind": kd} for c, l, kd in used], "dropped": dropped},
        "scaler": {"mean": dict(zip(cols, map(float, scaler.mean_))), "scale": dict(zip(cols, map(float, scaler.scale_)))},
        "units": {
            "total": int(len(units)), "kept": int(len(kept)), "excluded": int(len(excluded)),
            "excluded_by_reason": {r: int(excl_by_reason.get(r, 0)) for r in ("zero_pop", "min_pop", "low_observed")},
            "low_completeness_kept": int((kept["missing_days"] > 0).sum()),
            "by_facility": by_fac,
        },
        "evaluation": evals,
        "selection": sel,
        "overall_mean_shares": overall,
        "clusters": clusters,
        "facility_composition": comp,
        "timeline": {
            "monthly": _timeline("ym", lambda m: {"ym": int(m)}),
            "weekly": [] if cfg.unit == "dow" else _timeline("week_start", lambda w: {"week_start": w.strftime("%Y-%m-%d")}),
        },
        "assignments": assignments,
        "excluded_units": _unit_rows(excluded, ["exclude_reason"]),
    }


def facility_view(result: dict, facility_id: str) -> dict | None:
    comp = next((c for c in result["facility_composition"] if c["id"] == facility_id), None)
    if comp is None:
        return None
    rows = [a for a in result["assignments"] if a["facility_id"] == facility_id]
    k = len(result["clusters"])
    monthly = {}
    for a in rows:
        ym = int(a["period_start"][:4]) * 100 + int(a["period_start"][5:7])
        monthly.setdefault(ym, [0] * k)[a["cluster"]] += 1
    return {
        "id": facility_id, "name": comp["name"], "composition": comp,
        "excluded": [e for e in result["excluded_units"] if e["facility_id"] == facility_id],
        "monthly": [{"ym": ym, "counts": {str(i): n for i, n in enumerate(v)},
                     "shares": {str(i): n / sum(v) for i, n in enumerate(v)}} for ym, v in sorted(monthly.items())],
    }
