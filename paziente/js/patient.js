/*
 * patient.js - UI controller for the Patient Companion ("L'app di Giulia").
 *
 * Closes the loop with the HCP copilot: what the patient logs here (rising fatigue,
 * missed doses, a heat-related bad day) is exactly what surfaces as flags on the
 * clinician side. Patient-friendly language; clinical jargon (EDSS/NfL) stays out.
 *
 * Screens: Oggi (home) · Diario (check-in) · Assistente (safe chat) · Andamenti (trends) · Visita.
 * Vanilla ES5, offline-first (reads window.MS_DATA), no framework.
 */

(function (global) {
  "use strict";

  var DATA = global.MS_DATA;

  // Demo profiles (default Giulia; a couple of contrasts to show different states).
  var PROFILES = ["MS-0142", "MS-0098", "MS-0166"];

  var S = {
    tab: "home",
    pid: "MS-0142",
    todayMood: null,        // 1..5
    todayDose: null,        // 'yes' | 'no'
    diary: [],              // session check-ins {fatigue, mood, cog, sleep, symptoms[], dose, note, date}
    extraFatigue: [],       // session-added fatigue points (0..10) for the trend overlay
    visitItems: [],         // strings to bring to the visit
    chat: [],               // {who:'bot'|'user', ...}
    chatStarted: false,
  };

  // ---- DOM helpers ----------------------------------------------------------------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function byId(id) { return document.getElementById(id); }

  var MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  function fmtDate(iso) { var p = iso.split("-"); return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0]; }
  function anchor() { return new Date(DATA.meta.generated_anchor_date + "T00:00:00"); }
  function daysFromAnchor(iso) { return Math.round((new Date(iso + "T00:00:00") - anchor()) / 86400000); }

  // ---- Icons ----------------------------------------------------------------------------
  var I = {
    home: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/>',
    diary: '<path d="M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    chart: '<path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"/>',
    visit: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 14l2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
    spark: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
    pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.5 8.2l4.5 6.6"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    moon: '<path d="M20 14a8 8 0 1 1-9-11 6 6 0 0 0 9 11z"/>',
    foot: '<path d="M9 19c-2 0-3-1.5-3-3 0-2 1-3 1-5S6 7 8 6s3 1 3 3-1 4-1 6 1 4-1 4z"/><circle cx="16" cy="8" r="1.4"/><circle cx="18" cy="11" r="1.2"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M4 12l16-7-7 16-2-7-7-2z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    arrow: '<path d="M9 5l7 7-7 7"/>',
    phone: '<path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-2 4.5 4.5 0 0 1 9 2c-2 4.5-9 9-9 9z"/>',
    leaf: '<path d="M5 19c0-8 6-13 14-13 0 8-6 13-14 13zM5 19c2-4 5-6 9-7"/>',
    alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  };
  function ic(name, size, cls) {
    var s = el("span", cls ? { class: cls } : {});
    s.style.display = "inline-flex";
    s.innerHTML = '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (I[name] || "") + "</svg>";
    return s;
  }
  function icHtml(name, size) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (I[name] || "") + "</svg>";
  }

  // ---- Minimal markdown (for the visit note) -------------------------------------------
  function mdToHtml(md) {
    var lines = md.split("\n"), out = [], i = 0;
    function inl(s) { return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"); }
    while (i < lines.length) {
      var t = lines[i].trim();
      if (t === "") { i++; continue; }
      if (t === "---") { out.push("<hr/>"); i++; continue; }
      if (t.slice(0, 3) === "## ") { out.push("<h2>" + inl(esc(t.slice(3))) + "</h2>"); i++; continue; }
      if (t.slice(0, 2) === "# ") { out.push("<h1>" + inl(esc(t.slice(2))) + "</h1>"); i++; continue; }
      if (t.slice(0, 2) === "> ") { out.push("<blockquote>" + inl(esc(t.slice(2))) + "</blockquote>"); i++; continue; }
      if (t.slice(0, 2) === "- ") { var b = []; while (i < lines.length && lines[i].trim().slice(0, 2) === "- ") { b.push("<li>" + inl(esc(lines[i].trim().slice(2))) + "</li>"); i++; } out.push("<ul>" + b.join("") + "</ul>"); continue; }
      out.push("<p>" + inl(esc(t)) + "</p>"); i++;
    }
    return out.join("\n");
  }

  // ---- Patient lens (clinical data -> friendly) ----------------------------------------
  function P() { var p = null; DATA.patients.forEach(function (x) { if (x.id === S.pid) p = x; }); return p; }
  function firstName() { return P().name.split(" ")[0]; }
  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }

  function fatigue10Series() {
    // MFIS (0-84) -> patient 0-10 "stanchezza" scale, plus any session check-ins.
    var base = P().timeline.mfis.map(function (x) { return { date: x.date, v: Math.round(x.value / 8.4 * 10) / 10 }; });
    S.extraFatigue.forEach(function (e) { base.push({ date: e.date, v: e.v }); });
    return base;
  }
  function stepsSeries() { return P().timeline.wearable.map(function (w) { return { date: w.date, v: w.steps }; }); }
  function sleepSeries() { return P().timeline.wearable.map(function (w) { return { date: w.date, v: w.sleep_hours }; }); }

  function adherence() { return P().adherence; }
  function dmtName() { return P().current_dmt.klass === "nessuno" ? null : P().current_dmt.drug; }
  function hadHeatFlare() {
    return (P().timeline.relapses || []).some(function (r) {
      return r.type === "pseudo_relapse_suspected" && r.trigger === "caldo" && daysFromAnchor(r.date) >= -120;
    });
  }
  function fatigueRising() {
    var m = P().timeline.mfis.map(function (x) { return x.value; });
    if (m.length < 4) return false;
    return mean(m.slice(-2)) - mean(m.slice(0, 2)) >= 8;
  }
  function chatCtx() {
    return { firstName: firstName(), dmt: dmtName(), hadHeatFlare: hadHeatFlare(), fatigueRising: fatigueRising() };
  }
  function nextAppointment() {
    var future = (P().monitoring || []).map(function (m) { return m.due_date; })
      .filter(function (d) { return daysFromAnchor(d) >= 0; }).sort();
    if (future.length) return future[0];
    return new Date(anchor().getTime() + 21 * 86400000).toISOString().slice(0, 10);
  }
  function todayIso() {
    // "today" in the demo = a few days after the most recent wearable week (kept deterministic-ish)
    return DATA.meta.generated_anchor_date;
  }

  // ---- Sparkline ------------------------------------------------------------------------
  function spark(values, opts) {
    opts = opts || {};
    var w = 320, h = 56, pad = 5;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (max - min < 1e-9) max = min + 1;
    function x(i) { return pad + (w - 2 * pad) * (values.length === 1 ? 0.5 : i / (values.length - 1)); }
    function y(v) { return h - pad - (h - 2 * pad) * (v - min) / (max - min); }
    var col = opts.color || "var(--brand)";
    var id = "pg" + Math.round(values.reduce(function (s, v) { return s + v; }, values.length) * 100) % 100000;
    var line = values.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
    var area = line + " L" + x(values.length - 1).toFixed(1) + " " + (h - pad) + " L" + x(0).toFixed(1) + " " + (h - pad) + " Z";
    var s = '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">';
    s += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".18"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>';
    s += '<path d="' + area + '" fill="url(#' + id + ')"/>';
    s += '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
    s += '<circle cx="' + x(values.length - 1).toFixed(1) + '" cy="' + y(values[values.length - 1]).toFixed(1) + '" r="3.4" fill="' + col + '"/>';
    if (opts.markLast) s += '<circle cx="' + x(values.length - 1).toFixed(1) + '" cy="' + y(values[values.length - 1]).toFixed(1) + '" r="6.5" fill="none" stroke="' + col + '" stroke-width="1.5" opacity=".5"/>';
    s += "</svg>";
    return s;
  }

  // ======================================================================================
  // SCREEN: HOME (Oggi)
  // ======================================================================================
  function screenHome() {
    var wrap = el("div", { class: "wrap" });

    // mood hero
    var hero = el("div", { class: "hero" });
    hero.appendChild(el("div", { class: "h-q" }, ["Come ti senti oggi?"]));
    hero.appendChild(el("div", { class: "h-s" }, ["Un attimo per fare il punto. Bastano pochi tap."]));
    var faces = ["😣", "🙁", "😐", "🙂", "😄"];
    var moods = el("div", { class: "moods" });
    faces.forEach(function (f, i) {
      moods.appendChild(el("button", {
        class: "mood" + (S.todayMood === i + 1 ? " sel" : ""), "aria-label": "umore " + (i + 1),
        onclick: function () { S.todayMood = i + 1; render(); },
      }, [f]));
    });
    hero.appendChild(moods);
    hero.appendChild(el("div", { class: "mood-lbls" }, [el("span", {}, ["Giornata dura"]), el("span", {}, ["Alla grande"])]));
    wrap.appendChild(hero);

    // loop callout (the demo punchline, gentle)
    wrap.appendChild(el("div", { class: "loop" }, [
      el("span", { html: icHtml("heart", 22) }),
      el("div", {}, [
        el("div", { class: "lt" }, ["Tra una visita e l'altra non sei sola"]),
        el("div", { class: "ls" }, ["Quello che annoti qui aiuta il tuo team del Centro SM a seguirti meglio."]),
      ]),
    ]));

    // therapy reminder
    var dmt = dmtName();
    if (dmt) {
      var med = el("div", { class: "card" });
      med.appendChild(el("h3", {}, ["La tua terapia di oggi"]));
      med.appendChild(el("div", { class: "row", style: "padding-top:8px;border-bottom:none" }, [
        el("span", { class: "ric green", html: icHtml("pill", 21) }),
        el("div", { class: "rmain" }, [
          el("div", { class: "rt" }, [dmt]),
          el("div", { class: "rs" }, ["Hai preso la dose di oggi?"]),
        ]),
      ]));
      var dose = el("div", { class: "dose" });
      dose.appendChild(el("button", { class: "yes" + (S.todayDose === "yes" ? " sel" : ""),
        onclick: function () { S.todayDose = "yes"; render(); } }, [el("span", { html: icHtml("check", 17) }), "Sì, presa"]));
      dose.appendChild(el("button", { class: "no" + (S.todayDose === "no" ? " sel" : ""),
        onclick: function () { S.todayDose = "no"; addVisit("Ho saltato qualche dose della terapia"); toast("Annotato. Nessun problema — ne parliamo alla visita."); render(); } }, [el("span", { html: icHtml("x", 17) }), "Non ancora"]));
      med.appendChild(dose);
      wrap.appendChild(med);
    }

    // next appointment
    var appt = el("div", { class: "card" });
    appt.appendChild(el("div", { class: "row", style: "padding:2px 0;border-bottom:none" }, [
      el("span", { class: "ric blue", html: icHtml("cal", 21) }),
      el("div", { class: "rmain" }, [
        el("div", { class: "rt" }, ["Prossimo controllo"]),
        el("div", { class: "rs" }, [fmtDate(nextAppointment()) + " · Centro SM"]),
      ]),
      el("button", { class: "rgo", html: icHtml("arrow", 18), "aria-label": "vai alla visita", onclick: function () { goTab("visita"); } }),
    ]));
    wrap.appendChild(appt);

    // contextual heat nudge (personalized to Giulia's recent flare)
    if (hadHeatFlare()) {
      wrap.appendChild(el("div", { class: "card flat" }, [
        el("div", { class: "row", style: "padding:2px 0;border-bottom:none" }, [
          el("span", { class: "ric warm", html: icHtml("sun", 21) }),
          el("div", { class: "rmain" }, [
            el("div", { class: "rt" }, ["Il caldo ti dà fastidio?"]),
            el("div", { class: "rs" }, ["Hai segnalato un episodio col caldo. Vuoi qualche consiglio?"]),
          ]),
          el("button", { class: "rgo", html: icHtml("arrow", 18), "aria-label": "chiedi all'assistente",
            onclick: function () { goTab("assistente"); setTimeout(function () { sendUser("Peggioro con il caldo"); }, 220); } }),
        ]),
      ]));
    }

    // CTA: daily check-in
    wrap.appendChild(el("button", { class: "pbtn pri", style: "margin-top:4px",
      onclick: function () { goTab("diario"); } }, [ic("diary", 18), "Fai il check-in di oggi"]));

    wrap.appendChild(el("div", { class: "disc" }, ["Strumento informativo · dati 100% sintetici · non sostituisce il medico."]));
    return wrap;
  }

  // ======================================================================================
  // SCREEN: DIARIO (check-in)
  // ======================================================================================
  function screenDiario() {
    var wrap = el("div", { class: "wrap" });
    var form = { fatigue: null, mood: S.todayMood, cog: null, sleep: null, symptoms: [], dose: S.todayDose, note: "" };

    function seg(label, hint, values, key, lbls) {
      var f = el("div", { class: "field" });
      f.appendChild(el("label", {}, [label]));
      if (hint) f.appendChild(el("div", { class: "hint" }, [hint]));
      var sc = el("div", { class: "scale" });
      values.forEach(function (v) {
        sc.appendChild(el("button", { onclick: function (e) {
          form[key] = v;
          sc.querySelectorAll("button").forEach(function (b) { b.classList.remove("sel"); });
          e.target.classList.add("sel");
        } }, [String(v)]));
      });
      f.appendChild(sc);
      if (lbls) f.appendChild(el("div", { class: "scale-lbls" }, [el("span", {}, [lbls[0]]), el("span", {}, [lbls[1]])]));
      return f;
    }

    wrap.appendChild(seg("Quanta stanchezza oggi?", "0 = nessuna · 10 = moltissima", [0, 2, 4, 6, 8, 10], "fatigue", ["Nessuna", "Moltissima"]));

    // mood faces (reuse selection)
    var fm = el("div", { class: "field" });
    fm.appendChild(el("label", {}, ["Com'è il tuo umore?"]));
    var mm = el("div", { class: "scale" });
    ["😣", "🙁", "😐", "🙂", "😄"].forEach(function (face, i) {
      mm.appendChild(el("button", { style: "font-size:20px", onclick: function (e) {
        form.mood = i + 1; mm.querySelectorAll("button").forEach(function (b) { b.classList.remove("sel"); }); e.target.classList.add("sel");
      } }, [face]));
    });
    fm.appendChild(mm);
    wrap.appendChild(fm);

    wrap.appendChild(seg("Concentrazione / memoria", "Come è andata la testa oggi?", [0, 2, 4, 6, 8, 10], "cog", ["Difficile", "Lucida"]));
    wrap.appendChild(seg("Ore di sonno", "Quanto hai dormito?", [4, 5, 6, 7, 8, 9], "sleep", ["Poco", "Tanto"]));

    // symptoms multi-select (some are "watch" symptoms -> gentle escalation)
    var fs = el("div", { class: "field" });
    fs.appendChild(el("label", {}, ["Hai notato qualcosa oggi?"]));
    fs.appendChild(el("div", { class: "hint" }, ["Tocca tutto quello che senti. Niente è banale."]));
    var chips = el("div", { class: "chips" });
    var SYM = [
      { k: "formicolii", l: "Formicolii", watch: false },
      { k: "dolore", l: "Dolore", watch: false },
      { k: "vescica", l: "Vescica", watch: false },
      { k: "vista", l: "Disturbi della vista", watch: true },
      { k: "equilibrio", l: "Equilibrio / cammino", watch: true },
      { k: "forza", l: "Meno forza", watch: true },
      { k: "parola", l: "Parlare / capire le parole", watch: true },
      { k: "nulla", l: "Niente di particolare", watch: false },
    ];
    SYM.forEach(function (sym) {
      chips.appendChild(el("button", { class: "chipx" + (sym.watch ? " flagwatch" : ""), onclick: function (e) {
        var idx = form.symptoms.indexOf(sym.k);
        if (idx >= 0) { form.symptoms.splice(idx, 1); e.target.classList.remove("sel"); }
        else { form.symptoms.push(sym.k); e.target.classList.add("sel"); }
      } }, [sym.l]));
    });
    fs.appendChild(chips);
    wrap.appendChild(fs);

    // note
    var fn = el("div", { class: "field" });
    fn.appendChild(el("label", {}, ["Vuoi dire qualcosa al tuo neurologo?"]));
    var ta = el("textarea", { class: "pf", placeholder: "Scrivi pure… (facoltativo)" });
    fn.appendChild(ta);
    wrap.appendChild(fn);

    wrap.appendChild(el("button", { class: "pbtn pri", onclick: function () {
      form.note = ta.value.trim();
      saveCheckin(form);
    } }, [ic("check", 18), "Salva il check-in"]));

    wrap.appendChild(el("div", { class: "disc" }, ["Le tue risposte restano sul dispositivo (demo) e ti aiutano a preparare la visita."]));
    return wrap;
  }

  function saveCheckin(form) {
    var date = todayIso();
    S.diary.unshift({ date: date, fatigue: form.fatigue, mood: form.mood, cog: form.cog, sleep: form.sleep, symptoms: form.symptoms.slice(), dose: form.dose, note: form.note });
    if (typeof form.fatigue === "number") S.extraFatigue.push({ date: date, v: form.fatigue });
    if (form.note) addVisit("Nota personale: " + form.note);
    var watch = form.symptoms.filter(function (k) { return ["vista", "equilibrio", "forza", "parola"].indexOf(k) >= 0; });
    if (watch.length) addVisit("Sintomo da non rimandare segnalato nel diario");

    // Confirmation screen
    var view = byId("screen-inner");
    clear(view);
    var wrap = el("div", { class: "wrap" });
    wrap.appendChild(el("div", { class: "saved" }, [
      ic("check", 22),
      el("div", {}, [
        el("div", { class: "st" }, ["Check-in salvato, grazie!"]),
        el("div", { class: "ss" }, ["L'ho aggiunto ai tuoi andamenti e al promemoria per la visita."]),
      ]),
    ]));

    if (watch.length) {
      wrap.appendChild(el("div", { class: "escal urgent", style: "margin-top:13px" }, [
        el("div", { class: "eh" }, [ic("alert", 19), "Un sintomo da non rimandare"]),
        el("div", { class: "ed" }, ["Hai segnalato un disturbo di vista, equilibrio, forza o parola. Se è nuovo o dura più di 24 ore, è meglio farlo valutare dal tuo Centro SM. " +
          "Il diario non è un canale di emergenza: se un sintomo è improvviso e grave (non riesci a parlare, un lato del corpo cede, fatichi a respirare), chiama il 112."]),
        el("div", { class: "eacts" }, [
          el("button", { class: "ecall amber", html: icHtml("phone", 16) + " Contatta il Centro SM", onclick: function () { openSheet("contatti"); } }),
          el("button", { class: "ecall ghost", onclick: function () { openSheet("contatti"); } }, ["Quando preoccuparsi"]),
        ]),
      ]));
    }

    wrap.appendChild(el("button", { class: "pbtn sec", style: "margin-top:14px", onclick: function () { goTab("andamenti"); } }, [ic("chart", 18), "Vedi i tuoi andamenti"]));
    wrap.appendChild(el("button", { class: "pbtn ghost", style: "margin-top:9px", onclick: function () { goTab("visita"); } }, [ic("visit", 18), "Prepara la visita"]));
    view.appendChild(wrap);
  }

  // ======================================================================================
  // SCREEN: ANDAMENTI (trends, friendly)
  // ======================================================================================
  function trendCard(iconName, iconCls, name, series, opts) {
    opts = opts || {};
    var vals = series.map(function (s) { return s.v; });
    var latest = vals[vals.length - 1];
    var base = mean(vals.slice(0, Math.min(3, vals.length)));
    var recent = mean(vals.slice(-3));
    var delta = recent - base;
    var dir = Math.abs(delta) < (opts.eps || 0.3) ? "flat" : (delta > 0 ? "up" : "down");
    var worsening = opts.worseUp ? dir === "up" : dir === "down";
    var nowCls = dir === "flat" ? "flat" : (worsening ? "up" : "good");
    var arrow = dir === "flat" ? "→" : (dir === "up" ? "↑" : "↓");
    var col = worsening ? "var(--warm)" : (dir === "flat" ? "var(--mut2)" : "var(--brand)");

    var c = el("div", { class: "trendc" });
    c.appendChild(el("div", { class: "tt" }, [
      el("span", { class: "tic " + iconCls, html: icHtml(iconName, 18) }),
      el("span", { class: "tname" }, [name]),
      el("span", { class: "tnow " + nowCls }, [arrow + " " + opts.fmt(latest)]),
    ]));
    c.appendChild(el("div", { html: spark(vals, { color: col, markLast: !!opts.markLast }) }));
    c.appendChild(el("div", { class: "tmsg" }, [opts.msg(dir, worsening)]));
    return c;
  }

  function screenAndamenti() {
    var wrap = el("div", { class: "wrap" });
    wrap.appendChild(el("div", { class: "card flat", style: "background:var(--brand-tint);border-color:#d4e8df" }, [
      el("div", { style: "font-size:13.5px;color:var(--ink-2)" , html:
        "Questi sono <strong>i tuoi andamenti</strong> delle ultime settimane. Servono a te e al tuo team per capire come stai cambiando — non a spaventarti. Parlane sempre alla visita." }),
    ]));

    wrap.appendChild(trendCard("bolt", "warm", "Stanchezza", fatigue10Series(), {
      worseUp: true, eps: 0.4, markLast: S.extraFatigue.length > 0,
      fmt: function (v) { return (Math.round(v * 10) / 10) + "/10"; },
      msg: function (dir, w) {
        if (S.extraFatigue.length) return "Il cerchietto è il tuo check-in di oggi: ottimo, così il quadro è aggiornato.";
        return w ? "Negli ultimi tempi la stanchezza è un po' aumentata. È una cosa utile da raccontare al neurologo." : "Andamento stabile. Continua a monitorarla.";
      },
    }));

    wrap.appendChild(trendCard("foot", "green", "Movimento (passi/giorno)", stepsSeries(), {
      worseUp: false, eps: 200,
      fmt: function (v) { return Math.round(v) + ""; },
      msg: function (dir, w) { return w ? "Ti stai muovendo un po' meno: nessun giudizio, può dipendere dalla stanchezza. Vale la pena dirlo alla visita." : "Buon livello di attività, continua così con i tuoi tempi."; },
    }));

    wrap.appendChild(trendCard("moon", "blue", "Sonno (ore)", sleepSeries(), {
      worseUp: false, eps: 0.3,
      fmt: function (v) { return (Math.round(v * 10) / 10) + "h"; },
      msg: function (dir, w) { return w ? "Stai dormendo un po' meno: curare il sonno aiuta anche stanchezza e umore." : "Sonno nella norma. Ottimo."; },
    }));

    // "Dal tuo dispositivo" — friendly consumer-wearable tiles (no clinical/research metrics,
    // no alarming language: this is the patient's calm view).
    var dev = deviceCard();
    if (dev) wrap.appendChild(dev);

    wrap.appendChild(el("div", { class: "disc" }, ["Indicatori semplificati a scopo dimostrativo (dati sintetici). Gli esami clinici li segue il tuo Centro SM."]));
    return wrap;
  }

  function dbioMetric(domKey, metricKey) {
    var dbio = P().timeline.digital_biomarkers || [];
    var dom = null; dbio.forEach(function (d) { if (d.key === domKey) dom = d; });
    if (!dom) return null;
    var m = null; dom.metrics.forEach(function (x) { if (x.key === metricKey) m = x; });
    return m;
  }

  function deviceCard() {
    var picks = [
      { dom: "composite", key: "readiness_score", icon: "heart", cls: "green", label: "Recupero", suffix: "" },
      { dom: "sleep", key: "sleep_score", icon: "moon", cls: "blue", label: "Qualità sonno", suffix: "" },
      { dom: "cardiac", key: "resting_hr", icon: "bolt", cls: "warm", label: "Battito a riposo", suffix: "" },
      { dom: "activity", key: "azm", icon: "foot", cls: "green", label: "Minuti attivi", suffix: "" },
    ];
    var tiles = picks.map(function (pk) { return { pk: pk, m: dbioMetric(pk.dom, pk.key) }; })
      .filter(function (t) { return t.m; });
    if (!tiles.length) return null;

    var card = el("div", { class: "trendc" });
    card.appendChild(el("div", { class: "tt", style: "margin-bottom:4px" }, [
      el("span", { class: "tic green", html: icHtml("foot", 18) }),
      el("span", { class: "tname" }, ["Dal tuo dispositivo"]),
    ]));
    card.appendChild(el("div", { class: "tmsg", style: "margin-bottom:10px" },
      ["Dati dal tuo wearable. Sono indicazioni di benessere — non una diagnosi."]));
    var grid = el("div", { class: "dev-grid" });
    tiles.forEach(function (t) {
      var vals = t.m.series.map(function (x) { return x.value; });
      var tile = el("div", { class: "dev-tile" });
      tile.appendChild(el("div", { class: "dev-ic " + t.pk.cls, html: icHtml(t.pk.icon, 17) }));
      tile.appendChild(el("div", { class: "dev-v" }, [String(t.m.latest) + (t.m.unit === "%" || /\/100/.test(t.m.unit) ? "" : "")]));
      tile.appendChild(el("div", { class: "dev-l" }, [t.pk.label]));
      tile.appendChild(el("div", { class: "dev-sp", html: spark(vals, { color: "var(--brand)" }) }));
      grid.appendChild(tile);
    });
    card.appendChild(grid);
    return card;
  }

  // ======================================================================================
  // SCREEN: VISITA (prepare for the visit)
  // ======================================================================================
  function buildVisitNote() {
    var p = P(), name = firstName();
    var lines = ["# Promemoria per la visita", "*Da portare al tuo neurologo · " + fmtDate(nextAppointment()) + "*", "",
      "> Questo riepilogo nasce da ciò che hai annotato nell'app. Lo rivedrai insieme al tuo medico.", "",
      "## Come sono stata/o dall'ultima volta"];
    var bullets = [];
    if (fatigueRising()) bullets.push("La **stanchezza** è aumentata rispetto a prima.");
    var sd = p.timeline.sdmt;
    if (sd.length >= 3 && mean(sd.slice(0, 2).map(function (x) { return x.value; })) - mean(sd.slice(-2).map(function (x) { return x.value; })) >= 4)
      bullets.push("Ho notato più fatica con **memoria e concentrazione**.");
    if (adherence().recent_pct < 85 || S.todayDose === "no") bullets.push("Mi è capitato di **saltare qualche dose** della terapia.");
    if (hadHeatFlare()) bullets.push("Ho avuto un **peggioramento col caldo** che poi è passato.");
    var steps = stepsSeries().map(function (s) { return s.v; });
    if (steps.length >= 6 && mean(steps.slice(0, 3)) - mean(steps.slice(-3)) >= 800) bullets.push("Mi sto **muovendo un po' meno** del solito.");
    if (!bullets.length) bullets.push("Nel complesso le cose sono andate abbastanza stabili.");
    bullets.forEach(function (b) { lines.push("- " + b); });

    lines.push("", "## Domande che voglio fare");
    var qs = [];
    if (fatigueRising()) qs.push("Cosa posso fare per la stanchezza?");
    if (hadHeatFlare()) qs.push("Come distinguo un peggioramento dal caldo da una ricaduta vera?");
    if (adherence().recent_pct < 85 || S.todayDose === "no") qs.push("Come posso ricordarmi meglio la terapia?");
    qs.push("Devo fare esami o controlli prima della prossima volta?");
    qs.forEach(function (q) { lines.push("- " + q); });

    var extra = S.visitItems.filter(function (v) { return !/Nota personale/.test(v); });
    var notes = S.visitItems.filter(function (v) { return /Nota personale/.test(v); });
    if (extra.length) { lines.push("", "## Altri punti che ho segnato"); extra.forEach(function (v) { lines.push("- " + v); }); }
    if (notes.length) { lines.push("", "## Le mie note"); notes.forEach(function (v) { lines.push("- " + v.replace("Nota personale: ", "“") + "”"); }); }

    lines.push("", "---", "*Promemoria personale generato dall'app su dati sintetici. Da condividere con il clinico.*");
    return lines.join("\n");
  }

  function screenVisita() {
    var wrap = el("div", { class: "wrap" });

    wrap.appendChild(el("div", { class: "card" }, [
      el("div", { class: "row", style: "padding:2px 0;border-bottom:none" }, [
        el("span", { class: "ric blue", html: icHtml("cal", 21) }),
        el("div", { class: "rmain" }, [
          el("div", { class: "rt" }, ["Prossima visita"]),
          el("div", { class: "rs" }, [fmtDate(nextAppointment()) + " · Centro Sclerosi Multipla"]),
        ]),
      ]),
    ]));

    // visit items checklist
    var card = el("div", { class: "card" });
    card.appendChild(el("h3", {}, ["Da non dimenticare"]));
    card.appendChild(el("div", { class: "sub", style: "margin-bottom:8px" }, ["Punti raccolti dai tuoi check-in e dall'assistente."]));
    if (!S.visitItems.length) {
      card.appendChild(el("div", { class: "vempty" }, ["Ancora niente in lista. Fai un check-in o chiedi all'assistente: aggiungerò qui le cose importanti."]));
    } else {
      var ul = el("ul", { class: "vlist" });
      S.visitItems.forEach(function (v) {
        ul.appendChild(el("li", { class: "vitem" }, [
          el("span", { class: "vck", html: icHtml("check", 14) }),
          el("div", {}, [el("div", { class: "vtx" }, [v.replace("Nota personale: ", "")]), el("div", { class: "vtag" }, [/Nota personale/.test(v) ? "la tua nota" : "da raccontare al medico"])]),
        ]));
      });
      card.appendChild(ul);
    }
    wrap.appendChild(card);

    wrap.appendChild(el("button", { class: "pbtn pri", id: "btn-note",
      onclick: function () { genVisitNote(); } }, [ic("spark", 18), "Genera il promemoria per la visita"]));
    wrap.appendChild(el("div", { id: "note-mount" }));

    wrap.appendChild(el("div", { class: "loop", style: "margin-top:13px" }, [
      el("span", { html: icHtml("shield", 22) }),
      el("div", {}, [
        el("div", { class: "lt" }, ["Condiviso in sicurezza"]),
        el("div", { class: "ls" }, ["Con il tuo consenso, ciò che annoti può arrivare al Centro SM per la continuità delle cure."]),
      ]),
    ]));
    return wrap;
  }

  function genVisitNote() {
    var mount = byId("note-mount");
    clear(mount);
    var btn = byId("btn-note");
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pspin"></span> Preparo il promemoria…'; }
    setTimeout(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = ""; btn.appendChild(ic("spark", 18)); btn.appendChild(document.createTextNode("Rigenera promemoria")); }
      var note = buildVisitNote();
      var card = el("div", { class: "card visit-note", style: "margin-top:13px" }, [el("div", { class: "md", html: mdToHtml(note) })]);
      var acts = el("div", { style: "display:flex;gap:8px;margin-top:8px" }, [
        el("button", { class: "pbtn ghost mini", onclick: function (e) {
          if (navigator.clipboard) navigator.clipboard.writeText(note);
          var b = e.target.closest("button"); var o = b.textContent; b.textContent = "Copiato ✓"; setTimeout(function () { b.textContent = o; }, 1200);
        } }, ["Copia"]),
        el("button", { class: "pbtn ghost mini", onclick: function () { window.print(); } }, ["Stampa / PDF"]),
      ]);
      mount.appendChild(card); mount.appendChild(acts);
      toast("Promemoria pronto. Portalo (anche a voce) alla visita!");
    }, 360);
  }

  // ======================================================================================
  // SCREEN: ASSISTENTE (safe chat)
  // ======================================================================================
  function screenAssistente() {
    var chat = el("div", { class: "chatwrap" });
    chat.appendChild(el("div", { class: "safebar" }, [
      el("span", { html: icHtml("shield", 18) }),
      el("div", { html: "Sono un <b>assistente informativo</b>, non un medico: niente diagnosi né terapie. " +
        "Per sintomi gravi o improvvisi, contatta il <b>Centro SM</b> o il <b>112</b>." }),
    ]));

    if (!S.chatStarted) {
      S.chat = [{ who: "bot", res: { bubbles: [
        "Ciao " + firstName() + ", sono il tuo assistente tra una visita e l'altra.",
        "Posso darti informazioni generali, aiutarti a gestire la giornata e a preparare la visita. Da cosa partiamo?",
      ] } }];
      S.chatStarted = true;
    }

    var thread = el("div", { class: "thread", id: "thread" });
    chat.appendChild(thread);

    var quick = el("div", { class: "quick" });
    PatientChat.suggestions.forEach(function (q) {
      quick.appendChild(el("button", { class: "qchip", onclick: function () { sendUser(q); } }, [q]));
    });
    chat.appendChild(quick);

    var comp = el("div", { class: "composer" });
    var input = el("input", { id: "chat-input", type: "text", placeholder: "Scrivi un messaggio…", autocomplete: "off",
      onkeydown: function (e) { if (e.key === "Enter") { var v = e.target.value.trim(); if (v) { e.target.value = ""; sendUser(v); } } } });
    comp.appendChild(el("button", { class: "cmic", title: "Comandi vocali (in arrivo)", "aria-label": "voce", disabled: "disabled", html: icHtml("mic", 19) }));
    comp.appendChild(input);
    comp.appendChild(el("button", { class: "csend", "aria-label": "invia", html: icHtml("send", 20),
      onclick: function () { var v = input.value.trim(); if (v) { input.value = ""; sendUser(v); } } }));
    chat.appendChild(comp);

    setTimeout(function () { renderThread(); }, 0);
    return chat;
  }

  function renderThread() {
    var thread = byId("thread");
    if (!thread) return;
    clear(thread);
    S.chat.forEach(function (m) {
      if (m.who === "user") {
        thread.appendChild(el("div", { class: "msg user" }, [el("div", { class: "bub" }, [m.text])]));
        return;
      }
      var res = m.res;
      var wrap = el("div", { class: "msg bot" });
      (res.bubbles || []).forEach(function (b, i) {
        var box = el("div", { class: "bub", html: b });
        wrap.appendChild(box);
        if (i === res.bubbles.length - 1 && res.safenote) {
          wrap.appendChild(el("div", { class: "safenote" }, [ic("info", 13), res.safenote]));
        }
      });
      thread.appendChild(wrap);

      if (res.escalation) thread.appendChild(escalCard(res.escalation));
      if (res.addToVisit) {
        var added = S.visitItems.indexOf(res.addToVisit) >= 0;
        var btn = el("button", { class: "addvisit" + (added ? " done" : ""), onclick: function () {
          if (S.visitItems.indexOf(res.addToVisit) < 0) { addVisit(res.addToVisit); btn.className = "addvisit done"; btn.innerHTML = icHtml("check", 15) + " Aggiunto alla visita"; toast("Aggiunto al promemoria per la visita."); }
        } });
        btn.innerHTML = added ? icHtml("check", 15) + " Aggiunto alla visita" : icHtml("visit", 15) + " Aggiungi alla visita";
        thread.appendChild(btn);
      }
    });
    if (S._typing) {
      thread.appendChild(el("div", { class: "msg bot" }, [el("div", { class: "bub", style: "padding:6px 8px" }, [el("span", { class: "typing", html: "<i></i><i></i><i></i>" })])]));
    }
    var sc = byId("thread");
    setTimeout(function () { if (sc) sc.scrollTop = sc.scrollHeight; }, 0);
  }

  function escalCard(e) {
    var card = el("div", { class: "escal " + (e.level === "emerg" ? "emerg" : "urgent") });
    card.appendChild(el("div", { class: "eh" }, [ic("alert", 19), e.title]));
    card.appendChild(el("div", { class: "ed" }, [e.detail]));
    var acts = el("div", { class: "eacts" });
    e.actions.forEach(function (a) {
      if (a.tel) {
        acts.appendChild(el("a", { class: "ecall " + a.kind, href: "tel:" + a.tel }, [ic("phone", 16), a.label]));
      } else {
        acts.appendChild(el("button", { class: "ecall " + a.kind, onclick: function () { openSheet("contatti"); } },
          [a.kind !== "ghost" ? ic("phone", 16) : null, a.label]));
      }
    });
    card.appendChild(acts);
    return card;
  }

  function sendUser(text) {
    if (S.tab !== "assistente") { goTab("assistente"); }
    S.chat.push({ who: "user", text: text });
    renderThread();
    var res = PatientChat.respond(text, chatCtx());
    S._typing = true; renderThread();
    var ctx = chatCtx();
    // For unmatched questions, optionally try the constrained live LLM before falling back.
    var pending = (res.kind === "fallback") ? PatientChat.liveAnswer(text, ctx) : Promise.resolve(null);
    pending.then(function (live) {
      setTimeout(function () {
        S._typing = false;
        if (live) {
          // The live LLM only fires on unmatched messages. Re-run the deterministic safety
          // net over BOTH the user input and the generated text, so an escalation card still
          // appears if either contains a red flag (defense in depth).
          var recheckIn = PatientChat.respond(text, ctx);
          var recheckOut = PatientChat.respond(live, ctx);
          var esc = (recheckIn.escalation) || (recheckOut.escalation) || null;
          res = {
            bubbles: [live.replace(/\n/g, "<br>")],
            escalation: esc,
            safenote: "Risposta informativa generata dall'AI · non è una diagnosi. Per qualsiasi sintomo nuovo o che ti preoccupa, il riferimento resta il tuo Centro SM.",
            kind: "live",
          };
        }
        S.chat.push({ who: "bot", res: res });
        renderThread();
      }, live ? 0 : 480);
    });
  }

  // ======================================================================================
  // VISIT ITEMS / TOAST / SHEETS
  // ======================================================================================
  function addVisit(s) { if (S.visitItems.indexOf(s) < 0) S.visitItems.push(s); updateBadges(); }

  var toastTimer = null;
  function toast(msg) {
    var t = byId("toast"); t.textContent = msg; t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  function openSheet(kind) {
    var ov = byId("sheet-ov"), body = byId("sheet-body");
    clear(body);
    body.appendChild(el("div", { class: "grip" }));
    if (kind === "contatti") sheetContatti(body);
    else if (kind === "limiti") sheetLimiti(body);
    else if (kind === "profilo") sheetProfilo(body);
    else if (kind === "info") sheetInfo(body);
    ov.classList.add("open");
  }
  function closeSheet() { byId("sheet-ov").classList.remove("open"); }

  function sheetContatti(body) {
    body.appendChild(el("h2", {}, ["Quando contattare"]));
    body.appendChild(el("p", { class: "danger" }, ["Chiama il 112 subito se: difficoltà a respirare, dolore al petto, viso/braccio che cedono da un lato, difficoltà a parlare, una convulsione."]));
    body.appendChild(el("a", { class: "contact-row emerg", href: "tel:112" }, [
      el("span", { class: "cic", html: icHtml("phone", 21) }),
      el("div", {}, [el("div", { class: "ct" }, ["Emergenze · 112"]), el("div", { class: "cs" }, ["Numero unico di emergenza"])]),
    ]));
    body.appendChild(el("a", { class: "contact-row center", href: "tel:0000000000" }, [
      el("span", { class: "cic", html: icHtml("heart", 21) }),
      el("div", {}, [el("div", { class: "ct" }, ["Centro SM (demo)"]), el("div", { class: "cs" }, ["Segreteria e ambulatorio · numero dimostrativo"])]),
    ]));
    body.appendChild(el("h4", {}, ["Contatta il Centro SM (entro 24h) se noti…"]));
    body.appendChild(el("ul", {}, [
      el("li", {}, ["un sintomo nuovo (vista, forza, sensibilità, equilibrio, parola) che dura più di 24 ore;"]),
      el("li", {}, ["difficoltà improvvise a urinare o a trattenere;"]),
      el("li", {}, ["febbre o infezione con peggioramento dei sintomi neurologici;"]),
      el("li", {}, ["effetti collaterali importanti o persistenti della terapia."]),
    ]));
    body.appendChild(el("h4", {}, ["Da annotare e dire alla prossima visita"]));
    body.appendChild(el("ul", {}, [
      el("li", {}, ["stanchezza, memoria/concentrazione, umore o sonno che cambiano;"]),
      el("li", {}, ["fastidi col caldo che poi migliorano;"]),
      el("li", {}, ["dosi dimenticate o dubbi sulla terapia."]),
    ]));
    body.appendChild(el("div", { class: "disc", style: "text-align:left;padding:12px 0 0" }, ["Numeri dimostrativi. In un uso reale qui ci sarebbero i recapiti del tuo centro."]));
  }
  function sheetLimiti(body) {
    var L = PatientChat.LIMITS;
    body.appendChild(el("h2", {}, [L.title]));
    body.appendChild(el("h4", {}, ["Posso aiutarti a…"]));
    var ok = el("ul", {}); L.can.forEach(function (x) { ok.appendChild(el("li", {}, [x])); }); body.appendChild(ok);
    body.appendChild(el("h4", {}, ["Non posso…"]));
    var no = el("ul", {}); L.cannot.forEach(function (x) { no.appendChild(el("li", {}, [x])); }); body.appendChild(no);
    body.appendChild(el("div", { class: "disc", style: "text-align:left;padding:12px 0 0" }, ["Le informazioni sono educative e non sostituiscono il parere del tuo medico."]));
  }
  function sheetProfilo(body) {
    body.appendChild(el("h2", {}, ["Profilo demo"]));
    body.appendChild(el("p", {}, ["Cambia il paziente sintetico per vedere come l'app si adatta a situazioni diverse."]));
    var pick = el("div", { class: "profile-pick" });
    PROFILES.forEach(function (id) {
      var p = null; DATA.patients.forEach(function (x) { if (x.id === id) p = x; });
      var labels = { "MS-0142": "caso flagship: segnali in aumento", "MS-0098": "stabile e sereno (NEDA-3)", "MS-0166": "sintomi invisibili in aumento" };
      pick.appendChild(el("button", { class: S.pid === id ? "sel" : "", onclick: function () {
        S.pid = id; S.diary = []; S.extraFatigue = []; S.visitItems = []; S.chat = []; S.chatStarted = false; S.todayMood = null; S.todayDose = null;
        seedVisitItems(); closeSheet(); byId("ab-name").textContent = firstName(); byId("ab-av").textContent = initials(); goTab("home");
      } }, [
        el("span", { class: "pp-av" }, [p.name.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2)]),
        el("div", {}, [el("div", { class: "pp-n" }, [p.name]), el("div", { class: "pp-d" }, [labels[id] || p.ms_type])]),
      ]));
    });
    body.appendChild(pick);
  }
  function sheetInfo(body) {
    body.appendChild(el("h2", {}, ["L'app di " + firstName()]));
    body.appendChild(el("p", {}, ["Companion digitale per chi convive con la sclerosi multipla: check-in dei sintomi, assistente informativo sicuro e preparazione alla visita."]));
    body.appendChild(el("h4", {}, ["Il loop con il neurologo"]));
    body.appendChild(el("p", {}, ["Ciò che registri qui (stanchezza, terapia, episodi col caldo) è esattamente ciò che — con il tuo consenso — aiuta il copilot del tuo neurologo a seguirti tra una visita e l'altra."]));
    body.appendChild(el("button", { class: "pbtn ghost", style: "margin-top:10px", onclick: function () { closeSheet(); openSheet("limiti"); } }, ["Cosa può e non può fare l'assistente"]));
    body.appendChild(el("button", { class: "pbtn ghost", style: "margin-top:8px", onclick: function () { closeSheet(); openSheet("profilo"); } }, ["Cambia profilo (demo)"]));
    body.appendChild(el("div", { class: "disc", style: "text-align:left;padding:14px 0 0" }, ["Prototipo dimostrativo · dati 100% sintetici · non destinato all'uso clinico."]));
  }

  // ======================================================================================
  // SEED, RENDER, TABS, INIT
  // ======================================================================================
  function seedVisitItems() {
    S.visitItems = [];
    if (fatigueRising()) addVisit("Parlare della stanchezza aumentata");
    if (hadHeatFlare()) addVisit("Riferire l'episodio di peggioramento col caldo");
    if (adherence().recent_pct < 85) addVisit("Difficoltà a ricordare le dosi della terapia");
  }
  function initials() { return P().name.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2); }

  var TABS = [
    { k: "home", l: "Oggi", i: "home" },
    { k: "diario", l: "Diario", i: "diary" },
    { k: "assistente", l: "Assistente", i: "chat" },
    { k: "andamenti", l: "Andamenti", i: "chart" },
    { k: "visita", l: "Visita", i: "visit" },
  ];

  function render() {
    var inner = byId("screen-inner");
    clear(inner);
    if (S.tab === "home") inner.appendChild(screenHome());
    else if (S.tab === "diario") inner.appendChild(screenDiario());
    else if (S.tab === "assistente") inner.appendChild(screenAssistente());
    else if (S.tab === "andamenti") inner.appendChild(screenAndamenti());
    else if (S.tab === "visita") inner.appendChild(screenVisita());
    renderTabs();
    updateBadges();
    var w = inner.querySelector(".wrap");
    if (w) w.scrollTop = 0;
  }
  function renderTabs() {
    var bar = byId("tabbar"); clear(bar);
    TABS.forEach(function (t) {
      var b = el("button", { class: "tab" + (S.tab === t.k ? " active" : ""), onclick: function () { goTab(t.k); } }, [
        el("span", { html: icHtml(t.i, 23) }), t.l,
      ]);
      if (t.k === "visita" && S.visitItems.length) {
        b.style.position = "relative";
        b.appendChild(el("span", { class: "badge" }, [String(S.visitItems.length)]));
      }
      bar.appendChild(b);
    });
  }
  function updateBadges() { renderTabs(); }

  function goTab(k) {
    S.tab = k; render();
  }

  function init() {
    byId("ab-name").textContent = firstName();
    byId("ab-av").textContent = initials();
    byId("ab-info").addEventListener("click", function () { openSheet("info"); });
    byId("sheet-x") && byId("sheet-x").addEventListener("click", closeSheet);
    byId("sheet-ov").addEventListener("click", function (e) { if (e.target.id === "sheet-ov") closeSheet(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    seedVisitItems();
    if (global.Copilot && global.Copilot.probe) global.Copilot.probe();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
