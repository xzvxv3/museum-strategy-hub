"""Stage 2: Ward hierarchical clustering of facilities (similar-museum groups).

One feature vector per facility built over the parent stage-1 run's scope:
visit-pattern cluster shares (from stage 1), weekend / evening / dawn shares,
seasonal CV, female / 30대 shares and cross-visit metrics (cross data only).
"""
from __future__ import annotations

from typing import Literal, Optional

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

from .data import (TARGET_LABEL, AnalysisFilter, Dataset, TimeBin, build_calendar, cross_metrics, filter_hourly,
                   monthly_daily_avg)

MIN_FACILITIES = 3
MIN_SEASON_MONTHS = 3
HIGH_CORR = 0.8
ZERO_VAR = 1e-12
NAME_Z = 0.5

FEATURE_GROUPS = {
    "pattern_share": "pattern",
    "weekend_share": "time", "evening_share": "time", "dawn_share": "time",
    "seasonal_cv": "season",
    "female_share": "demographic", "age30_share": "demographic",
    "cross_total_pct": "cross", "cross_entropy": "cross", "n_partners": "cross",
}
FEATURE_LABELS = {
    "weekend_share": "주말 감지 비중", "evening_share": "저녁 감지 비중", "dawn_share": "새벽 감지 비중",
    "seasonal_cv": "계절 변동(월 일평균 CV)", "female_share": "여성 비중", "age30_share": "30대 비중",
    "cross_total_pct": "교차감지 총량 백분위", "cross_entropy": "교차방문 연결 다양성", "n_partners": "연결 시설 수",
}
GROUP_LABELS = {"pattern": "방문 패턴", "time": "시간·요일", "season": "계절", "demographic": "성별·연령", "cross": "교차방문"}
# Descriptive words for group naming: (feature, direction) -> phrase
NAME_PHRASES = {
    ("weekend_share", 1): "주말 활성형", ("weekend_share", -1): "평일 중심형",
    ("evening_share", 1): "저녁 활성형", ("evening_share", -1): "주간 중심형",
    ("dawn_share", 1): "새벽 감지 높은", ("seasonal_cv", 1): "계절 변동형", ("seasonal_cv", -1): "연중 안정형",
    ("female_share", 1): "여성 비중 높은", ("female_share", -1): "남성 비중 높은",
    ("age30_share", 1): "30대 비중 높은", ("age30_share", -1): "20대 비중 높은",
    ("cross_total_pct", 1): "교차방문 연결형", ("cross_total_pct", -1): "교차방문 낮은",
    ("cross_entropy", 1): "연결 분산형", ("cross_entropy", -1): "연결 집중형",
    ("n_partners", 1): "연결 시설 많은", ("n_partners", -1): "연결 시설 적은",
}


class Stage2Config(BaseModel):
    stage1_run_id: Optional[str] = None
    facilities: Optional[list[str]] = None
    features: dict[str, bool] = Field(default_factory=lambda: {
        "pattern_share": True, "weekend_share": True, "evening_share": True, "dawn_share": True,
        "seasonal_cv": True, "female_share": True, "age30_share": True,
        "cross_total_pct": True, "cross_entropy": True, "n_partners": False})
    pattern_weighting: Literal["count", "pop"] = "count"
    group_weights: dict[str, float] = Field(default_factory=lambda: {g: 1.0 for g in GROUP_LABELS})
    k: Optional[int] = Field(default=None, ge=2, le=10)
    k_min: int = Field(default=2, ge=2, le=10)
    k_max: int = Field(default=6, ge=2, le=10)

    def check(self) -> None:
        unknown = [f for f in self.features if f not in FEATURE_GROUPS]
        if unknown:
            raise ValueError(f"알 수 없는 특징: {unknown}")
        bad = [g for g in self.group_weights if g not in GROUP_LABELS]
        if bad:
            raise ValueError(f"알 수 없는 특징 그룹: {bad}")
        if any(w < 0 for w in self.group_weights.values()):
            raise ValueError("그룹 가중치는 0 이상이어야 합니다.")
        if self.k_min > self.k_max:
            raise ValueError("그룹 수 후보 최솟값이 최댓값보다 큽니다.")
        if not any(self.features.values()):
            raise ValueError("하나 이상의 특징을 선택해 주세요.")


