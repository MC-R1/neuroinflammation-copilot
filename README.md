# NeuroInflammation Copilot 🧠

**HCP Digital Copilot per Sclerosi Multipla e malattie neuroinfiammatorie** — prototipo per il
**NeuroHackathon del Digital Neuro Hub 2026** (sfida #2 *HCP Digital Copilot*).

Un copilot AI-native per il **neurologo**: integra dati eterogenei (cartella, RMN, biomarcatori
sierici e digitali, scale, PRO, storia terapeutica), **prioritizza** i pazienti, **spiega** ogni
segnalazione in modo trasparente, fa emergere **attività precoce / progressione silente / sintomi
invisibili** e prepara la visita — con il **clinico sempre al centro**.

> ⚠️ **Prototipo dimostrativo su dati 100% sintetici. NON destinato all'uso clinico.**
> Strumento di supporto decisionale: la decisione resta sempre al clinico.

---

## ▶️ Avvio della demo in 30 secondi

> Il prototipo è un **ecosistema a due lati che chiude il loop**:
> - **lato neurologo (HCP copilot)** — `n2/` “Console clinica” v2 *(consigliata per il pitch)* e `app/` v1 classica;
> - **lato paziente (Patient Companion)** — `paziente/` “L'app di Giulia”, mobile-first.
>
> Stessa coorte sintetica condivisa: ciò che il **paziente** registra (stanchezza, dosi saltate, flare da caldo)
> è esattamente ciò che il **copilot del neurologo** intercetta come flag.

**Opzione A — la più semplice (zero dipendenze, offline):** apri con un doppio click
- **`n2/index.html`** — copilot del neurologo (v2, consigliata)
- **`paziente/index.html`** — app del paziente (mobile-first)
- `app/index.html` — copilot v1 classica

**Opzione B — con un server locale** (consigliata su alcuni browser):
```bash
python3 -m http.server 8000 --directory n2          # copilot v2
python3 -m http.server 8002 --directory paziente    # app paziente
# poi apri http://localhost:8000 (o :8002)
```

**Opzione C — con LLM “live” (opzionale)** — abilita la generazione via modello:
```bash
ANTHROPIC_API_KEY=sk-ant-...  python3 n2/serve.py        # copilot v2 · http://localhost:8001
ANTHROPIC_API_KEY=sk-ant-...  python3 paziente/serve.py  # app paziente · http://localhost:8002
ANTHROPIC_API_KEY=sk-ant-...  python3 app/serve.py       # copilot v1 · http://localhost:8000
# senza chiave: partono comunque e usano i contenuti offline (curati / template / regole sicure)
```

Niente `npm install`, niente build, niente `node_modules`. Solo un browser (e Python solo per le opzioni B/C).

### La storia da raccontare (Giulia)
1. Nel **Panel**, **Giulia Rossi** è in cima (priorità ALTA) → clic **“Perché?”** per i fattori
   (nella v2: barre di contributo del punteggio, scomposte per flag).
2. Apri la sua **scheda**: trend (NfL↑, SDMT↓, MFIS↑, EDSS 2.0→2.5), GFAP normale (= attività, non progressione), biomarcatori digitali in calo, **insight pseudo-ricaduta da caldo**.
3. **Genera visit summary** → **bozza lettera** → **istruzioni**: tutte con banner *“DA RIVEDERE E FIRMARE DAL CLINICO”*.
4. **Valida e firma** → controlla l'**audit trail** nel modale *Governance*.
5. Per contrasto, apri **Marco Bianchi** (NEDA-3, stabile, verde).
6. **Chiudi il loop:** apri `paziente/index.html` — è il telefono di Giulia. Mostra il check-in di oggi,
   l'**assistente sicuro** (chiedi “peggioro con il caldo” → consigli + quando contattare; prova un sintomo
   d'allarme → **escalation**), e il **promemoria per la visita**. *“Quello che lei registra qui è ciò che il
   copilot ha intercettato lì.”*

---

## 🗂️ Struttura del progetto
```
/                     README, PLAN, ASSUMPTIONS, ARCHITECTURE, CLINICAL_LOGIC, VALIDATION_KPI, PITCH_OUTLINE, AGENTS
/data                 generatore + CSV + JSON + data_dictionary
  generate_data.py    generatore riproducibile (seed fisso, solo stdlib) → scrive i dati in app/ E n2/
  *.csv, dataset.json dataset sintetico (esplorabile anche in R/Quarto)
  data_dictionary.md
/app                  UI v1 classica (vanilla, offline-first)
  index.html          guscio dell'app
  data.js             dataset embeddato (generato)  ── per girare offline
  summaries.js        riassunti curati embeddati (generato)
  css/styles.css
  js/risk.js          motore di rischio TRASPARENTE (regole spiegabili)
  js/templates.js     fallback deterministico (IT) per ogni paziente
  js/llm.js           orchestrazione output (live → curato → template)
  js/app.js           UI: panel, dettaglio, governance, audit
  prompts/            prompt template del summary e della lettera
  generated_summaries/ riassunti curati (fallback offline, sorgente .md)
  serve.py            server opzionale + proxy LLM (API key da env)
  build_summaries.py  embedda i .md curati in summaries.js (app/ e n2/)
/n2                   UI v2 “Console clinica” (consigliata per il pitch) — stessa logica, grafica rinnovata
  index.html, css/styles.css, js/app.js   ── nuova interfaccia (sidebar, ring, area chart, contributi)
  js/{risk,templates,llm}.js              ── copie sincronizzate dei moduli di logica di app/js
  data.js, summaries.js                   ── generati (gli script di build scrivono in tutte le UI)
  serve.py                                ── server opzionale v2 (porta 8001)
/paziente             App del paziente (“L'app di Giulia”) — mobile-first, offline-first
  index.html, css/styles.css
  js/patient.js       UI: Oggi, Diario, Assistente, Andamenti, Visita
  js/chat.js          assistente conversazionale SICURO (classificatore + escalation + base curata)
  js/llm.js, data.js  ── modalità live opzionale + dataset condiviso
  serve.py            ── server opzionale paziente (porta 8002)
/model                extra: modello di rischio trasparente in Python
  risk_model.py
/.claude/agents       7 agenti pronti per l'hackathon (vedi AGENTS.md)
```

## 🎨 Le interfacce

**Copilot del neurologo** — due versioni equivalenti:
| | v1 `app/` | **v2 `n2/` (pitch)** |
|---|---|---|
| Layout | top-bar classica | **app-shell con sidebar scura** (nav, stats coorte, filtri con conteggi) |
| Priorità | badge + punteggio | **ring di punteggio** + gruppi per livello |
| Spiegabilità | elenco fattori | **barre di contributo** (punti per flag) + fattori |
| Trend | sparkline | **area chart** con banda di soglia, tooltip per visita, date |
| Coorte | — | **percentili di coorte** sui biomarcatori (es. “93° pct coorte” sul NfL) |
| Biomarcatori digitali | wearable base (passi/cammino/sonno) | **pannello esteso per dominio** (gait DMO, keystroke, fisiologici, sonno, attività, score) con badge **device + evidenza/razionale** e indici proprietari |
| Governance | modale | **drawer** laterale + toast di conferma firma |

Stessa logica clinica (`js/risk.js` identico), stessi dati, stessi output a 3 livelli.

**App del paziente** — `paziente/` (“L'app di Giulia”): mobile-first, calda e accessibile.
- **Oggi** (check-in umore/terapia), **Diario** (sintomi/PRO con rilevazione dei segnali da non rimandare),
  **Assistente** conversazionale **sicuro**, **Andamenti** (trend amichevoli + card “Dal tuo dispositivo”
  con recupero/sonno/battito/minuti attivi), **Visita** (promemoria auto-generato).
- **Sicurezza dell'assistente** (la giuria la premia): limiti chiari, **escalation-first** (112 / Centro SM / crisi),
  niente diagnosi né modifiche di terapia, niente over-reassurance. Contenuto clinico revisionato dall'agente `clinical-guardian`.
- **Il loop:** i dati che Giulia registra qui sono quelli che la fanno emergere in cima nel copilot del neurologo.

## 🤖 Agenti pronti per l'hackathon
In `.claude/agents/` ci sono **7 agenti** già configurati per Claude Code: `demo-sentinel` (smoke-test pre-pitch),
`data-sculptor` (modifica coorte sintetica), `clinical-guardian` (revisione testi clinici), `pitch-coach`,
`ui-surgeon` (ritocchi UI verificati nel browser), `reg-navigator` (MDR/GDPR/AI Act), `quarto-analyst` (analisi R/Quarto).
Guida ed esempi: **[AGENTS.md](AGENTS.md)**.

## ✨ Cosa fa (MVP)
- **Vista Panel:** lista pazienti per **priorità di rischio**, con badge/flag e pannello **“Perché?”** (fattori) per ogni segnalazione.
- **Vista Dettaglio:** **timeline** longitudinale (ricadute, RMN, NfL/GFAP, PRO, cambi DMT) con **sparkline**; evidenzia peggioramento silente e **sintomi invisibili**; **biomarcatori digitali** da wearable.
- **AI visit summary** pre-visita (3 livelli: LLM live → curato → template; **sempre offline-capable**).
- **Bozza lettera e istruzioni** post-visita con badge **“DA RIVEDERE E FIRMARE DAL CLINICO”**.
- **Layer governance:** intended use, disclaimer, **audit trail** (chi/quando ha generato/validato), “decisione al clinico”.

## 🧪 Logica di rischio (trasparente, non black-box)
Flag spiegabili: *attività di malattia, possibile PIRA/smouldering, risposta subottimale, carico
sintomi invisibili in aumento, aderenza a rischio, monitoraggio in scadenza* + **punteggio di
priorità** con scomposizione dei contributi. Dettagli e razionale clinico in
[CLINICAL_LOGIC.md](CLINICAL_LOGIC.md). Le stesse regole sono replicate in Python:
```bash
python3 model/risk_model.py            # stampa flag + contributi per ogni paziente (cross-check)
```

## 🔁 Rigenerare i dati / i riassunti
```bash
python3 data/generate_data.py     # CSV + JSON + app/data.js (identici a parità di seed)
python3 app/build_summaries.py    # app/generated_summaries/*.md  →  app/summaries.js
```

## 🏗️ Architettura & modello dati
- **Self-contained, offline-first:** dati embeddati via `<script>` (niente `fetch`/CORS), grafici in SVG inline, zero framework. Vedi [ARCHITECTURE.md](ARCHITECTURE.md) (con diagrammi mermaid) e [data dictionary](data/data_dictionary.md).
- **LLM opzionale:** `app/serve.py` legge la chiave da env (`ANTHROPIC_API_KEY` o `OPENAI_API_KEY`) e fa da proxy same-origin; la chiave **non** arriva al browser. Prompt in [`app/prompts/`](app/prompts/).

## 🧭 Assunzioni
Coorte di **14 pazienti** sintetici (archetipi clinici bilanciati), orizzonte ~30–36 mesi, soglie
NfL/GFAP per età semplificate, data “oggi” = 2026-06-10. Dettagli e scelte in
[ASSUMPTIONS.md](ASSUMPTIONS.md).

## ⛔ Limiti (onestà intellettuale)
- **Dati sintetici**, soglie **didattiche**: non sostituiscono cut-off validati né linee guida.
- **Nessuna performance clinica validata**; nessuna integrazione reale con cartella/PACS/LIS.
- Audit trail e ruoli sono **simulati lato client** a scopo dimostrativo (in produzione: server-side).
- Lo strumento è **decision support** (uomo-nel-loop): **non diagnostica e non decide**.
- La validazione reale (pilota a 1 centro, KPI, regolatorio) è descritta in [VALIDATION_KPI.md](VALIDATION_KPI.md).

## 📦 Requisiti
- Un browser moderno (Chrome/Firefox/Safari/Edge).
- **Python 3** solo per (ri)generare i dati o usare il server/LLM opzionali. Nessuna libreria esterna.

## 📄 Documenti
[PLAN.md](PLAN.md) · [ASSUMPTIONS.md](ASSUMPTIONS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[CLINICAL_LOGIC.md](CLINICAL_LOGIC.md) · [VALIDATION_KPI.md](VALIDATION_KPI.md) · [PITCH_OUTLINE.md](PITCH_OUTLINE.md)

---
*NeuroInflammation Copilot — Digital Neuro Hub 2026. Dati sintetici, prototipo non clinico, clinico al centro.*
