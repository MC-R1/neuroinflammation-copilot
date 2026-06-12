# Data dictionary — coorte sintetica SM

> **Dati 100% sintetici** generati da [`generate_data.py`](generate_data.py) con seed fisso
> (`20260611`), data di ancoraggio `2026-06-10`. Nessun dato reale di pazienti.
> Prototipo dimostrativo, **non per uso clinico**. Valori plausibili ma **didattici**:
> le soglie non sostituiscono cut-off di laboratorio validati.

## File prodotti
| File | Formato | Contenuto |
|---|---|---|
| `dataset.json` | JSON nidificato | Struttura completa per-paziente, consumata dalla web app |
| `../app/data.js` | JS | Stesso `dataset.json` embeddato (`window.MS_DATA`) per uso **offline** |
| `patients.csv` | CSV (1 riga/paziente) | Anagrafica, forma, DMT, aderenza, soglie NfL/GFAP |
| `clinical_scales.csv` | CSV long | EDSS, SDMT, T25FW, 9-HPT nel tempo |
| `pro.csv` | CSV long | PRO: MFIS, PHQ-9, MSIS-29 nel tempo |
| `labs.csv` | CSV long | Biomarcatori sierici NfL, GFAP (+ soglia per età) |
| `mri.csv` | CSV long | Referti RMN sintetici (nuove/ingrandite/captanti/PRL/atrofia) |
| `relapses.csv` | CSV long | Ricadute e sospette pseudo-ricadute |
| `dmt.csv` | CSV long | Storia terapeutica (DMT corrente + pregresse) |
| `wearable.csv` | CSV long | Wearable di base settimanale (passi, cammino, sonno) — retro-compatibile |
| `digital_biomarkers.csv` | CSV long | **Catalogo esteso** di biomarcatori digitali per dominio (gait DMO, keystroke, fisiologici, sonno, attività, score) |
| `monitoring.csv` | CSV long | Esami di monitoraggio programmati e stato |

I CSV sono in **formato long** (una riga per misura) per essere esplorati facilmente in **R/Quarto**.

## Campi principali (per-paziente, `dataset.json`)
| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | string | Identificativo sintetico (es. `MS-0142`) |
| `name`, `sex`, `age` | string/int | Anagrafica sintetica |
| `ms_type` | string | Forma: `RRMS`, `SPMS`, `PPMS`, `CIS`, `RRMS → SPMS` |
| `disease_duration_years` | int | Anni dalla diagnosi |
| `current_dmt` | obj | `{drug, klass, months_on_dmt, start_date}`; `klass` ∈ {iniettabile, orale, alta_efficacia, nessuno} |
| `dmt_history` | array | Terapie pregresse con motivo di sospensione |
| `adherence` | obj | `{recent_pct, missed_doses_90d, refill_gap_days, trend}` |
| `monitoring` | array | `{item, last_done, due_date, status}`; `status` ∈ {ok, in_scadenza, scaduto} |
| `nfl_url`, `gfap_url` | float | Soglia superiore di riferimento **aggiustata per età** |
| `timeline` | obj | Serie longitudinali (sotto) |
| `note_synthetic` | string | Nota descrittiva dell'archetipo |

### `timeline`
| Serie | Punti | Note |
|---|---|---|
| `edss` | `{date, value}` | 0–10, passi 0.5 (deambulazione-pesata) |
| `sdmt` | `{date, value}` | Cognizione; **più basso = peggiore** (atteso ~55) |
| `mfis` | `{date, value}` | Fatica 0–84; **più alto = peggiore** (≥38 rilevante) |
| `phq9` | `{date, value}` | Umore 0–27 |
| `msis29` | `{date, value}` | Impatto SM (0–100 normalizzato) |
| `t25fw`, `nhpt` | `{date, value}` | Cammino e destrezza mano (secondi) |
| `nfl` | `{date, value, url}` | NfL sierico (pg/mL) + soglia per età |
| `gfap` | `{date, value, url}` | GFAP sierico (pg/mL) + soglia per età |
| `relapses` | `{date, type, severity, trigger, recovery, note}` | `type` ∈ {`relapse`, `pseudo_relapse_suspected`} |
| `mri` | `{date, new_t2, enlarging_t2, gad_enhancing, prl, atrophy, note}` | Attività focale e PRL/atrofia |
| `dmt_changes` | `{date, event, to, klass, note}` | Inizi/sospensioni terapia |
| `wearable` | `{date, steps, gait_speed_ms, sleep_hours, sleep_efficiency_pct, active_minutes}` | Aggregati settimanali (di base) |
| `digital_biomarkers` | `[{key, label, device, evidence, metrics:[{key,label,unit,worse_up,proprietary,baseline,latest,series}]}]` | Catalogo esteso per dominio (sotto) |

## Soglie di riferimento (semplificate, per età)
- **NfL URL** = `7.0 + 0.11 × max(0, età−20)` pg/mL (≈ 7 a 20 anni, ≈ 9.2 a 40, ≈ 12.5 a 70).
- **GFAP URL** = `85 + 1.6 × max(0, età−20)` pg/mL.