# ---------------------------------------------------------------- features

def facility_features(ds: Dataset, s1: dict, facilities: list[str], pattern_weighting: str) -> tuple[pd.DataFrame, dict]:
    """Raw facility × feature table (all candidate features) + metadata about availability."""
    c1 = s1["config"]
    f = AnalysisFilter(start=c1["start"], end=c1["end"], facilities=facilities, sexes=c1["sexes"],
                       ages=c1["ages"], holiday_as_weekend=c1["holiday_as_weekend"])
    r = f.resolved(ds)
    h = filter_hourly(ds, r)
    cal = build_calendar(pd.date_range(r.start, r.end), r.holiday_as_weekend)
    h = h.merge(cal[["date", "day_type"]], on="date", how="left")
    bins = {b["key"]: TimeBin(**{k: b[k] for k in ("key", "label", "start", "end")}) for b in s1["time_bins"]}
    excluded_bins = set(c1["excluded_bins"])
    notes: dict[str, str] = {}

    df = pd.DataFrame({"id": facilities, "name": [ds.id_to_name[i] for i in facilities]}).set_index("id")
    tot = h.groupby("facl_id")["pop"].sum().reindex(facilities, fill_value=0.0)
    df["total_pop"] = tot

    # A. pattern cluster shares
    comp = {c["id"]: c for c in s1["facility_composition"]}
    names = {c["id"]: c["suggested_name"] for c in s1["clusters"]}
    key = "shares" if pattern_weighting == "count" else "pop_weighted_shares"
    for cid in sorted(names):
        df[f"pattern_c{cid}"] = [comp[i][key].get(str(cid)) if i in comp and comp[i]["units"] else np.nan for i in facilities]

    # B. weekend share (current holiday rule)
    we = h[h["day_type"] == "weekend"].groupby("facl_id")["pop"].sum().reindex(facilities, fill_value=0.0)
    df["weekend_share"] = we / tot.replace(0, np.nan)
    # C/D. evening & dawn share from the run's bins
    for feat, bkey in (("evening_share", "evening"), ("dawn_share", "dawn")):
        b = bins.get(bkey)
        if b is None or bkey in excluded_bins:
            df[feat] = np.nan
            notes[feat] = f"1단계 실행에서 '{bkey}' 구간이 없거나 제외되어 계산할 수 없습니다."
        else:
            p = h[h["hour"].between(b.start, b.end)].groupby("facl_id")["pop"].sum().reindex(facilities, fill_value=0.0)
            df[feat] = p / tot.replace(0, np.nan)
    # E. seasonal CV of monthly daily average over observed days (partial months and
    # suspected-missing days do not count as zero)
    if h["ym"].nunique() >= MIN_SEASON_MONTHS:
        daily = monthly_daily_avg(h, facilities)
        cv = daily.std(axis=1, ddof=0) / daily.mean(axis=1).replace(0, np.nan)
        df["seasonal_cv"] = cv.where(daily.notna().sum(axis=1) >= MIN_SEASON_MONTHS)
    else:
        df["seasonal_cv"] = np.nan
        notes["seasonal_cv"] = f"분석 기간의 월 수가 {MIN_SEASON_MONTHS}개 미만이라 계절 변동을 계산할 수 없습니다."
    # F/G. demographic shares
    fem = h[h["sex"] == "F"].groupby("facl_id")["pop"].sum().reindex(facilities, fill_value=0.0)
    a30 = h[h["age"] == "30대"].groupby("facl_id")["pop"].sum().reindex(facilities, fill_value=0.0)
    df["female_share"] = fem / tot.replace(0, np.nan)
    df["age30_share"] = a30 / tot.replace(0, np.nan)
    # H/I/J. cross metrics (cross data only, full months)
    cm = cross_metrics(ds, r)
    t = cm["table"].set_index("id")
    df["cross_total_pct"] = t["pct_rank"].reindex(facilities)
    df["cross_entropy"] = t["entropy"].reindex(facilities)
    df["n_partners"] = t["n_partners"].reindex(facilities)
    df["cross_total"] = t["cross_total"].reindex(facilities)
    if not cm["available"]:
        for k in ("cross_total_pct", "cross_entropy", "n_partners"):
            notes[k] = cm["reason"]
    meta = {"cross": {"available": cm["available"], "months_used": cm["months_used"], "reason": cm["reason"]},
            "notes": notes, "pattern_names": names}
    return df, meta


