# ASSUMPTIONS.md

Assunzioni ragionevoli prese durante lo sviluppo del prototipo, per non bloccare il lavoro.
Tutte rivedibili. **Dati 100% sintetici, prototipo NON clinico.**

## Sfida e posizionamento
- Affrontiamo la **Sfida #2 "HCP Digital Copilot"** del NeuroHackathon DNH 2026 (assistente per il neurologo),
  declinata su **SM e malattie neuroinfiammatorie**. (Le altre 4 sfide sono fuori scope.)
- Utente primario: **neurologo del centro SM** e team multidisciplinare. Lingua dell'interfaccia e dei
  contenuti clinici: **italiano**; codice e commenti: **inglese**.

## Dati sintetici
- **14 pazienti** sintetici con coorte bilanciata di archetipi clinici (vedi `data/data_dictionary.md`).
- Orizzonte longitudinale: ~**30–36 mesi** con visite ~trimestrali; RMN ~annuali o all'attività;
  wearable aggregati settimanali. Date ancorate a "oggi" = **2026-06-10** (data dell'evento) e
  rese deterministiche dal seed (nessun uso di orologio di sistema nel generatore).
- **Seed fisso = 20260611** (data hackathon) per piena riproducibilità.
- **Biomarcatori digitali** (gait DMO, keystroke, fisiologici, sonno, attività, score compositi): catalogo
  sintetico con severità per paziente **derivata dalla traiettoria clinica** dell'archetipo; valori e device
  plausibili ma **dimostrativi**. Distinzione **evidence** (associazioni SM citate: gait/keystroke) vs **rationale**
  (cardiaco/respiratorio/sonno/attività: rilevante ma **non testato**, da validare); gli score proprietari (Sleep/
  Stress/Readiness, VO₂max) sono indici non interoperabili. Esposto trasparentemente nell'UI del neurologo.
- Valori di laboratorio (NfL, GFAP) in **pg/mL**, con soglie **aggiustate per età** plausibili ma
  semplificate (non sostituiscono cut-off di laboratorio validati). NfL "elevato" ~ percentile alto
  per età; GFAP associato a progressione.
- Scale: EDSS (0–10, passi 0.5), SDMT (punteggio grezzo, ~55 atteso, più basso = peggio),
  MFIS (0–84, più alto = più fatica), T25FW e 9-HPT in secondi, PHQ-9 (0–27), MSIS-29 (0–100 normalizzato).
- "Peggioramento confermato EDSS": semplificazione del criterio di conferma a ≥2 valutazioni distanti
  ≥3–6 mesi (qui approssimato sulla cadenza delle visite sintetiche).

## Logica clinica codificata
- Soglie e finestre temporali dei flag sono **esplicite e trasparenti** in `CLINICAL_LOGIC.md`.
  Sono valori **didattici/dimostrativi**, calibrati per rendere leggibile la demo, **non linee guida**.
- "Risposta subottimale" richiede attività in corso con **≥6–12 mesi** sullo stesso DMT.
- Pseudo-ricaduta: episodio di peggioramento transitorio associato a **caldo (Uhthoff)** o **infezione (es. IVU)/febbre**,
  modellato come evento dedicato distinto dalla ricaduta vera.

## App e tecnologia
- **Nessuna dipendenza di rete a runtime**: l'app gira aprendo `app/index.html` (file://) con dati embeddati.
  Niente framework, niente build, niente `node_modules`. Massima robustezza per la demo dal vivo.
- Sparkline e grafici disegnati con **SVG inline** (nessuna libreria di charting).
- **LLM live**: opzionale. Richiede `python3 app/serve.py` con `ANTHROPIC_API_KEY` (o `OPENAI_API_KEY`) in env.
  In assenza di chiave o di rete, l'app usa automaticamente i **riassunti di fallback** (curati o template).
  La demo di default **non** usa la rete.
- Browser target: qualunque browser moderno (Chrome/Firefox/Safari/Edge). Nessuna API sperimentale.

## Governance e sicurezza (simulati a scopo dimostrativo)
- **Audit trail** e ruoli utente sono **simulati lato client** (in memoria) per mostrare il concetto;
  in produzione risiederebbero server-side. Utente demo preconfigurato: *Dr. Demo* (neurologo).
- Classificazione regolatoria preliminare indicata come **Clinical Decision Support** (uomo-nel-loop),
  **non** software diagnostico autonomo — vedi `ARCHITECTURE.md`.

## Cosa NON è incluso (per scelta, fuori scope MVP)
- Nessuna integrazione reale con cartella clinica/PACS/LIS; nessun dato reale.
- Nessun modello di ML addestrato su dati reali; il "modello di rischio" è **a regole trasparenti**.
- Nessuna affermazione di performance clinica validata.