> Sono valori **dimostrativi** scelti per rendere leggibile la demo; in clinica si usano
> percentili validati (es. modelli aggiustati per età/BMI) e cut-off di laboratorio.

## Biomarcatori digitali (catalogo esteso, `timeline.digital_biomarkers`)
Metriche da wearable/sensori, raggruppate per **dominio**, ognuna con device, tag di **evidenza** e
serie settimanale (8 punti). Le severità per paziente sono **derivate dalla traiettoria clinica**
dell'archetipo (es. il declino del cammino e il rallentamento della digitazione corroborano EDSS e
calo cognitivo su modalità indipendenti). Deterministico, niente dati reali.

| Dominio | Device | Evidenza | Esempi di metriche |
|---|---|---|---|
| Cammino reale (gait DMO) | IMU lombare · Axivity AX6 / MobGap | **evidence** | velocità, cadenza, lunghezza/durata del passo, episodi, durata episodio, giri (turns) |
| Digitazione (keystroke) | Tastiera smartphone · Neurokeys / Neurocast | **evidence** | hold/flight time, PPL/RRL, pre/post-correzione, pause, quota parole lunghe |
| Cuore & autonomo | Wearable consumer | rationale | FC a riposo, FC media 24h, HRV (RMSSD) |
| Respiro & temperatura (notturni) | Wearable consumer (sonno) | rationale | freq. respiratoria, SpO₂, Δ temp. cutanea |
| Sonno | Wearable consumer | rationale | TST, sonno profondo/REM/sveglia, efficienza, **Sleep Score** ⌁ |
| Attività fisica | Wearable consumer | rationale | passi, AZM, piani, distanza, calorie, **VO₂max** ⌁ |
| Punteggi compositi | Indici proprietari | rationale | **Stress Management** ⌁, **Readiness** ⌁ |

**Note (come nella fonte):**
1. `evidence` = associazioni con la SM supportate da evidenza citata (gait, keystroke); `rationale` =
   razionale rilevante ma **NON testato** (cardiaco/respiratorio/sonno/attività): richiede validazione dedicata.
2. ⌁ = indice **proprietario** (algoritmo non divulgato), non interoperabile tra brand.
3. Gait DMO calcolati per *bout* e aggregati (somma/mediana/90° pct/CV), stratificati per durata;
   giorno valido = ≥1 h wear 07:00–23:00 su ≥3 giorni. Fisiologici (HRV/respiro/SpO₂/temp.) derivati di notte.

Queste sfumature sono esposte nell'UpdateView del neurologo (badge evidenza/razionale, device, ⌁) per
**trasparenza**. L'app paziente mostra solo un sottoinsieme "consumer" (recupero, sonno, battito, minuti attivi),
in chiave di benessere e senza linguaggio allarmante.

## Coorte (14 archetipi)
| ID | Nome | Forma | Archetipo clinico |
|---|---|---|---|
| MS-0142 | Giulia Rossi | RRMS | **Flagship**: attività + sintomi invisibili + subottimale + aderenza + pseudo-ricaduta da caldo |
| MS-0098 | Marco Bianchi | RRMS | Controllo: **NEDA-3 stabile** (alta efficacia) |
| MS-0211 | Anna Verdi | RRMS→SPMS | **PIRA / smouldering** (EDSS confermato, GFAP↑, PRL, no attività focale) |
| MS-0177 | Luca Ferrari | RRMS | **Risposta subottimale** → candidato a switch (ricaduta + lesioni captanti) |
| MS-0203 | Sofia Conti | RRMS | **Aderenza a rischio** (gap rifornimenti) con attività iniziale |
| MS-0119 | Giorgio Marino | RRMS | **Monitoraggio in scadenza** (anti-JCV / RMN PML su natalizumab) |
| MS-0260 | Elena Greco | RRMS | Controllo: **NEDA-3 stabile** (alta efficacia) |
| MS-0085 | Paolo Rizzo | PPMS | **Progressione primaria** (GFAP↑, atrofia, cammino in calo) |
| MS-0288 | Chiara Costa | RRMS | Esordio **ad alta attività** in early-high-efficacy (attività ma NON subottimale) |
| MS-0301 | Davide Esposito | CIS | **Sorveglianza** (watchful, monitoraggio in scadenza) |
| MS-0166 | Martina Galli | RRMS | **Sintomi invisibili isolati** (fatica/cognizione/umore↑ senza attività) |
| MS-0072 | Francesco Romano | SPMS | SPMS consolidata, progressione lenta |
| MS-0245 | Valentina Moretti | RRMS | RRMS stabile, bassa priorità |
| MS-0190 | Alessandro Bruno | RRMS | **Confounder**: pseudo-ricaduta da infezione (IVU), malattia di base stabile |

## Riproducibilità
```bash
python3 data/generate_data.py     # rigenera CSV + JSON + app/data.js (identici a parità di seed)
```
Nessuna dipendenza esterna (solo libreria standard Python). Nessun uso dell'orologio di sistema.