def _feature_list(cfg: Stage2Config, df: pd.DataFrame, meta: dict) -> tuple[list[dict], list[dict]]:
    used, dropped = [], []
    for feat, on in cfg.features.items():
        group = FEATURE_GROUPS[feat]
        if not on:
            continue
        if cfg.group_weights.get(group, 1.0) == 0:
            dropped.append({"key": feat, "label": FEATURE_LABELS.get(feat, "방문 패턴 군집 비중"), "reason": "그룹 가중치 0"})
            continue
        cols = [c for c in df.columns if c.startswith("pattern_c")] if feat == "pattern_share" else [feat]
        for c in cols:
            label = f"패턴: {meta['pattern_names'][int(c[9:])]}" if feat == "pattern_share" else FEATURE_LABELS[feat]
            if df[c].isna().any():
                dropped.append({"key": c, "label": label, "reason": meta["notes"].get(feat, "일부 시설에서 값을 계산할 수 없음")})
            elif float(df[c].std(ddof=0)) <= ZERO_VAR:
                dropped.append({"key": c, "label": label, "reason": "분산 0(모든 시설에서 값이 같음)"})
            else:
                used.append({"key": c, "label": label, "group": group, "source": feat})
    return used, dropped


def _matrix(df: pd.DataFrame, used: list[dict], weights: dict[str, float]) -> tuple[np.ndarray, StandardScaler]:
    raw = df[[u["key"] for u in used]].to_numpy(dtype=float)
    sc = StandardScaler().fit(raw)
    w = np.array([weights.get(u["group"], 1.0) for u in used])
    return sc.transform(raw) * w, sc


def _relabel(labels: np.ndarray, ids: list[str]) -> np.ndarray:
    groups = np.unique(labels)
    order = sorted(groups, key=lambda g: (-(labels == g).sum(), min(i for i, l in zip(ids, labels) if l == g)))
    m = {old: new for new, old in enumerate(order)}
    return np.array([m[x] for x in labels])


def _ward(X: np.ndarray, k: int) -> np.ndarray:
    return AgglomerativeClustering(n_clusters=k, linkage="ward").fit_predict(X)


def _loo_stability(X: np.ndarray, labels: np.ndarray, k: int) -> float | None:
    n = len(X)
    if n - 1 <= k:
        return None
    # Leave-one-facility-out on the same standardized space: does removing a single
    # facility reshuffle the remaining partition?
    aris = []
    for i in range(n):
        keep = np.arange(n) != i
        aris.append(adjusted_rand_score(labels[keep], _ward(X[keep], k)))
    return float(np.mean(aris))


def suggest_group_names(groups: list[dict], used: list[dict], pattern_names: dict[int, str]) -> dict[int, str]:
    out = {}
    for g in groups:
        phrases = []
        for d in g["distinctive"]:
            if abs(d["z"]) < NAME_Z:
                continue
            src = next(u["source"] for u in used if u["key"] == d["key"])
            if src == "pattern_share":
                if d["z"] > 0:
                    phrases.append(f"{pattern_names[int(d['key'][9:])]} 중심")
                continue
            p = NAME_PHRASES.get((src, 1 if d["z"] > 0 else -1))
            if p and p not in phrases:
                phrases.append(p)
            if len(phrases) == 2:
                break
        out[g["id"]] = (" · ".join(phrases) + " 시설군") if phrases else "평균적 특성 시설군"
    seen: dict[str, int] = {}
    for gid in sorted(out):
        if out[gid] in seen:
            out[gid] = f"{out[gid]} {gid + 1}"
        seen[out[gid]] = gid
    return out


