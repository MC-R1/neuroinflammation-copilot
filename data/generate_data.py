#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_data.py - Synthetic longitudinal MS cohort generator for the
NeuroInflammation Copilot prototype (Digital Neuro Hub 2026 hackathon).

DESIGN PRINCIPLES
-----------------
* 100% SYNTHETIC data. No real patients. Educational prototype, NOT for clinical use.
* Fully reproducible: fixed seed, no system clock (anchor date is hardcoded).
* Standard library only (random, csv, json, datetime, math) -> runs anywhere, no install.
* Clinically *intentional*: each patient is an explicit archetype with a controlled
  trajectory, then small seeded noise is added. Random-only data would look implausible
  to a clinical jury, so trajectories are authored, not sampled blindly.

OUTPUTS
-------
* /data/*.csv          -> long-format tables, R/Quarto friendly
* /data/dataset.json   -> nested per-patient structure consumed by the web app
* /data/data_dictionary.md
* /app/data.js         -> `window.MS_DATA = {...}` (same dataset embedded for offline use)

Run:  python3 data/generate_data.py
"""

import csv
import json
import math
import os
import random
from datetime import date, timedelta

# --------------------------------------------------------------------------------------
# Reproducibility & global config
# --------------------------------------------------------------------------------------
SEED = 20260611                      # DNH 2026 hackathon date, fixed for reproducibility
ANCHOR = date(2026, 6, 10)           # "today" in the demo (no system clock is used)
RNG = random.Random(SEED)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP_DIR = os.path.join(ROOT, "app")

DISCLAIMER = ("Dati 100% sintetici a scopo dimostrativo. Prototipo NON destinato all'uso "
              "clinico. Strumento di supporto decisionale: la decisione resta sempre al clinico.")

# --------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------
def d(days_ago):
    """Date `days_ago` days before the anchor."""
    return ANCHOR - timedelta(days=days_ago)


def iso(dt):
    return dt.isoformat()


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def round_edss(x):
    """EDSS lives on a 0..10 grid with 0.5 steps."""
    return clamp(round(x * 2) / 2.0, 0.0, 10.0)


def jitter(sd):
    return RNG.gauss(0, sd)


def lin(a, b, n):
    """n linearly spaced values from a to b (inclusive)."""
    if n == 1:
        return [float(b)]
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def late_ramp(a, b, n, knee=0.5):
    """Flat at `a` for the first `knee` fraction of points, then ramp to `b`.
    Models 'recent deterioration': stable for a while, then a clear late trend."""
    out = []
    knee_idx = int(round((n - 1) * knee))
    for i in range(n):
        if i <= knee_idx:
            out.append(float(a))
        else:
            frac = (i - knee_idx) / max(1, (n - 1 - knee_idx))
            out.append(a + (b - a) * frac)
    return out


def add_noise(series, sd, lo=None, hi=None, rounder=None):
    out = []
    for v in series:
        v = v + jitter(sd)
        if lo is not None or hi is not None:
            v = clamp(v, lo if lo is not None else -1e9, hi if hi is not None else 1e9)
        if rounder is not None:
            v = rounder(v)
        out.append(v)
    return out


# Age-adjusted reference (upper) limits - simplified, plausible, transparent.
def nfl_url(age):
    """Age-adjusted upper reference limit for serum NfL (pg/mL), simplified."""
    return round(7.0 + 0.11 * max(0, age - 20), 1)   # ~7 @20y, ~9.2 @40y, ~12.5 @70y


def gfap_url(age):
    """Age-adjusted upper reference limit for serum GFAP (pg/mL), simplified."""
    return round(85.0 + 1.6 * max(0, age - 20), 0)   # ~85 @20y, ~117 @40y, ~165 @70y


# --------------------------------------------------------------------------------------
# Digital biomarker catalog (wearable / sensor-derived), grouped by domain.
# Source: user-provided study biomarker catalog. We preserve the clinical nuances:
#  - `device`   : measuring device per domain
#  - `evidence` : "evidence" = cited evidence in MS for that domain; "rationale" = MS-relevant
#                 rationale only, NOT tested/validated (see Note 5). Shown transparently in the UI.
#  - per-metric `prop=True` marks proprietary, non-interoperable composite scores (Note 2).
#  - `sev` maps the domain to a per-patient severity (0..1) derived from the clinical archetype,
#    so digital biomarkers move CONSISTENTLY with each patient's story (multimodal corroboration).
# Each metric: key, label, unit, base (healthy value), span (shift at severity=1),
#              worse_up (True if higher=worse), dec (decimals).
DBIO_DOMAINS = [
    dict(key="gait", label="Cammino reale (gait DMO)",
         device="IMU lombare · Axivity AX6 / MobGap", evidence="evidence", sev="gait", metrics=[
             dict(key="walking_speed", label="Velocità del cammino", unit="m/s", base=1.30, span=0.34, worse_up=False, dec=2),
             dict(key="cadence", label="Cadenza", unit="passi/min", base=112, span=16, worse_up=False, dec=0),
             dict(key="stride_length", label="Lunghezza del passo", unit="m", base=1.38, span=0.26, worse_up=False, dec=2),
             dict(key="stride_duration", label="Durata del passo", unit="s", base=1.04, span=0.16, worse_up=True, dec=2),
             dict(key="walking_bouts", label="Episodi di cammino", unit="n/die", base=92, span=34, worse_up=False, dec=0),
             dict(key="bout_duration", label="Durata episodio", unit="s", base=44, span=14, worse_up=False, dec=0),
             dict(key="turns", label="Numero di giri (turns)", unit="n/die", base=190, span=70, worse_up=False, dec=0),
         ]),
    dict(key="keystroke", label="Digitazione (keystroke dynamics)",
         device="Tastiera smartphone · Neurokeys / Neurocast", evidence="evidence", sev="keystroke", metrics=[
             dict(key="hold_time", label="Hold time (HT)", unit="ms", base=96, span=42, worse_up=True, dec=0),
             dict(key="flight_time", label="Flight time (FT)", unit="ms", base=118, span=55, worse_up=True, dec=0),
             dict(key="ppl", label="Latenza press-press (PPL)", unit="ms", base=258, span=95, worse_up=True, dec=0),
             dict(key="rrl", label="Latenza release-release (RRL)", unit="ms", base=262, span=95, worse_up=True, dec=0),
             dict(key="pre_cs", label="Rallentamento pre-correzione", unit="ms", base=380, span=140, worse_up=True, dec=0),
             dict(key="correction_dur", label="Durata correzione (backspace)", unit="ms", base=520, span=180, worse_up=True, dec=0),
             dict(key="post_cs", label="Rallentamento post-correzione", unit="ms", base=360, span=130, worse_up=True, dec=0),
             dict(key="pre_space_pause", label="Pausa pre-spazio", unit="ms", base=205, span=85, worse_up=True, dec=0),
             dict(key="post_space_pause", label="Pausa post-spazio", unit="ms", base=195, span=80, worse_up=True, dec=0),
             dict(key="after_punct_pause", label="Pausa dopo punteggiatura", unit="ms", base=330, span=150, worse_up=True, dec=0),
             dict(key="prop_long_words", label="Quota parole lunghe (>6)", unit="%", base=19, span=7, worse_up=False, dec=0),
             dict(key="word_len_var", label="Variabilità lunghezza parole", unit="SD", base=2.5, span=0.8, worse_up=False, dec=1),
         ]),
    dict(key="cardiac", label="Cuore & sistema autonomo",
         device="Wearable consumer · Fitbit / smartwatch / ring", evidence="rationale", sev="cardio", metrics=[
             dict(key="resting_hr", label="FC a riposo (RHR)", unit="bpm", base=63, span=12, worse_up=True, dec=0),
             dict(key="hr_24h", label="FC media 24h", unit="bpm", base=73, span=10, worse_up=True, dec=0),
             dict(key="hrv_rmssd", label="HRV (RMSSD, notturna)", unit="ms", base=44, span=20, worse_up=False, dec=0),
         ]),
    dict(key="respthermo", label="Respiro & temperatura (notturni)",
         device="Wearable consumer · durante il sonno", evidence="rationale", sev="cardio", metrics=[
             dict(key="breathing_rate", label="Frequenza respiratoria", unit="atti/min", base=15.0, span=2.2, worse_up=True, dec=1),
             dict(key="spo2", label="SpO₂ (notturna media)", unit="%", base=97, span=2.0, worse_up=False, dec=0),
             dict(key="skin_temp_delta", label="Variazione temp. cutanea", unit="°C Δ", base=0.0, span=0.7, worse_up=True, dec=1),
         ]),
    dict(key="sleep", label="Sonno",
         device="Wearable consumer · Fitbit / smartwatch / ring", evidence="rationale", sev="sleep", metrics=[
             dict(key="total_sleep_time", label="Tempo di sonno totale", unit="h", base=7.2, span=1.4, worse_up=False, dec=1),
             dict(key="deep_sleep", label="Sonno profondo", unit="min", base=78, span=30, worse_up=False, dec=0),
             dict(key="rem_sleep", label="Sonno REM", unit="min", base=96, span=32, worse_up=False, dec=0),
             dict(key="awake_time", label="Tempo da sveglia", unit="min", base=34, span=28, worse_up=True, dec=0),
             dict(key="sleep_efficiency", label="Efficienza del sonno", unit="%", base=89, span=12, worse_up=False, dec=0),
             dict(key="sleep_score", label="Sleep Score", unit="/100", base=83, span=22, worse_up=False, dec=0, prop=True),
         ]),
    dict(key="activity", label="Attività fisica",
         device="Wearable consumer · Fitbit / smartwatch / ring", evidence="rationale", sev="activity", metrics=[
             dict(key="steps", label="Passi", unit="n/die", base=7600, span=3600, worse_up=False, dec=0),
             dict(key="azm", label="Active Zone Minutes", unit="min", base=38, span=26, worse_up=False, dec=0),
             dict(key="floors", label="Piani saliti", unit="n", base=12, span=8, worse_up=False, dec=0),
             dict(key="distance", label="Distanza", unit="km", base=5.2, span=2.8, worse_up=False, dec=1),
             dict(key="calories", label="Calorie", unit="kcal", base=2050, span=350, worse_up=False, dec=0),
             dict(key="vo2max", label="Cardio Fitness (VO₂max)", unit="mL/kg/min", base=38, span=9, worse_up=False, dec=0, prop=True),
         ]),
    dict(key="composite", label="Punteggi compositi",
         device="Wearable consumer · indici proprietari", evidence="rationale", sev="composite", metrics=[
             dict(key="stress_score", label="Stress Management Score", unit="/100", base=72, span=26, worse_up=False, dec=0, prop=True),
             dict(key="readiness_score", label="Readiness Score", unit="/100", base=76, span=28, worse_up=False, dec=0, prop=True),
         ]),
]


def dbio_series(m, sev, rng, n=8):
    """Generate a short weekly series for a digital-biomarker metric, moving in the
    'worse' direction by `sev * span` with a late ramp + small noise.
    Uses a DEDICATED `rng` (not the global one) so digital-biomarker generation does not
    perturb the global RNG stream that produces the clinical series (keeps the cohort stable)."""
    direction = 1.0 if m["worse_up"] else -1.0
    end = m["base"] + direction * sev * m["span"]
    raw = late_ramp(m["base"], end, n, knee=0.35)
    sd = abs(m["span"]) * 0.05   # proportional to the metric's range (clean trend)
    dec = m["dec"]
    lo = 0 if m["base"] >= 0 else None
    hi = None
    if m["key"] == "spo2":
        lo, hi = 90, 100
    elif m["unit"] == "%":
        lo, hi = 0, 100
    elif m["key"] in ("sleep_score", "stress_score", "readiness_score"):
        lo, hi = 0, 100
    out = []
    for v in raw:
        v = v + rng.gauss(0, sd)
        if lo is not None:
            v = max(lo, v)
        if hi is not None:
            v = min(hi, v)
        out.append(round(v, dec) if dec else int(round(v)))
    return out


def build_digital_biomarkers(sev_map, weeks_dates, rng):
    """Assemble the full digital-biomarker structure for one patient (dedicated rng)."""
    out = []
    for dom in DBIO_DOMAINS:
        sev = clamp(sev_map.get(dom["sev"], 0.0), 0.0, 1.0)
        metrics = []
        for m in dom["metrics"]:
            vals = dbio_series(m, sev, rng, n=len(weeks_dates))
            series = [dict(date=iso(d), value=v) for d, v in zip(weeks_dates, vals)]
            metrics.append(dict(
                key=m["key"], label=m["label"], unit=m["unit"],
                worse_up=m["worse_up"], proprietary=bool(m.get("prop", False)),
                baseline=series[0]["value"], latest=series[-1]["value"],
                series=series,
            ))
        out.append(dict(
            key=dom["key"], label=dom["label"], device=dom["device"],
            evidence=dom["evidence"], metrics=metrics,
        ))
    return out


# --------------------------------------------------------------------------------------
# Visit schedule
# --------------------------------------------------------------------------------------
def visit_dates(n_visits, last_days_ago=21, interval_days=91):
    """n quarterly visits, oldest -> newest, newest `last_days_ago` before anchor."""
    newest = ANCHOR - timedelta(days=last_days_ago)
    dates = [newest - timedelta(days=interval_days * i) for i in range(n_visits)]
    return list(reversed(dates))   # oldest first


def weekly_dates(span_days, last_days_ago=4):
    newest = ANCHOR - timedelta(days=last_days_ago)
    n = span_days // 7
    dts = [newest - timedelta(days=7 * i) for i in range(n)]
    return list(reversed(dts))


# --------------------------------------------------------------------------------------
# Patient archetype specifications
# --------------------------------------------------------------------------------------
# Each spec is a compact, authored description. The builder turns it into longitudinal data.
# Trajectory direction encoded per measure; events listed explicitly.
#
# DMT classes:
#   'iniettabile'  interferone/glatiramer
#   'orale'        dimetilfumarato/teriflunomide/S1P/cladribina
#   'alta_efficacia' natalizumab/ocrelizumab/ofatumumab/rituximab/alemtuzumab (mAb/infusional)

PATIENTS = [
    # 1) FLAGSHIP -----------------------------------------------------------------------
    dict(
        id="MS-0142", name="Giulia Rossi", sex="F", age=34, ms_type="RRMS",
        disease_years=5, n_visits=11,
        dmt=dict(drug="Dimetilfumarato", klass="orale", months=18),
        dmt_history=[("Interferone beta-1a", "iniettabile", 60, 19, "scarsa tollerabilità")],
        edss=("late_ramp", 2.0, 2.5, 0.72),
        sdmt=("late_ramp", 58, 47, 0.5),       # cognition declining (meaningful)
        mfis=("late_ramp", 27, 52, 0.45),      # fatigue rising past threshold
        phq9=("late_ramp", 5, 11, 0.5),        # mood mildly worsening
        msis29=("late_ramp", 22, 41, 0.5),
        nfl=("late_ramp", 6.0, 16.0, 0.55),    # rising -> activity
        gfap=("flat", 95, 105),                # ~normal: this is activity, NOT progression
        t25fw=("flat", 4.6, 5.0),
        nhpt=("flat", 19, 20),
        relapses=[
            dict(days_ago=2.5 * 365, type="relapse", severity="moderata",
                 trigger="nessuno", recovery="completo", note="Neurite ottica dx, recupero completo"),
            dict(days_ago=22, type="pseudo_relapse_suspected", severity="lieve",
                 trigger="caldo", recovery="completo",
                 note="Peggioramento transitorio in giornata molto calda (fenomeno di Uhthoff), regredito in 36h"),
        ],
        mri=[
            dict(days_ago=2.4 * 365, new_t2=2, enlarging_t2=0, gad=1, prl=0, atrophy="stabile",
                 note="Attività pregressa, poi quiescenza"),
            dict(days_ago=400, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile",
                 note="Quadro stabile"),
            dict(days_ago=34, new_t2=1, enlarging_t2=0, gad=0, prl=0, atrophy="stabile",
                 note="Nuova piccola lesione T2 periventricolare, non captante"),
        ],
        adherence=dict(recent_pct=72, missed_doses_90d=11, refill_gap_days=12, trend="in calo"),
        monitoring=[
            ("RMN encefalo di follow-up", 34, -150, "ok"),
            ("Emocromo + linfociti (DMF)", 120, 25, "in_scadenza"),
            ("Funzione epatica", 120, 25, "in_scadenza"),
        ],
        wearable=dict(steps=("late_ramp", 7200, 4300, 0.5), gait=("late_ramp", 1.28, 1.08, 0.5),
                      sleep=("late_ramp", 7.2, 6.0, 0.5), sleep_eff=("late_ramp", 88, 78, 0.5)),
        note="Caso flagship: attività di malattia + sintomi invisibili in peggioramento + risposta subottimale + aderenza in calo; recente sospetta pseudo-ricaduta da caldo.",
    ),

    # 2) NEDA stable #1 -----------------------------------------------------------------
    dict(
        id="MS-0098", name="Marco Bianchi", sex="M", age=41, ms_type="RRMS",
        disease_years=8, n_visits=11,
        dmt=dict(drug="Ocrelizumab", klass="alta_efficacia", months=30),
        dmt_history=[("Dimetilfumarato", "orale", 96, 31, "attività di malattia")],
        edss=("flat", 1.5, 1.5),
        sdmt=("flat", 60, 61),
        mfis=("flat", 24, 25),
        phq9=("flat", 3, 4),
        msis29=("flat", 16, 17),
        nfl=("flat", 5.0, 5.5),
        gfap=("flat", 90, 95),
        t25fw=("flat", 4.2, 4.3),
        nhpt=("flat", 18, 18),
        relapses=[],
        mri=[
            dict(days_ago=380, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=30, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile, NEDA radiologico"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 30, 335, "ok"),
            ("Immunoglobuline (pre-infusione)", 40, 140, "ok"),
        ],
        wearable=dict(steps=("flat", 9100, 9000), gait=("flat", 1.42, 1.41),
                      sleep=("flat", 7.4, 7.3), sleep_eff=("flat", 90, 90)),
        note="Paziente di controllo: NEDA-3 da 2 anni, alta efficacia, stabile.",
    ),

    # 3) PIRA / smouldering -------------------------------------------------------------
    dict(
        id="MS-0211", name="Anna Verdi", sex="F", age=52, ms_type="RRMS -> SPMS",
        disease_years=17, n_visits=12,
        dmt=dict(drug="Siponimod", klass="orale", months=14),
        dmt_history=[("Interferone beta-1a", "iniettabile", 200, 60, "transizione progressiva"),
                     ("Glatiramer acetato", "iniettabile", 60, 15, "progressione")],
        edss=("steps_up", 3.5, 4.5, 0.4),   # confirmed worsening over time, no relapse
        sdmt=("late_ramp", 48, 39, 0.3),
        mfis=("late_ramp", 40, 58, 0.3),
        phq9=("flat", 8, 10),
        msis29=("late_ramp", 45, 60, 0.3),
        nfl=("flat", 9.0, 10.5),            # near URL, not acute
        gfap=("late_ramp", 150, 235, 0.3),  # elevated & rising -> progression
        t25fw=("late_ramp", 6.5, 9.2, 0.3),
        nhpt=("late_ramp", 24, 30, 0.3),
        relapses=[
            dict(days_ago=4.5 * 365, type="relapse", severity="moderata", trigger="nessuno",
                 recovery="parziale", note="Ultima ricaduta acuta >4 anni fa"),
        ],
        mri=[
            dict(days_ago=420, new_t2=0, enlarging_t2=0, gad=0, prl=3, atrophy="lieve progressione",
                 note="Nessuna nuova lesione; 3 PRL (lesioni croniche attive)"),
            dict(days_ago=40, new_t2=0, enlarging_t2=0, gad=0, prl=3, atrophy="progressione",
                 note="Assenza di attività focale; atrofia in progressione; PRL stabili"),
        ],
        adherence=dict(recent_pct=96, missed_doses_90d=1, refill_gap_days=2, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 40, 325, "ok"),
            ("OCT / valutazione cardiologica (S1P)", 200, -20, "scaduto"),
        ],
        wearable=dict(steps=("late_ramp", 5200, 3400, 0.3), gait=("late_ramp", 1.05, 0.82, 0.3),
                      sleep=("flat", 6.6, 6.4), sleep_eff=("late_ramp", 82, 74, 0.3)),
        note="PIRA/smouldering: peggioramento EDSS confermato senza ricadute né nuove lesioni; GFAP elevato; PRL e atrofia.",
    ),

    # 4) Suboptimal response / switch candidate ----------------------------------------
    dict(
        id="MS-0177", name="Luca Ferrari", sex="M", age=29, ms_type="RRMS",
        disease_years=3, n_visits=10,
        dmt=dict(drug="Teriflunomide", klass="orale", months=16),
        dmt_history=[],
        edss=("late_ramp", 1.5, 2.5, 0.6),
        sdmt=("flat", 55, 53),
        mfis=("late_ramp", 30, 40, 0.5),
        phq9=("flat", 6, 7),
        msis29=("late_ramp", 25, 35, 0.5),
        nfl=("late_ramp", 8.0, 19.0, 0.55),   # elevated -> activity
        gfap=("flat", 95, 100),
        t25fw=("flat", 4.4, 4.6),
        nhpt=("flat", 19, 20),
        relapses=[
            dict(days_ago=120, type="relapse", severity="moderata", trigger="nessuno",
                 recovery="parziale", note="Ricaduta sensitivo-motoria arto inf. dx, recupero parziale"),
        ],
        mri=[
            dict(days_ago=300, new_t2=1, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="1 nuova lesione"),
            dict(days_ago=45, new_t2=2, enlarging_t2=1, gad=2, prl=0, atrophy="stabile",
                 note="2 nuove lesioni T2 + 2 captanti gadolinio: attività radiologica"),
        ],
        adherence=dict(recent_pct=94, missed_doses_90d=2, refill_gap_days=3, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 45, -10, "in_scadenza"),
            ("Funzione epatica (teriflunomide)", 70, 20, "in_scadenza"),
        ],
        wearable=dict(steps=("flat", 8800, 8400), gait=("flat", 1.40, 1.36),
                      sleep=("flat", 7.0, 6.8), sleep_eff=("flat", 86, 85)),
        note="Risposta subottimale: attività clinica e radiologica nonostante >12 mesi sullo stesso DMT a media efficacia -> candidato a switch/escalation.",
    ),

    # 5) Adherence at risk --------------------------------------------------------------
    dict(
        id="MS-0203", name="Sofia Conti", sex="F", age=38, ms_type="RRMS",
        disease_years=6, n_visits=10,
        dmt=dict(drug="Dimetilfumarato", klass="orale", months=22),
        dmt_history=[],
        edss=("flat", 1.5, 2.0),
        sdmt=("flat", 56, 55),
        mfis=("late_ramp", 30, 39, 0.5),
        phq9=("late_ramp", 6, 12, 0.5),
        msis29=("flat", 24, 29),
        nfl=("late_ramp", 6.0, 11.0, 0.6),
        gfap=("flat", 95, 98),
        t25fw=("flat", 4.5, 4.6),
        nhpt=("flat", 19, 19),
        relapses=[],
        mri=[
            dict(days_ago=360, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=60, new_t2=1, enlarging_t2=0, gad=0, prl=0, atrophy="stabile",
                 note="1 nuova piccola lesione T2 (in contesto di scarsa aderenza)"),
        ],
        adherence=dict(recent_pct=58, missed_doses_90d=23, refill_gap_days=34, trend="in calo"),
        monitoring=[
            ("Emocromo + linfociti (DMF)", 200, -25, "scaduto"),
            ("RMN encefalo di follow-up", 60, 300, "ok"),
        ],
        wearable=dict(steps=("flat", 7600, 7300), gait=("flat", 1.34, 1.32),
                      sleep=("late_ramp", 7.0, 6.0, 0.5), sleep_eff=("flat", 84, 80)),
        note="Aderenza a rischio: gap nei rifornimenti e dosi mancate; segnale precoce di attività.",
    ),

    # 6) Monitoring due (natalizumab / PML surveillance) --------------------------------
    dict(
        id="MS-0119", name="Giorgio Marino", sex="M", age=45, ms_type="RRMS",
        disease_years=11, n_visits=11,
        dmt=dict(drug="Natalizumab", klass="alta_efficacia", months=40),
        dmt_history=[("Fingolimod", "orale", 36, 41, "attività di malattia")],
        edss=("flat", 2.0, 2.0),
        sdmt=("flat", 54, 54),
        mfis=("flat", 30, 31),
        phq9=("flat", 5, 5),
        msis29=("flat", 26, 26),
        nfl=("flat", 5.5, 6.0),
        gfap=("flat", 100, 103),
        t25fw=("flat", 4.6, 4.6),
        nhpt=("flat", 20, 20),
        relapses=[],
        mri=[
            dict(days_ago=300, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=210, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("Indice anticorpi anti-JCV", 220, -40, "scaduto"),
            ("RMN encefalo (sorveglianza PML)", 210, -30, "scaduto"),
            ("Emocromo", 30, 60, "ok"),
        ],
        wearable=dict(steps=("flat", 8200, 8100), gait=("flat", 1.38, 1.37),
                      sleep=("flat", 7.1, 7.0), sleep_eff=("flat", 87, 87)),
        note="Malattia ben controllata ma monitoraggio di sicurezza in ritardo: anti-JCV e RMN di sorveglianza PML scaduti.",
    ),

    # 7) NEDA stable #2 -----------------------------------------------------------------
    dict(
        id="MS-0260", name="Elena Greco", sex="F", age=36, ms_type="RRMS",
        disease_years=4, n_visits=10,
        dmt=dict(drug="Ofatumumab", klass="alta_efficacia", months=20),
        dmt_history=[],
        edss=("flat", 1.0, 1.0),
        sdmt=("flat", 62, 63),
        mfis=("flat", 20, 21),
        phq9=("flat", 2, 3),
        msis29=("flat", 12, 12),
        nfl=("flat", 4.5, 4.8),
        gfap=("flat", 88, 90),
        t25fw=("flat", 4.0, 4.0),
        nhpt=("flat", 17, 17),
        relapses=[],
        mri=[
            dict(days_ago=340, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=25, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="NEDA radiologico"),
        ],
        adherence=dict(recent_pct=98, missed_doses_90d=1, refill_gap_days=1, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 25, 340, "ok"),
            ("Immunoglobuline", 50, 130, "ok"),
        ],
        wearable=dict(steps=("flat", 10200, 10100), gait=("flat", 1.45, 1.45),
                      sleep=("flat", 7.6, 7.6), sleep_eff=("flat", 91, 91)),
        note="Paziente di controllo: giovane, alta efficacia, NEDA-3, ottima qualità di vita.",
    ),

    # 8) PPMS ---------------------------------------------------------------------------
    dict(
        id="MS-0085", name="Paolo Rizzo", sex="M", age=58, ms_type="PPMS",
        disease_years=9, n_visits=12,
        dmt=dict(drug="Ocrelizumab", klass="alta_efficacia", months=26),
        dmt_history=[],
        edss=("steps_up", 4.0, 5.0, 0.4),
        sdmt=("late_ramp", 44, 38, 0.3),
        mfis=("late_ramp", 42, 54, 0.3),
        phq9=("flat", 9, 11),
        msis29=("late_ramp", 50, 62, 0.3),
        nfl=("flat", 10.0, 11.5),
        gfap=("late_ramp", 170, 250, 0.3),
        t25fw=("late_ramp", 7.5, 10.5, 0.3),
        nhpt=("late_ramp", 26, 33, 0.3),
        relapses=[],
        mri=[
            dict(days_ago=400, new_t2=0, enlarging_t2=0, gad=0, prl=2, atrophy="progressione", note="Atrofia progressiva"),
            dict(days_ago=35, new_t2=0, enlarging_t2=0, gad=0, prl=2, atrophy="progressione",
                 note="Nessuna attività focale; progressione di atrofia midollare"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("RMN encefalo+midollo di follow-up", 35, 330, "ok"),
            ("Immunoglobuline (pre-infusione)", 45, 135, "ok"),
        ],
        wearable=dict(steps=("late_ramp", 4200, 2900, 0.3), gait=("late_ramp", 0.95, 0.72, 0.3),
                      sleep=("flat", 6.4, 6.2), sleep_eff=("late_ramp", 80, 72, 0.3)),
        note="PPMS: progressione indipendente dalle ricadute; GFAP elevato; declino dei biomarcatori digitali del cammino.",
    ),

    # 9) Highly active new diagnosis (activity, NOT yet suboptimal) ----------------------
    dict(
        id="MS-0288", name="Chiara Costa", sex="F", age=26, ms_type="RRMS",
        disease_years=1, n_visits=6,
        dmt=dict(drug="Ocrelizumab", klass="alta_efficacia", months=3),
        dmt_history=[],
        edss=("flat", 2.0, 2.0),
        sdmt=("flat", 57, 57),
        mfis=("flat", 34, 35),
        phq9=("flat", 7, 7),
        msis29=("flat", 30, 30),
        nfl=("late_ramp", 22.0, 14.0, 0.3),   # high at onset, dropping after high-efficacy start
        gfap=("flat", 100, 100),
        t25fw=("flat", 4.8, 4.7),
        nhpt=("flat", 20, 20),
        relapses=[
            dict(days_ago=150, type="relapse", severity="grave", trigger="nessuno",
                 recovery="parziale", note="Esordio con mielite, recupero parziale"),
        ],
        mri=[
            dict(days_ago=160, new_t2=6, enlarging_t2=0, gad=3, prl=1, atrophy="stabile",
                 note="Esordio: carico lesionale elevato, 3 captanti"),
            dict(days_ago=20, new_t2=0, enlarging_t2=0, gad=0, prl=1, atrophy="stabile",
                 note="Dopo avvio alta efficacia: nessuna nuova attività"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 20, 160, "ok"),
            ("Emocromo + Ig", 25, 65, "ok"),
        ],
        wearable=dict(steps=("flat", 8600, 8800), gait=("flat", 1.41, 1.43),
                      sleep=("flat", 7.2, 7.3), sleep_eff=("flat", 86, 87)),
        note="Diagnosi recente ad alta attività, avviata strategia early-high-efficacy: attività presente ma NON 'subottimale' (terapia da <6 mesi).",
    ),

    # 10) CIS / watchful ----------------------------------------------------------------
    dict(
        id="MS-0301", name="Davide Esposito", sex="M", age=31, ms_type="CIS",
        disease_years=2, n_visits=6,
        dmt=dict(drug="Nessuno (sorveglianza)", klass="nessuno", months=0),
        dmt_history=[],
        edss=("flat", 1.0, 1.0),
        sdmt=("flat", 59, 59),
        mfis=("flat", 22, 24),
        phq9=("flat", 4, 5),
        msis29=("flat", 14, 15),
        nfl=("flat", 7.0, 7.5),
        gfap=("flat", 92, 94),
        t25fw=("flat", 4.3, 4.3),
        nhpt=("flat", 18, 18),
        relapses=[
            dict(days_ago=430, type="relapse", severity="lieve", trigger="nessuno",
                 recovery="completo", note="Episodio singolo (neurite ottica) >14 mesi fa, CIS"),
        ],
        mri=[
            dict(days_ago=440, new_t2=2, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="2 lesioni, no disseminazione temporale iniziale"),
            dict(days_ago=50, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile, sorveglianza"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 50, 130, "in_scadenza"),
            ("Bande oligoclonali / rivalutazione", 300, 65, "ok"),
        ],
        wearable=dict(steps=("flat", 9500, 9400), gait=("flat", 1.44, 1.43),
                      sleep=("flat", 7.5, 7.4), sleep_eff=("flat", 89, 89)),
        note="CIS in sorveglianza attiva: nessuna terapia, monitoraggio RMN in scadenza.",
    ),

    # 11) Invisible-symptom burden in isolation -----------------------------------------
    dict(
        id="MS-0166", name="Martina Galli", sex="F", age=43, ms_type="RRMS",
        disease_years=10, n_visits=11,
        dmt=dict(drug="Dimetilfumarato", klass="orale", months=48),
        dmt_history=[],
        edss=("flat", 2.0, 2.0),
        sdmt=("late_ramp", 54, 45, 0.4),     # cognition declining
        mfis=("late_ramp", 34, 55, 0.4),     # fatigue rising
        phq9=("late_ramp", 7, 14, 0.4),      # mood worsening
        msis29=("late_ramp", 30, 48, 0.4),
        nfl=("flat", 5.5, 6.0),              # NO biological activity
        gfap=("flat", 100, 103),
        t25fw=("flat", 4.7, 4.8),
        nhpt=("flat", 20, 20),
        relapses=[],
        mri=[
            dict(days_ago=360, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=40, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile, no nuove lesioni"),
        ],
        adherence=dict(recent_pct=95, missed_doses_90d=2, refill_gap_days=2, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 40, 325, "ok"),
            ("Emocromo + linfociti (DMF)", 90, 5, "in_scadenza"),
        ],
        wearable=dict(steps=("late_ramp", 6800, 5200, 0.4), gait=("flat", 1.30, 1.28),
                      sleep=("late_ramp", 7.0, 5.8, 0.4), sleep_eff=("late_ramp", 85, 75, 0.4)),
        note="Carico di sintomi invisibili in aumento (fatica, cognizione, umore, sonno) SENZA attività biologica/radiologica: spesso non emerge in visita.",
    ),

    # 12) SPMS established, moderate -----------------------------------------------------
    dict(
        id="MS-0072", name="Francesco Romano", sex="M", age=61, ms_type="SPMS",
        disease_years=22, n_visits=12,
        dmt=dict(drug="Nessuno (sintomatico)", klass="nessuno", months=0),
        dmt_history=[("Interferone beta-1b", "iniettabile", 240, 70, "transizione progressiva")],
        edss=("steps_up", 5.5, 6.0, 0.5),
        sdmt=("flat", 40, 38),
        mfis=("flat", 50, 53),
        phq9=("flat", 10, 11),
        msis29=("flat", 60, 63),
        nfl=("flat", 11.0, 12.0),
        gfap=("flat", 200, 215),
        t25fw=("late_ramp", 11, 14, 0.4),
        nhpt=("flat", 32, 34),
        relapses=[],
        mri=[
            dict(days_ago=380, new_t2=0, enlarging_t2=0, gad=0, prl=1, atrophy="progressione", note="Atrofia"),
            dict(days_ago=60, new_t2=0, enlarging_t2=0, gad=0, prl=1, atrophy="progressione", note="Progressione lenta"),
        ],
        adherence=dict(recent_pct=100, missed_doses_90d=0, refill_gap_days=0, trend="stabile"),
        monitoring=[
            ("Valutazione riabilitativa", 120, 60, "ok"),
            ("RMN encefalo di follow-up", 60, 300, "ok"),
        ],
        wearable=dict(steps=("flat", 3100, 2900), gait=("late_ramp", 0.70, 0.60, 0.4),
                      sleep=("flat", 6.5, 6.4), sleep_eff=("flat", 78, 77)),
        note="SPMS consolidata, disabilità moderata, progressione lenta; focus su gestione sintomatica e riabilitazione.",
    ),

    # 13) RRMS stable low priority ------------------------------------------------------
    dict(
        id="MS-0245", name="Valentina Moretti", sex="F", age=33, ms_type="RRMS",
        disease_years=4, n_visits=9,
        dmt=dict(drug="Dimetilfumarato", klass="orale", months=28),
        dmt_history=[],
        edss=("flat", 1.0, 1.5),
        sdmt=("flat", 59, 59),
        mfis=("flat", 26, 27),
        phq9=("flat", 4, 5),
        msis29=("flat", 18, 19),
        nfl=("flat", 5.0, 5.5),
        gfap=("flat", 90, 92),
        t25fw=("flat", 4.3, 4.4),
        nhpt=("flat", 18, 19),
        relapses=[],
        mri=[
            dict(days_ago=350, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=70, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
        ],
        adherence=dict(recent_pct=97, missed_doses_90d=1, refill_gap_days=2, trend="stabile"),
        monitoring=[
            ("Emocromo + linfociti (DMF)", 95, 0, "in_scadenza"),
            ("RMN encefalo di follow-up", 70, 295, "ok"),
        ],
        wearable=dict(steps=("flat", 9300, 9200), gait=("flat", 1.43, 1.42),
                      sleep=("flat", 7.4, 7.3), sleep_eff=("flat", 90, 89)),
        note="RRMS stabile, buona aderenza; solo un esame ematico in scadenza. Bassa priorità.",
    ),

    # 14) Pseudo-relapse from infection (confounder) ------------------------------------
    dict(
        id="MS-0190", name="Alessandro Bruno", sex="M", age=47, ms_type="RRMS",
        disease_years=12, n_visits=11,
        dmt=dict(drug="Glatiramer acetato", klass="iniettabile", months=36),
        dmt_history=[],
        edss=("flat", 2.5, 2.5),
        sdmt=("flat", 52, 52),
        mfis=("flat", 33, 34),
        phq9=("flat", 6, 6),
        msis29=("flat", 28, 29),
        nfl=("flat", 6.5, 7.0),
        gfap=("flat", 110, 112),
        t25fw=("flat", 5.0, 5.1),
        nhpt=("flat", 21, 21),
        relapses=[
            dict(days_ago=18, type="pseudo_relapse_suspected", severity="moderata", trigger="infezione_IVU",
                 recovery="completo", note="Peggioramento con febbre e infezione urinaria, regredito dopo antibiotico (pseudo-ricaduta)"),
        ],
        mri=[
            dict(days_ago=330, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
            dict(days_ago=80, new_t2=0, enlarging_t2=0, gad=0, prl=0, atrophy="stabile", note="Stabile"),
        ],
        adherence=dict(recent_pct=92, missed_doses_90d=4, refill_gap_days=5, trend="stabile"),
        monitoring=[
            ("RMN encefalo di follow-up", 80, 285, "ok"),
            ("Esame urine / urinocoltura (follow-up IVU)", 18, 12, "in_scadenza"),
        ],
        wearable=dict(steps=("flat", 7400, 7300), gait=("flat", 1.33, 1.32),
                      sleep=("flat", 7.0, 6.9), sleep_eff=("flat", 85, 84)),
        note="Confounder: peggioramento recente da infezione urinaria/febbre (pseudo-ricaduta), da NON confondere con ricaduta vera. Malattia di base stabile.",
    ),
]


# --------------------------------------------------------------------------------------
# Trajectory expansion
# --------------------------------------------------------------------------------------
def expand_traj(spec, n, rounder=None, noise=0.0, lo=None, hi=None):
    """Turn a compact trajectory spec into a per-visit list of length n."""
    kind = spec[0]
    if kind == "flat":
        a, b = spec[1], spec[2]
        base = lin(a, b, n)
    elif kind == "late_ramp":
        a, b, knee = spec[1], spec[2], spec[3]
        base = late_ramp(a, b, n, knee)
    elif kind == "steps_up":
        # stepwise confirmed worsening: flat, then a step, then flat (mimics confirmed progression)
        a, b, knee = spec[1], spec[2], spec[3]
        base = late_ramp(a, b, n, knee)
    else:
        raise ValueError("unknown trajectory kind: " + kind)
    return add_noise(base, noise, lo=lo, hi=hi, rounder=rounder)


# --------------------------------------------------------------------------------------
# Build one patient record (nested)
# --------------------------------------------------------------------------------------
def build_patient(spec):
    n = spec["n_visits"]
    vdates = visit_dates(n, last_days_ago=21, interval_days=91)
    age = spec["age"]

    edss = expand_traj(spec["edss"], n, rounder=round_edss, noise=0.10, lo=0, hi=10)
    sdmt = expand_traj(spec["sdmt"], n, rounder=lambda x: int(round(x)), noise=1.4, lo=0, hi=110)
    mfis = expand_traj(spec["mfis"], n, rounder=lambda x: int(round(x)), noise=2.0, lo=0, hi=84)
    phq9 = expand_traj(spec["phq9"], n, rounder=lambda x: int(round(x)), noise=1.0, lo=0, hi=27)
    msis = expand_traj(spec["msis29"], n, rounder=lambda x: int(round(x)), noise=1.5, lo=0, hi=100)
    nfl = expand_traj(spec["nfl"], n, rounder=lambda x: round(x, 1), noise=0.6, lo=1.0, hi=120)
    gfap = expand_traj(spec["gfap"], n, rounder=lambda x: int(round(x)), noise=6.0, lo=30, hi=600)
    t25 = expand_traj(spec["t25fw"], n, rounder=lambda x: round(x, 1), noise=0.15, lo=2.5, hi=180)
    nhpt = expand_traj(spec["nhpt"], n, rounder=lambda x: round(x, 1), noise=0.6, lo=12, hi=300)

    nurl = nfl_url(age)
    gurl = gfap_url(age)

    def series(dates, values):
        return [dict(date=iso(dt), value=v) for dt, v in zip(dates, values)]

    timeline = dict(
        visits=[iso(x) for x in vdates],
        edss=series(vdates, edss),
        sdmt=series(vdates, sdmt),
        mfis=series(vdates, mfis),
        phq9=series(vdates, phq9),
        msis29=series(vdates, msis),
        nfl=[dict(date=iso(dt), value=v, url=nurl) for dt, v in zip(vdates, nfl)],
        gfap=[dict(date=iso(dt), value=v, url=gurl) for dt, v in zip(vdates, gfap)],
        t25fw=series(vdates, t25),
        nhpt=series(vdates, nhpt),
        relapses=[],
        mri=[],
        dmt_changes=[],
        wearable=[],
    )

    # Relapses / pseudo-relapses
    for r in spec["relapses"]:
        timeline["relapses"].append(dict(
            date=iso(d(int(r["days_ago"]))),
            type=r["type"], severity=r["severity"], trigger=r["trigger"],
            recovery=r["recovery"], note=r["note"],
        ))
    timeline["relapses"].sort(key=lambda x: x["date"])

    # MRI
    for m in spec["mri"]:
        timeline["mri"].append(dict(
            date=iso(d(int(m["days_ago"]))),
            new_t2=m["new_t2"], enlarging_t2=m["enlarging_t2"], gad_enhancing=m["gad"],
            prl=m["prl"], atrophy=m["atrophy"], note=m["note"],
        ))
    timeline["mri"].sort(key=lambda x: x["date"])

    # DMT changes (from history + current start)
    cur = spec["dmt"]
    if cur["months"] > 0:
        start = d(int(cur["months"] * 30.4))
        timeline["dmt_changes"].append(dict(
            date=iso(start), to=cur["drug"], klass=cur["klass"], event="inizio",
            note="Avvio terapia in corso",
        ))
    for (drug, klass, start_m, stop_m, reason) in spec["dmt_history"]:
        timeline["dmt_changes"].append(dict(
            date=iso(d(int(stop_m * 30.4))), to=drug, from_drug=drug, klass=klass, event="sospensione",
            note="Sospensione: " + reason,
        ))
    timeline["dmt_changes"].sort(key=lambda x: x["date"])

    # Wearable weekly aggregates (last ~26 weeks)
    wk = weekly_dates(span_days=26 * 7, last_days_ago=4)
    nw = len(wk)
    w = spec["wearable"]
    steps = expand_traj(w["steps"], nw, rounder=lambda x: int(round(x)), noise=420, lo=300)
    gait = expand_traj(w["gait"], nw, rounder=lambda x: round(x, 2), noise=0.03, lo=0.3)
    sleep = expand_traj(w["sleep"], nw, rounder=lambda x: round(x, 1), noise=0.3, lo=3.5, hi=11)
    seff = expand_traj(w["sleep_eff"], nw, rounder=lambda x: int(round(x)), noise=2.0, lo=50, hi=100)
    for i, dt in enumerate(wk):
        timeline["wearable"].append(dict(
            date=iso(dt), steps=steps[i], gait_speed_ms=gait[i],
            sleep_hours=sleep[i], sleep_efficiency_pct=seff[i],
            active_minutes=int(round(steps[i] / 110)),
        ))

    # Digital-biomarker severities (0..1) derived from this patient's clinical trajectory,
    # so wearable/sensor metrics corroborate the story across independent modalities.
    def m2(seq):  # baseline (first 2) vs recent (last 2) means
        b = sum(seq[:2]) / max(1, len(seq[:2]))
        r = sum(seq[-2:]) / max(1, len(seq[-2:]))
        return b, r
    eb, er = m2(edss); sb, sr = m2(sdmt); mb, mr = m2(mfis)
    stb, str_ = m2(steps); gb, gr = m2(gait); slb, slr = m2(sleep)
    mfis_rise = clamp((mr - mb) / 40.0, 0, 1)
    sdmt_drop = clamp((sb - sr) / 15.0, 0, 1)
    edss_rise = clamp((er - eb) / 2.0, 0, 1)
    steps_decl = clamp((stb - str_) / 4000.0, 0, 1)
    gait_decl = clamp((gb - gr) / 0.4, 0, 1)
    sleep_decl = clamp((slb - slr) / 2.0, 0, 1)
    sev_map = {
        "gait": clamp(max(gait_decl, 0.8 * edss_rise), 0, 1),
        "keystroke": clamp(max(sdmt_drop, 0.5 * mfis_rise), 0, 1),
        "cardio": clamp(0.8 * mfis_rise, 0, 1),
        "sleep": clamp(max(sleep_decl, 0.5 * mfis_rise), 0, 1),
        "activity": clamp(max(steps_decl, 0.6 * mfis_rise), 0, 1),
    }
    sev_map["composite"] = clamp((sev_map["cardio"] + sev_map["sleep"] + sev_map["activity"]) / 3.0, 0, 1)
    # Dedicated, per-patient RNG (stable, independent of the global clinical stream).
    dbio_rng = random.Random(SEED + int(spec["id"].split("-")[1]) * 1000)
    timeline["digital_biomarkers"] = build_digital_biomarkers(sev_map, wk, dbio_rng)

    # Monitoring items: (label, last_done_days_ago, due_in_days[+future/-overdue], status)
    monitoring = []
    for (label, last_ago, due_in, status) in spec["monitoring"]:
        monitoring.append(dict(
            item=label,
            last_done=iso(d(int(last_ago))),
            due_date=iso(ANCHOR + timedelta(days=int(due_in))),
            status=status,
        ))

    # Current DMT block
    cur_block = dict(
        drug=cur["drug"], klass=cur["klass"], months_on_dmt=cur["months"],
        start_date=iso(d(int(cur["months"] * 30.4))) if cur["months"] > 0 else None,
    )

    diagnosis_date = iso(d(int(spec["disease_years"] * 365)))

    return dict(
        id=spec["id"], name=spec["name"], sex=spec["sex"], age=age,
        ms_type=spec["ms_type"], disease_duration_years=spec["disease_years"],
        diagnosis_date=diagnosis_date,
        current_dmt=cur_block,
        dmt_history=[dict(drug=h[0], klass=h[1], months_total=h[2], stopped_months_ago=h[3], reason=h[4])
                     for h in spec["dmt_history"]],
        adherence=spec["adherence"],
        monitoring=monitoring,
        timeline=timeline,
        nfl_url=nurl, gfap_url=gurl,
        note_synthetic=spec["note"],
    )


# --------------------------------------------------------------------------------------
# CSV writers (long format, R/Quarto friendly)
# --------------------------------------------------------------------------------------
def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def emit_csvs(patients):
    # patients.csv
    rows = []
    for p in patients:
        rows.append([p["id"], p["name"], p["sex"], p["age"], p["ms_type"],
                     p["disease_duration_years"], p["diagnosis_date"],
                     p["current_dmt"]["drug"], p["current_dmt"]["klass"],
                     p["current_dmt"]["months_on_dmt"],
                     p["adherence"]["recent_pct"], p["adherence"]["trend"],
                     p["nfl_url"], p["gfap_url"]])
    write_csv(os.path.join(HERE, "patients.csv"),
              ["patient_id", "name", "sex", "age", "ms_type", "disease_years",
               "diagnosis_date", "current_dmt", "dmt_class", "months_on_dmt",
               "adherence_pct", "adherence_trend", "nfl_url", "gfap_url"], rows)

    # clinical_scales.csv (EDSS, SDMT, T25FW, 9HPT)
    rows = []
    for p in patients:
        for key, scale in [("edss", "EDSS"), ("sdmt", "SDMT"), ("t25fw", "T25FW_s"), ("nhpt", "NHPT_s")]:
            for pt in p["timeline"][key]:
                rows.append([p["id"], pt["date"], scale, pt["value"]])
    write_csv(os.path.join(HERE, "clinical_scales.csv"),
              ["patient_id", "date", "scale", "value"], rows)

    # pro.csv (MFIS, PHQ9, MSIS29)
    rows = []
    for p in patients:
        for key, scale in [("mfis", "MFIS"), ("phq9", "PHQ9"), ("msis29", "MSIS29")]:
            for pt in p["timeline"][key]:
                rows.append([p["id"], pt["date"], scale, pt["value"]])
    write_csv(os.path.join(HERE, "pro.csv"),
              ["patient_id", "date", "instrument", "value"], rows)

    # labs.csv (NfL, GFAP)
    rows = []
    for p in patients:
        for key, name in [("nfl", "NfL_pg_ml"), ("gfap", "GFAP_pg_ml")]:
            for pt in p["timeline"][key]:
                rows.append([p["id"], pt["date"], name, pt["value"], pt["url"]])
    write_csv(os.path.join(HERE, "labs.csv"),
              ["patient_id", "date", "biomarker", "value", "age_adjusted_url"], rows)

    # mri.csv
    rows = []
    for p in patients:
        for m in p["timeline"]["mri"]:
            rows.append([p["id"], m["date"], m["new_t2"], m["enlarging_t2"],
                         m["gad_enhancing"], m["prl"], m["atrophy"], m["note"]])
    write_csv(os.path.join(HERE, "mri.csv"),
              ["patient_id", "date", "new_t2", "enlarging_t2", "gad_enhancing", "prl", "atrophy", "note"], rows)

    # relapses.csv
    rows = []
    for p in patients:
        for r in p["timeline"]["relapses"]:
            rows.append([p["id"], r["date"], r["type"], r["severity"], r["trigger"], r["recovery"], r["note"]])
    write_csv(os.path.join(HERE, "relapses.csv"),
              ["patient_id", "date", "type", "severity", "trigger", "recovery", "note"], rows)

    # dmt.csv (history rows)
    rows = []
    for p in patients:
        c = p["current_dmt"]
        rows.append([p["id"], c["drug"], c["klass"], c["start_date"] or "", "", c["months_on_dmt"], "in corso"])
        for h in p["dmt_history"]:
            rows.append([p["id"], h["drug"], h["klass"], "", "", h["months_total"], "sospeso: " + h["reason"]])
    write_csv(os.path.join(HERE, "dmt.csv"),
              ["patient_id", "drug", "class", "start_date", "stop_date", "months_total", "status"], rows)

    # wearable.csv
    rows = []
    for p in patients:
        for w in p["timeline"]["wearable"]:
            rows.append([p["id"], w["date"], w["steps"], w["gait_speed_ms"],
                         w["sleep_hours"], w["sleep_efficiency_pct"], w["active_minutes"]])
    write_csv(os.path.join(HERE, "wearable.csv"),
              ["patient_id", "week", "steps_per_day", "gait_speed_ms", "sleep_hours",
               "sleep_efficiency_pct", "active_minutes"], rows)

    # monitoring.csv
    rows = []
    for p in patients:
        for m in p["monitoring"]:
            rows.append([p["id"], m["item"], m["last_done"], m["due_date"], m["status"]])
    write_csv(os.path.join(HERE, "monitoring.csv"),
              ["patient_id", "item", "last_done", "due_date", "status"], rows)

    # digital_biomarkers.csv (long format: patient x domain x metric x week)
    rows = []
    for p in patients:
        for dom in p["timeline"].get("digital_biomarkers", []):
            for m in dom["metrics"]:
                for pt in m["series"]:
                    rows.append([p["id"], pt["date"], dom["key"], dom["label"], m["key"], m["label"],
                                 pt["value"], m["unit"], int(m["worse_up"]), int(m["proprietary"]),
                                 dom["evidence"], dom["device"]])
    write_csv(os.path.join(HERE, "digital_biomarkers.csv"),
              ["patient_id", "week", "domain", "domain_label", "metric", "metric_label",
               "value", "unit", "worse_up", "proprietary", "evidence", "device"], rows)


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def main():
    patients = [build_patient(s) for s in PATIENTS]

    dataset = dict(
        meta=dict(
            product="NeuroInflammation Copilot",
            event="Digital Neuro Hub 2026 - NeuroHackathon",
            generated_anchor_date=iso(ANCHOR),
            seed=SEED,
            n_patients=len(patients),
            disclaimer=DISCLAIMER,
            synthetic=True,
            digital_biomarkers=dict(
                valid_day_rule="Giorno valido = >=1 h di wear 07:00-23:00 su >=3 giorni.",
                gait_aggregation=("DMO del cammino calcolati per episodio (bout) e aggregati a sintesi "
                                  "giornaliere/settimanali (somma, mediana, 90° pct, CV), stratificati per "
                                  "durata del bout (10-30 s, >=30 s, >=60 s)."),
                keystroke_aggregation="Feature di digitazione aggregate con statistiche di sintesi e di serie temporale (mediana, max, min, SD).",
                physiologic_note="HRV, frequenza respiratoria, SpO2 e temperatura cutanea derivate di notte, durante il sonno; HRV = RMSSD (ms).",
                evidence_legend=dict(
                    evidence="Associazioni con la SM supportate da evidenza citata (gait, keystroke).",
                    rationale=("Razionale rilevante per la SM ma NON testato nello studio: cardiaco, "
                               "respiratorio, sonno, attività. Richiede validazione dedicata."),
                ),
                proprietary_note="Sleep/Stress/Readiness Score e Cardio Fitness sono indici compositi proprietari (algoritmo non divulgato), non interoperabili tra brand.",
            ),
        ),
        patients=patients,
    )

    # JSON
    with open(os.path.join(HERE, "dataset.json"), "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    # CSVs
    emit_csvs(patients)

    # Embedded JS for the offline apps (file:// safe; avoids fetch/CORS).
    # Written to ALL UI surfaces so they share one synthetic dataset:
    #   app/  (HCP v1)   n2/  (HCP v2 console)   paziente/  (patient companion)
    targets = [APP_DIR, os.path.join(ROOT, "n2"), os.path.join(ROOT, "paziente")]
    for target in targets:
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "data.js"), "w", encoding="utf-8") as f:
            f.write("// AUTO-GENERATED by data/generate_data.py - do not edit by hand.\n")
            f.write("// Synthetic dataset embedded so the app runs fully offline (file://).\n")
            f.write("window.MS_DATA = ")
            json.dump(dataset, f, ensure_ascii=False, indent=2)
            f.write(";\n")

    print("OK - generated %d patients" % len(patients))
    print("  data/dataset.json + CSVs")
    print("  app/data.js + n2/data.js + paziente/data.js (embedded)")


if __name__ == "__main__":
    main()