def run_stage2(ds: Dataset, s1: dict, cfg: Stage2Config) -> dict:
    cfg.check()
    s1_facilities = s1["config"]["facilities"]
    facilities = sorted(cfg.facilities) if cfg.facilities else list(s1_facilities)
    unknown = [f for f in facilities if f not in ds.id_to_name]
    if unknown:
        raise ValueError(f"알 수 없는 시설: {unknown}")
    df_all, meta = facility_features(ds, s1, facilities, cfg.pattern_weighting)

    excluded = []
    pattern_cols = [c for c in df_all.columns if c.startswith("pattern_c")]
    for fid in facilities:
        row = df_all.loc[fid]
        if row["total_pop"] <= 0:
            excluded.append({"id": fid, "name": row["name"], "reason": "분석 기간 감지 인구 0"})
        elif cfg.features.get("pattern_share") and row[pattern_cols].isna().any():
            excluded.append({"id": fid, "name": row["name"],
                             "reason": "1단계 군집분석에 포함된 분석 단위가 없음(학습 범위 밖이거나 모두 제외됨)"})
    ex_ids = {e["id"] for e in excluded}
    df = df_all.drop(index=list(ex_ids))
    ids = list(df.index)
    n = len(ids)
    if n < MIN_FACILITIES:
        raise ValueError(f"계층 군집에 필요한 시설이 부족합니다(사용 가능 {n}개, 최소 {MIN_FACILITIES}개).")

    used, dropped = _feature_list(cfg, df, meta)
    if len(used) < 2:
        raise ValueError("사용 가능한 특징이 2개 미만입니다. 특징 선택을 확인해 주세요.")
    X, scaler = _matrix(df, used, cfg.group_weights)
    cols = [u["key"] for u in used]

    k_hi = min(cfg.k_max if cfg.k is None else max(cfg.k, cfg.k_max), n - 1)
    k_lo = min(cfg.k_min if cfg.k is None else min(cfg.k, cfg.k_min), k_hi)
    if cfg.k is not None and cfg.k > n - 1:
        raise ValueError(f"그룹 수 {cfg.k}는 시설 수({n})보다 작아야 합니다.")

    Z = linkage(X, method="ward")
    evals, labels_by_k = [], {}
    for k in range(k_lo, k_hi + 1):
        lab = _relabel(_ward(X, k), ids)
        scipy_lab = fcluster(Z, t=k, criterion="maxclust")
        if adjusted_rand_score(lab, scipy_lab) < 1 - 1e-9:
            raise RuntimeError("scikit-learn Ward와 SciPy linkage 분할이 일치하지 않습니다.")
        sizes = np.bincount(lab, minlength=k)
        evals.append({
            "k": k,
            "silhouette": float(silhouette_score(X, lab)),
            "sizes": [int(s) for s in sizes],
            "singletons": int((sizes == 1).sum()),
            "stability_ari_mean": _loo_stability(X, lab, k),
        })
        labels_by_k[str(k)] = {i: int(l) for i, l in zip(ids, lab)}

    if cfg.k is not None:
        k = cfg.k
        mode, reason = "manual", f"사용자가 그룹 수 {k}를 직접 지정했습니다."
    else:
        best = max(evals, key=lambda e: (e["silhouette"], -e["k"]))
        k, mode = best["k"], "auto"
        reason = f"그룹 수 {k}: 실루엣 {best['silhouette']:.3f}로 후보 {k_lo}~{k_hi} 중 가장 높습니다."
    ev = next(e for e in evals if e["k"] == k)
    warnings = []
    if ev["singletons"]:
        single = [ds.id_to_name[i] for i, g in labels_by_k[str(k)].items() if ev["sizes"][g] == 1]
        warnings.append(f"단일 시설 그룹 {ev['singletons']}개: {', '.join(single)}")
    if min(ev["sizes"]) == 2:
        warnings.append("시설 2개로 이루어진 매우 작은 그룹이 있습니다.")
    warnings.append(f"분석 대상이 {n}개 시설뿐이므로 그룹은 절대적인 시설 분류 기준이 아닙니다.")
    labels = np.array([labels_by_k[str(k)][i] for i in ids])

    # Group summaries
    zdf = pd.DataFrame(X, index=ids, columns=cols)
    groups = []
    for g in range(k):
        mem = [i for i, l in zip(ids, labels) if l == g]
        mean_raw = {c: float(df.loc[mem, c].mean()) for c in cols}
        mean_z = {c: float(zdf.loc[mem, c].mean()) for c in cols}
        dist = sorted(({"key": c, "label": next(u["label"] for u in used if u["key"] == c), "z": mean_z[c],
                        "direction": "높음" if mean_z[c] > 0 else "낮음"} for c in cols), key=lambda d: -abs(d["z"]))
        pshare = {c: float(df.loc[mem, c].mean()) for c in pattern_cols if c in df}
        dom = max(pshare, key=pshare.get) if pshare else None
        groups.append({
            "id": g, "size": len(mem), "members": [{"id": i, "name": ds.id_to_name[i]} for i in mem],
            "mean_raw": mean_raw, "mean_z": mean_z, "distinctive": dist[:4],
            "dominant_pattern": {"cluster": int(dom[9:]), "name": meta["pattern_names"][int(dom[9:])],
                                 "share": pshare[dom]} if dom else None,
        })
    names = suggest_group_names(groups, used, meta["pattern_names"])
    for g in groups:
        g["suggested_name"] = names[g["id"]]
        g["name"] = names[g["id"]]

    # Similar facilities (distance in the weighted standardized space)
    D = np.sqrt(((X[:, None, :] - X[None, :, :]) ** 2).sum(-1))
    similar = {}
    for a, ia in enumerate(ids):
        order = [b for b in np.argsort(D[a]) if b != a][:5]
        similar[ia] = [{"id": ids[b], "name": ds.id_to_name[ids[b]], "distance": float(D[a, b]),
                        "same_group": bool(labels[a] == labels[b])} for b in order]

    # Sensitivity: drop one feature group / balance groups / alternative pattern weighting
    sens = []
    for grp in sorted({u["group"] for u in used}):
        rest = [u for u in used if u["group"] != grp]
        if len(rest) >= 2 and n - 1 >= k:
            Xr, _ = _matrix(df, rest, cfg.group_weights)
            sens.append({"variant": f"drop_{grp}", "label": f"'{GROUP_LABELS[grp]}' 특징 제외",
                         "ari_vs_base": float(adjusted_rand_score(labels, _ward(Xr, k)))})
    counts = pd.Series([u["group"] for u in used]).value_counts()
    bal = {g: cfg.group_weights.get(g, 1.0) / np.sqrt(counts[g]) for g in counts.index}
    Xb, _ = _matrix(df, used, bal)
    sens.append({"variant": "balanced_groups", "label": "특징 그룹별 영향 균등화(가중치 1/√특징 수)",
                 "ari_vs_base": float(adjusted_rand_score(labels, _ward(Xb, k)))})
    if cfg.features.get("pattern_share"):
        alt = "pop" if cfg.pattern_weighting == "count" else "count"
        df_alt, _ = facility_features(ds, s1, ids, alt)
        if not df_alt[[u["key"] for u in used]].isna().any().any():
            Xa, _ = _matrix(df_alt, used, cfg.group_weights)
            sens.append({"variant": f"pattern_{alt}", "label": "패턴 비중을 " + ("감지량 가중" if alt == "pop" else "단위 수") + " 기준으로 계산",
                         "ari_vs_base": float(adjusted_rand_score(labels, _ward(Xa, k)))})

    corr = pd.DataFrame(df[cols].to_numpy(dtype=float), columns=cols).corr()
    high = [{"a": a, "b": b, "r": float(corr.loc[a, b])} for i, a in enumerate(cols) for b in cols[i + 1:]
            if abs(corr.loc[a, b]) >= HIGH_CORR]

    dn = dendrogram(Z, no_plot=True, labels=ids)
    merges = Z[:, 2]
    cut = {}
    for kk in range(k_lo, k_hi + 1):
        hi_h = merges[-(kk - 1)]
        lo_h = merges[-kk] if kk < len(merges) + 1 else 0.0
        cut[str(kk)] = float((hi_h + lo_h) / 2)

    all_cols = [c for c in df_all.columns if c != "name"]
    return {
        "stage": 2,
        "parent_run_id": s1.get("run_id"),
        "config": cfg.model_dump(mode="json"),
        "scope": {k: s1["config"][k] for k in ("start", "end", "sexes", "ages", "holiday_as_weekend")},
        "target_label": TARGET_LABEL,
        "data_fingerprint": ds.fingerprint,
        "facilities_used": ids,
        "facilities_excluded": excluded,
        "pattern_names": {str(k): v for k, v in meta["pattern_names"].items()},
        "cross": meta["cross"],
        "features": {"used": used, "dropped": dropped,
                     "groups": {g: GROUP_LABELS[g] for g in sorted({u["group"] for u in used})}},
        "feature_table": [
            {"id": i, "name": ds.id_to_name[i],
             "raw": {c: (None if pd.isna(df_all.loc[i, c]) else float(df_all.loc[i, c])) for c in all_cols},
             "scaled": ({c: float(zdf.loc[i, c]) for c in cols} if i in zdf.index else None)}
            for i in facilities
        ],
        "scaler": {"mean": dict(zip(cols, map(float, scaler.mean_))), "scale": dict(zip(cols, map(float, scaler.scale_))),
                   "group_weights": cfg.group_weights},
        "correlations": {"high_pairs": high, "threshold": HIGH_CORR},
        "evaluation": evals,
        "selection": {"k": k, "mode": mode, "rule": "실루엣 점수가 가장 높은 그룹 수(동률이면 작은 수). 단일·소규모 그룹은 경고로 표시.",
                      "reason": reason, "warnings": warnings},
        "groups": groups,
        "assignments": {i: int(l) for i, l in zip(ids, labels)},
        "labels_by_k": labels_by_k,
        "dendrogram": {"icoord": dn["icoord"], "dcoord": dn["dcoord"], "leaves": dn["ivl"],
                       "leaf_labels": [ds.id_to_name[i] for i in dn["ivl"]], "cut_heights": cut,
                       "max_height": float(merges.max())},
        "similar": similar,
        "sensitivity": sens,
    }


def facility_view(result: dict, facility_id: str) -> dict:
    if facility_id not in result["assignments"]:
        ex = next((e for e in result["facilities_excluded"] if e["id"] == facility_id), None)
        return {"facility": {"id": facility_id}, "group": None,
                "reason": ex["reason"] if ex else "이 실행의 분석 대상 시설이 아닙니다."}
    gid = result["assignments"][facility_id]
    group = next(g for g in result["groups"] if g["id"] == gid)
    ft = {r["id"]: r for r in result["feature_table"]}
    me = ft[facility_id]["raw"]
    used = result["features"]["used"]
    members = [m["id"] for m in group["members"]]
    others = [i for i in result["facilities_used"] if i not in members]

    def diffs(ref_ids: list[str]) -> list[dict]:
        out = []
        for u in used:
            vals = [ft[i]["raw"][u["key"]] for i in ref_ids if ft[i]["raw"][u["key"]] is not None]
            ref = float(np.mean(vals)) if vals else None
            out.append({"key": u["key"], "label": u["label"], "group": u["group"], "value": me[u["key"]],
                        "reference": ref, "diff": (me[u["key"]] - ref) if ref is not None else None})
        return out

    peers = [m for m in members if m != facility_id]
    return {
        "facility": {"id": facility_id, "name": ft[facility_id]["name"]},
        "group": group,
        "peers": [{"id": p, "name": ft[p]["name"]} for p in peers],
        "similar": result["similar"][facility_id],
        "diff_vs_group": diffs(peers) if peers else [],
        "diff_vs_others": diffs(others) if others else [],
    }
