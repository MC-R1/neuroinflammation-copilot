/*
 * app.js (v2) - UI controller for the NeuroInflammation Copilot "Console clinica".
 *
 * Visual redesign of the original app/ UI. Same engine (js/risk.js), same deterministic
 * fallbacks (js/templates.js), same 3-tier output orchestration (js/llm.js), same data.
 * New here: app shell with sidebar, score rings, area charts with threshold bands,
 * score-contribution bars (explainability), cohort percentiles, governance drawer.
 *
 * Vanilla ES5, no framework, fully offline (file:// safe).
 */

(function () {
  "use strict";

  var DATA = window.MS_DATA;
  var R = window.RiskEngine, T = window.Templates, C = window.Copilot, H = window.RiskEngine.helpers;

  // ---- State ---------------------------------------------------------------------------
  var STATE = {
    user: { name: "Dr. Demo", initials: "DD", role: "Neurologo" },
    filter: "all",
    search: "",
    audit: [],
    outputs: {},   // `${id}|${kind}` -> {markdown,mode,model,signed,signedAt}
    openWhy: {},   // panel accordion state
  };

  var RISK = {};
  DATA.patients.forEach(function (p) { RISK[p.id] = R.computeRisk(p); });
  var ORDER = DATA.patients.slice().sort(function (a, b) {
    var d = RISK[b.id].score - RISK[a.id].score;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  // ---- DOM helpers ----------------------------------------------------------------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function")
        n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fmtDate(iso) { return T.fmtDate(iso); }
  function nowStr() {
    var d = new Date();
    function p2(x) { return (x < 10 ? "0" : "") + x; }
    return p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " +
      p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  var CAT = {
    "Attività": "c-att", "Progressione": "c-pro", "Terapia": "c-ter",
    "Sintomi invisibili": "c-sin", "Aderenza": "c-ade", "Monitoraggio": "c-mon",
  };
  function catCls(category) { return CAT[category] || "c-mon"; }

  // ---- Icons ----------------------------------------------------------------------------
  var ICONS = {
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    flagic: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    watch: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 1M9 3h6M9 21h6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/><path d="M12 7v5l3 2"/>',
    doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
    spark: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
    pen: '<path d="M3 21l4-1 11-11-3-3L4 17z"/>',
    sign: '<path d="M3 17s3-1 5 1 6 1 6 1M4 13l7-7 3 3-7 7-4 1z"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    therm: '<path d="M12 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M16 4l2-2M18 7h3M16 10l2 2"/>',
    scan: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3.5"/>',
    pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.5 8.2l4.5 6.6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    print: '<path d="M7 8V3h10v5M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3M7 14h10v7H7z"/>',
  };
  function ic(name, size) {
    size = size || 16;
    var s = el("span", { style: "display:inline-flex;flex:none" });
    s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
    return s;
  }
  function icHtml(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
  }

  // ---- Markdown (escaped input -> safe HTML) ---------------------------------------------
  function inline(s) {
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  }
  function mdToHtml(md) {
    var lines = md.split("\n"), out = [], i = 0;
    function flushList(buf) { if (buf.length) out.push("<ul>" + buf.join("") + "</ul>"); }
    while (i < lines.length) {
      var t = lines[i].trim();
      if (t === "") { i++; continue; }
      if (t === "---") { out.push("<hr/>"); i++; continue; }
      if (t.slice(0, 4) === "### ") { out.push("<h3>" + inline(esc(t.slice(4))) + "</h3>"); i++; continue; }
      if (t.slice(0, 3) === "## ") { out.push("<h2>" + inline(esc(t.slice(3))) + "</h2>"); i++; continue; }
      if (t.slice(0, 2) === "# ") { out.push("<h1>" + inline(esc(t.slice(2))) + "</h1>"); i++; continue; }
      if (t.slice(0, 2) === "> ") {
        var q = [];
        while (i < lines.length && lines[i].trim().slice(0, 2) === "> ") { q.push(inline(esc(lines[i].trim().slice(2)))); i++; }
        out.push("<blockquote>" + q.join(" ") + "</blockquote>");
        continue;
      }
      if (t.slice(0, 2) === "- ") {
        var buf = [];
        while (i < lines.length && lines[i].trim().slice(0, 2) === "- ") { buf.push("<li>" + inline(esc(lines[i].trim().slice(2))) + "</li>"); i++; }
        flushList(buf);
        continue;
      }
      var cls = (t.slice(0, 1) === "*" && t.slice(-1) === "*") ? ' class="meta-line"' : "";
      out.push("<p" + cls + ">" + inline(esc(t)) + "</p>");
      i++;
    }
    return out.join("\n");
  }

  // ---- Visual primitives ------------------------------------------------------------------
  function levelColor(level) {
    return level === "alta" ? "var(--hi)" : (level === "media" ? "var(--md)" : "var(--lo)");
  }

  function ring(score, level, size) {
    var stroke = size >= 80 ? 8 : 4.5;
    var r = (size - stroke) / 2 - 1;
    var cx = size / 2, cy = size / 2;
    var c = 2 * Math.PI * r;
    var frac = Math.max(0.03, Math.min(1, score / 10));
    var col = levelColor(level);
    var fs = size >= 80 ? Math.round(size * 0.27) : 13;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="punteggio ' + score + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(1) + '" transform="rotate(-90 ' + cx + " " + cy + ')"/>' +
      '<text x="50%" y="51%" text-anchor="middle" dominant-baseline="central" font-weight="800" font-size="' + fs + '" fill="var(--ink)">' + score + "</text></svg>";
  }

  var GID = 0;
  function areaChart(values, o) {
    o = o || {};
    var w = 340, h = o.h || 88;
    var padL = 6, padR = 8, padT = 12, padB = 8;
    var ref = (o.ref === undefined) ? null : o.ref;
    var dom = values.slice();
    if (ref !== null) dom.push(ref);
    var min = Math.min.apply(null, dom), max = Math.max.apply(null, dom);
    if (max - min < 1e-9) { max += 1; min -= 1; }
    var span = max - min;
    min -= span * 0.1; max += span * 0.1;
    function x(i) { return padL + (w - padL - padR) * (values.length === 1 ? 0.5 : i / (values.length - 1)); }
    function y(v) { return h - padB - (h - padT - padB) * (v - min) / (max - min); }
    var col = o.color || "var(--brand)";
    var id = "ag" + (++GID);
    var line = values.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
    var area = line + " L" + x(values.length - 1).toFixed(1) + " " + (h - padB) + " L" + x(0).toFixed(1) + " " + (h - padB) + " Z";
    var s = '<svg class="achart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">';
    s += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + col + '" stop-opacity="0.20"/>' +
      '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>';
    if (ref !== null && o.worseUp) {
      var ry = y(ref);
      if (ry > padT + 2) s += '<rect x="0" y="0" width="' + w + '" height="' + ry.toFixed(1) + '" fill="var(--hi)" opacity="0.05"/>';
      s += '<line x1="' + padL + '" y1="' + ry.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + ry.toFixed(1) + '" stroke="var(--mut2)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>';
    }
    s += '<path d="' + area + '" fill="url(#' + id + ')"/>';
    s += '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
    for (var i = 0; i < values.length; i++) {
      var last = i === values.length - 1;
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(values[i]).toFixed(1) + '" r="' + (last ? 3.4 : 2.1) + '" fill="' + (last ? col : "#fff") + '" stroke="' + col + '" stroke-width="1.4">';
      if (o.titles && o.titles[i]) s += "<title>" + esc(o.titles[i]) + "</title>";
      s += "</circle>";
    }
    s += "</svg>";
    return s;
  }

  function miniSpark(values, ref) {
    var w = 120, h = 30, pad = 3;
    var dom = values.slice();
    if (ref !== null && ref !== undefined) dom.push(ref);
    var min = Math.min.apply(null, dom), max = Math.max.apply(null, dom);
    if (max - min < 1e-9) max = min + 1;
    function x(i) { return pad + (w - 2 * pad) * (values.length === 1 ? 0.5 : i / (values.length - 1)); }
    function y(v) { return h - pad - (h - 2 * pad) * (v - min) / (max - min); }
    var bad = (ref !== null && ref !== undefined) && values[values.length - 1] > ref;
    var col = bad ? "var(--hi)" : "var(--mut2)";
    var pts = values.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    var s = '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">';
    if (ref !== null && ref !== undefined) {
      var ry = y(ref).toFixed(1);
      s += '<line x1="' + pad + '" y1="' + ry + '" x2="' + (w - pad) + '" y2="' + ry + '" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>';
    }
    s += '<polyline fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="' + pts + '" vector-effect="non-scaling-stroke"/>';
    s += '<circle cx="' + x(values.length - 1).toFixed(1) + '" cy="' + y(values[values.length - 1]).toFixed(1) + '" r="2.6" fill="' + col + '"/>';
    s += "</svg>";
    return s;
  }

  // ---- Cohort helpers ----------------------------------------------------------------------
  function latestOf(p, key) {
    if (key === "steps" || key === "gait" || key === "sleep") {
      var w = p.timeline.wearable;
      if (!w || !w.length) return null;
      var lastW = w[w.length - 1];
      return key === "steps" ? lastW.steps : (key === "gait" ? lastW.gait_speed_ms : lastW.sleep_hours);
    }
    var s = p.timeline[key];
    return s && s.length ? s[s.length - 1].value : null;
  }
  function cohortLatest(key) {
    return DATA.patients.map(function (p) { return latestOf(p, key); })
      .filter(function (v) { return v !== null && v !== undefined; });
  }
  function pctOf(val, arr) {
    if (!arr.length) return null;
    var le = arr.filter(function (x) { return x <= val; }).length;
    return Math.round(100 * le / arr.length);
  }

  // ---- Trend math ----------------------------------------------------------------------------
  function trendInfo(values, o) {
    var latest = values[values.length - 1];
    var base = (values.slice(0, 2).reduce(function (s, x) { return s + x; }, 0)) / Math.min(2, values.length);
    var recent = values.slice(-2).reduce(function (s, x) { return s + x; }, 0) / Math.min(2, values.length);
    var delta = recent - base;
    var status = "flat", arrow = "→";
    if (Math.abs(delta) >= (o.eps || 0.5)) {
      arrow = delta > 0 ? "↑" : "↓";
      var worsening = o.worseUp ? delta > 0 : delta < 0;
      status = worsening ? "bad" : "good";
    }
    return { latest: latest, base: base, recent: recent, delta: delta, arrow: arrow, status: status };
  }
  function fmtN(x, dec) {
    if (x === null || x === undefined) return "–";
    var f = Math.pow(10, dec === undefined ? 1 : dec);
    return String(Math.round(x * f) / f);
  }

  // =============================================================================================
  // SIDEBAR
  // =============================================================================================
  var FILTERS = [
    { key: "all", label: "Tutti i pazienti", dot: "c-all" },
    { key: "disease_activity", label: "Attività di malattia", dot: "c-att" },
    { key: "pira_smouldering", label: "PIRA / progressione", dot: "c-pro" },
    { key: "suboptimal", label: "Risposta subottimale", dot: "c-ter" },
    { key: "invisible_symptoms", label: "Sintomi invisibili", dot: "c-sin" },
    { key: "adherence", label: "Aderenza a rischio", dot: "c-ade" },
    { key: "monitoring", label: "Monitoraggio dovuto", dot: "c-mon" },
    { key: "neda", label: "NEDA-3 / stabili", dot: "c-neda" },
  ];

  function filterMatch(p, r, key) {
    if (key === "all") return true;
    if (key === "neda") return r.neda || r.level === "bassa";
    return r.flags.some(function (f) { return f.key === key; });
  }

  function buildSidebar() {
    // cohort stats
    var c = { alta: 0, media: 0, bassa: 0, neda: 0 };
    DATA.patients.forEach(function (p) {
      var r = RISK[p.id]; c[r.level]++; if (r.neda) c.neda++;
    });
    var stats = document.getElementById("sb-stats");
    clear(stats);
    [["Priorità alta", c.alta, "hi"], ["Priorità media", c.media, "md"],
     ["Priorità bassa", c.bassa, "lo"], ["NEDA-3", c.neda, "neda"]].forEach(function (s) {
      stats.appendChild(el("div", { class: "sbs " + s[2] }, [
        el("div", { class: "n" }, [String(s[1])]),
        el("div", { class: "l" }, [s[0]]),
      ]));
    });

    // filters with counts
    var wrap = document.getElementById("sb-filters");
    clear(wrap);
    FILTERS.forEach(function (f) {
      var count = DATA.patients.filter(function (p) { return filterMatch(p, RISK[p.id], f.key); }).length;
      wrap.appendChild(el("button", {
        class: "sf" + (STATE.filter === f.key ? " active" : ""),
        "data-f": f.key,
        onclick: function () {
          STATE.filter = f.key;
          closeNav();
          if (location.hash.indexOf("/patient/") >= 0) { go("#/panel"); }
          else { renderPanel(); syncSidebar(); }
        },
      }, [el("span", { class: "sf-dot " + f.dot }), f.label, el("span", { class: "sf-n" }, [String(count)])]));
    });

    // nav icons
    document.querySelectorAll(".sb-link .nl-ico").forEach(function (sp) {
      sp.innerHTML = icHtml(sp.getAttribute("data-ico"));
    });
  }

  function syncSidebar() {
    var onPanel = location.hash.indexOf("/patient/") < 0;
    document.getElementById("nav-panel").classList.toggle("active", onPanel);
    document.getElementById("nav-flagship").classList.toggle("active", location.hash.indexOf("MS-0142") >= 0);
    document.querySelectorAll("#sb-filters .sf").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-f") === STATE.filter);
    });
  }

  function setChrome(title, sub, showSearch) {
    document.getElementById("mb-title").textContent = title;
    document.getElementById("mb-sub").textContent = sub || "";
    document.getElementById("mainbar").classList.toggle("hide-search", !showSearch);
  }

  function closeNav() { document.getElementById("shell").classList.remove("nav-open"); }

  // =============================================================================================
  // EXPLAINABILITY (shared: panel accordion + detail card)
  // =============================================================================================
  function cbBlock(fl, withFactors) {
    var width = Math.min(100, Math.round(fl.points / 3 * 100));
    var cls = catCls(fl.category);
    var b = el("div", { class: "cb" });
    b.appendChild(el("div", { class: "cb-top" }, [
      el("span", { class: "cb-lab" }, [el("i", { class: "dotc " + cls }), fl.label]),
      el("span", { class: "cb-sev" }, ["gravità " + fl.severity]),
      el("span", { class: "cb-pts" }, ["+" + fl.points]),
    ]));
    b.appendChild(el("div", { class: "cb-track" }, [
      el("div", { class: "cb-fill " + cls, style: "width:" + width + "%" }),
    ]));
    if (withFactors) {
      var ul = el("ul", { class: "cb-factors" });
      fl.factors.forEach(function (fc) { ul.appendChild(el("li", {}, [fc])); });
      b.appendChild(ul);
    }
    return b;
  }

  function insightBox(ins) {
    var box = el("div", { class: "ins2" });
    box.appendChild(ic("info", 19));
    box.appendChild(el("div", {}, [
      el("div", { class: "t" }, [ins.title]),
      el("div", { class: "d" }, [ins.detail]),
    ]));
    return box;
  }

  // =============================================================================================
  // PANEL
  // =============================================================================================
  function matches(p, r) {
    if (STATE.search) {
      var q = STATE.search.toLowerCase();
      if (p.name.toLowerCase().indexOf(q) < 0 && p.id.toLowerCase().indexOf(q) < 0 &&
        p.ms_type.toLowerCase().indexOf(q) < 0) return false;
    }
    return filterMatch(p, r, STATE.filter);
  }

  function prow(p, rank) {
    var r = RISK[p.id];
    var row = el("div", {
      class: "prow lvl-" + r.level, tabindex: "0", role: "button",
      "aria-label": "Apri scheda di " + p.name,
      onclick: function (e) { if (e.target.closest(".pr-why")) return; go("#/patient/" + p.id); },
      onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("#/patient/" + p.id); } },
    });

    row.appendChild(el("div", { class: "pr-lead", html:
      '<span class="pr-rank">' + rank + "</span>" + ring(r.score, r.level, 46) }));

    var mid = el("div", { class: "pr-id" });
    var nameRow = el("div", { class: "pr-name" }, [p.name]);
    if (r.neda) nameRow.appendChild(el("span", { class: "nedachip" }, ["NEDA-3"]));
    mid.appendChild(nameRow);
    var dmt = p.current_dmt.klass === "nessuno" ? "nessuna DMT" :
      (p.current_dmt.drug + " · " + p.current_dmt.months_on_dmt + " mesi");
    mid.appendChild(el("div", { class: "pr-meta", html:
      p.age + " anni · " + (p.sex === "F" ? "F" : "M") + '<span class="sep">·</span>' + esc(p.ms_type) +
      '<span class="sep">·</span>malattia da ' + p.disease_duration_years + " anni" +
      '<span class="sep">·</span>' + esc(dmt) }));
    var chips = el("div", { class: "pr-flags" });
    if (r.flags.length) {
      r.flags.forEach(function (fl) {
        chips.appendChild(el("span", { class: "chip " + catCls(fl.category), title: fl.factors[0] || "" },
          [el("i"), fl.label]));
      });
    } else {
      chips.appendChild(el("span", { class: "chip c-ok" }, [el("i"), r.neda ? "Nessun flag · NEDA-3" : "Nessun flag · stabile"]));
    }
    mid.appendChild(chips);
    row.appendChild(mid);

    // NfL mini-spark (signature biomarker)
    var nfl = p.timeline.nfl;
    var spark = el("div", { class: "pr-spark", html:
      miniSpark(nfl.map(function (x) { return x.value; }), nfl[nfl.length - 1].url) +
      '<div class="sp-l">NfL · 30 mesi</div>' });
    row.appendChild(spark);

    var right = el("div", { class: "pr-right" });
    if (r.flags.length) {
      var open = !!STATE.openWhy[p.id];
      right.appendChild(el("button", {
        class: "pr-why", "aria-expanded": String(open),
        onclick: function () { STATE.openWhy[p.id] = !STATE.openWhy[p.id]; renderPanel(); },
      }, [open ? "Chiudi perché" : "Perché?"]));
    }
    right.appendChild(el("span", { class: "pr-chev", html: icHtml("chev").replace("<svg", '<svg width="17" height="17"') }));
    row.appendChild(right);

    if (STATE.openWhy[p.id] && r.flags.length) {
      var ex = el("div", { class: "pr-expand open" });
      r.insights.forEach(function (ins) { ex.appendChild(insightBox(ins)); });
      r.flags.forEach(function (fl) { ex.appendChild(cbBlock(fl, true)); });
      row.appendChild(ex);
    }
    return row;
  }

  function renderPanel() {
    var view = document.getElementById("view");
    clear(view);

    var groups = [
      { lvl: "alta", label: "Priorità alta" },
      { lvl: "media", label: "Priorità media" },
      { lvl: "bassa", label: "Priorità bassa" },
    ];
    var list = el("div", { class: "plist2" });
    var rank = 0, shown = 0;
    groups.forEach(function (g) {
      var items = [];
      ORDER.forEach(function (p) {
        var r = RISK[p.id];
        if (r.level !== g.lvl) return;
        rank = ORDER.indexOf(p) + 1;
        if (!matches(p, r)) return;
        items.push(prow(p, rank));
      });
      if (!items.length) return;
      shown += items.length;
      list.appendChild(el("div", { class: "grouphead" }, [
        el("span", { class: "gh-dot " + g.lvl }),
        g.label, el("span", { class: "gh-n" }, ["· " + items.length]),
      ]));
      items.forEach(function (it) { list.appendChild(it); });
    });

    if (!shown) {
      list.appendChild(el("div", { class: "empty2" }, ["Nessun paziente corrisponde a ricerca o filtro attivi."]));
    }
    view.appendChild(list);

    setChrome("Pannello pazienti",
      DATA.meta.n_patients + " pazienti sintetici · ordinati per priorità di rischio · ogni flag è spiegabile", true);
    document.getElementById("foot2").innerHTML =
      "NeuroInflammation Copilot · UI v2 · Digital Neuro Hub 2026 — sfida #2 HCP Digital Copilot" +
      ' <span style="opacity:.5">·</span> seed ' + DATA.meta.seed +
      ' <span style="opacity:.5">·</span> dati sintetici, non per uso clinico';
    syncSidebar();
    window.scrollTo(0, 0);
  }

  // =============================================================================================
  // DETAIL
  // =============================================================================================
  function hero(p) {
    var r = RISK[p.id];
    var h = el("section", { class: "hero lvl-" + r.level });
    var main = el("div", { class: "hero-main" });
    var nm = el("div", { class: "hero-name" }, [el("h1", {}, [p.name])]);
    nm.appendChild(el("span", { class: "lvlchip " + r.level }, ["Priorità " + r.level]));
    if (r.neda) nm.appendChild(el("span", { class: "nedachip" }, ["✓ NEDA-3"]));
    main.appendChild(nm);
    main.appendChild(el("div", { class: "hero-meta", html:
      p.age + " anni · " + (p.sex === "F" ? "donna" : "uomo") + '<span class="sep">·</span>' + esc(p.ms_type) +
      '<span class="sep">·</span>malattia da ' + p.disease_duration_years + " anni" +
      '<span class="sep">·</span>' + esc(p.id) }));

    var chips = el("div", { class: "hero-chips" });
    var dmt = p.current_dmt;
    chips.appendChild(el("span", { class: "hchip", html: dmt.klass === "nessuno" ? "<b>Nessuna DMT</b> in corso" :
      "DMT <b>" + esc(dmt.drug) + "</b> · " + dmt.months_on_dmt + " mesi (" + esc(dmt.klass) + ")" }));
    var adhCls = p.adherence.recent_pct < 65 ? " dang" : (p.adherence.recent_pct < 80 ? " warn" : "");
    chips.appendChild(el("span", { class: "hchip" + adhCls, html: "Aderenza <b>" + p.adherence.recent_pct + "%</b> (" + esc(p.adherence.trend) + ")" }));
    var nfl = p.timeline.nfl[p.timeline.nfl.length - 1];
    chips.appendChild(el("span", { class: "hchip" + (nfl.value > nfl.url ? " dang" : ""), html:
      "NfL <b>" + fmtN(nfl.value) + "</b> / soglia " + fmtN(nfl.url) + " pg/mL" }));
    var edss = p.timeline.edss[p.timeline.edss.length - 1].value;
    chips.appendChild(el("span", { class: "hchip", html: "EDSS <b>" + fmtN(edss) + "</b>" }));
    main.appendChild(chips);
    h.appendChild(main);

    h.appendChild(el("div", { class: "hero-ring", html:
      ring(r.score, r.level, 104) + '<div class="ring-cap">punteggio priorità</div>' }));
    return h;
  }

  function card(title, iconName, hint) {
    var c = el("div", { class: "c2" });
    var head = el("div", { class: "c2-head" });
    head.appendChild(el("span", { class: "hico", html: icHtml(iconName) }));
    head.appendChild(el("h3", {}, [title]));
    if (hint) head.appendChild(el("span", { class: "c2-hint" }, [hint]));
    c.appendChild(head);
    var body = el("div", { class: "c2-body" });
    c.appendChild(body);
    return { card: c, body: body };
  }

  function whyCard(p) {
    var r = RISK[p.id];
    var c = card("Perché è prioritario", "flagic", "punteggio scomposto · regole trasparenti");
    r.insights.forEach(function (ins) { c.body.appendChild(insightBox(ins)); });
    if (!r.flags.length) {
      c.body.appendChild(el("div", { class: "synthnote" }, [
        r.neda ? "Nessun flag attivo: quadro coerente con NEDA-3 (nessuna ricaduta, nessuna attività RMN, nessuna progressione EDSS)."
               : "Nessun flag attivo: quadro sostanzialmente stabile.",
      ]));
    } else {
      r.flags.forEach(function (fl) { c.body.appendChild(cbBlock(fl, true)); });
    }
    return c.card;
  }

  var TRENDS = [
    { key: "edss", name: "EDSS", worseUp: true, eps: 0.4, dec: 1 },
    { key: "nfl", name: "NfL sierico", unit: "pg/mL", worseUp: true, eps: 1.0, dec: 1, refKey: "nfl_url", coh: true },
    { key: "gfap", name: "GFAP sierico", unit: "pg/mL", worseUp: true, eps: 18, dec: 0, refKey: "gfap_url", coh: true },
    { key: "sdmt", name: "SDMT · cognizione", worseUp: false, eps: 3, dec: 0, coh: true, note: "più basso = peggiore" },
    { key: "mfis", name: "MFIS · fatica", worseUp: true, eps: 4, dec: 0, coh: true, note: "più alto = peggiore" },
    { key: "phq9", name: "PHQ-9 · umore", worseUp: true, eps: 2.5, dec: 0 },
  ];

  function t2card(cfg, p, series) {
    var vals = series.map(function (x) { return x.value; });
    var info = trendInfo(vals, cfg);
    var ref = cfg.refKey ? p[cfg.refKey] : null;
    var refBad = ref !== null && cfg.worseUp && info.latest > ref;
    var col = (info.status === "bad" || refBad) ? "var(--hi)" : (info.status === "good" ? "var(--lo)" : "var(--brand)");

    var box = el("div", { class: "t2" });
    var head = el("div", { class: "t2-head" });
    head.appendChild(el("span", { class: "t2-name" }, [cfg.name]));
    if (cfg.coh) {
      var pct = pctOf(info.latest, cohortLatest(cfg.key));
      if (pct !== null) {
        var adverse = cfg.worseUp ? pct >= 80 : pct <= 20;
        head.appendChild(el("span", { class: "pctchip" + (adverse ? " bad" : ""),
          title: "Posizione del valore più recente rispetto alla coorte sintetica (14 pazienti)" },
          [pct + "° pct coorte"]));
      }
    }
    box.appendChild(head);

    var mid = el("div", { class: "t2-mid" });
    mid.appendChild(el("span", { class: "t2-val", html: fmtN(info.latest, cfg.dec) +
      (cfg.unit ? '<span class="unit">' + esc(cfg.unit) + "</span>" : "") }));
    mid.appendChild(el("span", { class: "t2-delta " + info.status }, [
      info.arrow + " " + (info.delta >= 0 ? "+" : "") + fmtN(info.delta, cfg.dec)]));
    box.appendChild(mid);

    var titles = series.map(function (x) { return fmtDate(x.date) + " · " + fmtN(x.value, cfg.dec); });
    box.appendChild(el("div", { html: areaChart(vals, { ref: ref, worseUp: cfg.worseUp, color: col, titles: titles }) }));

    var footL = fmtDate(series[0].date) + " → " + fmtDate(series[series.length - 1].date);
    var footR = ref !== null ? "soglia per età " + fmtN(ref, cfg.dec) : (cfg.note || "");
    box.appendChild(el("div", { class: "t2-foot" }, [
      el("span", {}, [footL]), el("span", {}, [footR]),
    ]));
    return box;
  }

  function trendsCard(p) {
    var c = card("Andamento clinico e biomarcatori", "activity", "baseline → ultime valutazioni · passa sui punti per i valori");
    var grid = el("div", { class: "tgrid" });
    TRENDS.forEach(function (cfg) {
      var s = p.timeline[cfg.key];
      if (s && s.length) grid.appendChild(t2card(cfg, p, s));
    });
    c.body.appendChild(grid);
    return c.card;
  }

  function dbioSpark(vals, col) {
    var w = 120, h = 34, pad = 4;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max - min < 1e-9) max = min + 1;
    function x(i) { return pad + (w - 2 * pad) * (vals.length === 1 ? 0.5 : i / (vals.length - 1)); }
    function y(v) { return h - pad - (h - 2 * pad) * (v - min) / (max - min); }
    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' +
      pts + '" vector-effect="non-scaling-stroke"/><circle cx="' + x(vals.length - 1).toFixed(1) + '" cy="' +
      y(vals[vals.length - 1]).toFixed(1) + '" r="2.6" fill="' + col + '"/></svg>';
  }

  function dbioTile(m) {
    var d = m.latest - m.baseline;
    var worsening = Math.abs(d) > 1e-9 && ((d > 0) === m.worse_up);
    var improving = Math.abs(d) > 1e-9 && !worsening;
    var cls = worsening ? "bad" : (improving ? "good" : "flat");
    var col = worsening ? "var(--hi)" : (improving ? "var(--lo)" : "var(--mut2)");
    var arrow = Math.abs(d) < 1e-9 ? "→" : (d > 0 ? "↑" : "↓");
    var intD = (m.latest % 1 === 0 && m.baseline % 1 === 0);
    var dShow = intD ? Math.round(d) : Math.round(d * 100) / 100;
    var tile = el("div", { class: "dbio-tile" });
    tile.appendChild(el("div", { class: "dbio-t-label" }, [m.label + (m.proprietary ? " ⌁" : "")]));
    tile.appendChild(el("div", { class: "dbio-t-row" }, [
      el("span", { class: "dbio-t-val", html: m.latest + ' <span class="u">' + esc(m.unit) + "</span>" }),
      el("span", { class: "dbio-t-delta " + cls }, [arrow + " " + (dShow >= 0 ? "+" : "") + dShow]),
    ]));
    tile.appendChild(el("div", { class: "dbio-t-spark", html: dbioSpark(m.series.map(function (x) { return x.value; }), col) }));
    return tile;
  }

  function dbioCard(p) {
    var dbio = p.timeline.digital_biomarkers;
    if (!dbio || !dbio.length) return null;
    var meta = (DATA.meta && DATA.meta.digital_biomarkers) || {};
    var c = card("Biomarcatori digitali", "watch", "wearable & sensori · raggruppati per dominio");

    c.body.appendChild(el("div", { class: "dbio-legend", html:
      '<span class="dbio-ev evidence">evidenza</span> associazioni SM supportate · ' +
      '<span class="dbio-ev rationale">razionale</span> rilevante ma da validare · ' +
      '<span class="dbio-prop">⌁</span> indice proprietario' }));

    dbio.forEach(function (dom) {
      var open = dom.key === "gait" || dom.key === "keystroke";
      var worse = dom.metrics.filter(function (m) {
        var d = m.latest - m.baseline; return Math.abs(d) > 1e-9 && ((d > 0) === m.worse_up);
      }).length;
      var sec = el("div", { class: "dbio-dom" });
      var head = el("button", { class: "dbio-head", "aria-expanded": String(open) });
      head.appendChild(el("div", { class: "dbio-h-main" }, [
        el("div", { class: "dbio-h-top" }, [
          el("span", { class: "dbio-h-label" }, [dom.label]),
          el("span", { class: "dbio-ev " + dom.evidence }, [dom.evidence === "evidence" ? "evidenza" : "razionale"]),
        ]),
        el("div", { class: "dbio-h-sub" }, [dom.device + " · " + dom.metrics.length + " metriche" +
          (worse ? " · " + worse + " in peggioramento" : "")]),
      ]));
      head.appendChild(el("span", { class: "dbio-chev" + (open ? " open" : ""), html: icHtml("chev") }));
      sec.appendChild(head);
      var body = el("div", { class: "dbio-body" + (open ? " open" : "") });
      var grid = el("div", { class: "dbio-grid" });
      dom.metrics.forEach(function (m) { grid.appendChild(dbioTile(m)); });
      body.appendChild(grid);
      sec.appendChild(body);
      head.addEventListener("click", function () {
        var isOpen = body.classList.toggle("open");
        head.querySelector(".dbio-chev").classList.toggle("open", isOpen);
        head.setAttribute("aria-expanded", String(isOpen));
      });
      c.body.appendChild(sec);
    });

    var notes = [];
    if (meta.gait_aggregation) notes.push(meta.gait_aggregation);
    if (meta.physiologic_note) notes.push(meta.physiologic_note);
    if (meta.proprietary_note) notes.push("⌁ " + meta.proprietary_note);
    if (notes.length) {
      c.body.appendChild(el("div", { class: "dbio-foot" }, ["Metodo: " + notes.join(" ")]));
    }
    return c.card;
  }

  function buildTimeline(p) {
    var ev = [];
    (p.timeline.relapses || []).forEach(function (r) {
      var pseudo = r.type !== "relapse";
      ev.push({
        date: r.date, kind: pseudo ? "pseudo" : "relapse",
        title: pseudo ? "Sospetta pseudo-ricaduta" : "Ricaduta clinica",
        desc: (r.severity ? r.severity + " · " : "") +
          (r.trigger && r.trigger !== "nessuno" ? "trigger: " + r.trigger.replace("_", " ") + " · " : "") +
          "recupero " + r.recovery + (r.note ? " — " + r.note : ""),
      });
    });
    (p.timeline.mri || []).forEach(function (m) {
      var bits = [];
      if (m.new_t2 > 0) bits.push(m.new_t2 + " nuova/e T2");
      if (m.enlarging_t2 > 0) bits.push(m.enlarging_t2 + " T2 ingrandita/e");
      if (m.gad_enhancing > 0) bits.push(m.gad_enhancing + " captante/i Gd");
      if (m.prl > 0) bits.push(m.prl + " PRL");
      ev.push({ date: m.date, kind: "mri", title: "RMN encefalo",
        desc: (bits.length ? bits.join(", ") : "nessuna nuova lesione") + " · atrofia: " + m.atrophy });
    });
    (p.timeline.dmt_changes || []).forEach(function (d) {
      ev.push({ date: d.date, kind: "dmt", title: "Terapia · " + (d.event || "modifica"),
        desc: (d.to || "") + (d.note ? " — " + d.note : "") });
    });
    ev.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return ev;
  }

  var TL_ICON = { relapse: "bolt", pseudo: "therm", mri: "scan", dmt: "pill" };
  var TL_TAG = { relapse: "Ricaduta", pseudo: "Pseudo-ricaduta", mri: "RMN", dmt: "DMT" };

  function timelineCard(p) {
    var c = card("Timeline longitudinale", "history", "ricadute · RMN · terapia");
    var wrap = el("div", { class: "tl2" });
    var ev = buildTimeline(p).slice(0, 10);
    var curYear = null;
    ev.forEach(function (e) {
      var y = e.date.slice(0, 4);
      if (y !== curYear) {
        curYear = y;
        wrap.appendChild(el("div", { class: "tl2-year" }, [y]));
      }
      var item = el("div", { class: "tl2-item" });
      item.appendChild(el("span", { class: "tl2-node k-" + e.kind, html: icHtml(TL_ICON[e.kind]) }));
      var cardEl = el("div", { class: "tl2-card" });
      cardEl.appendChild(el("div", { class: "tl2-top" }, [
        el("span", { class: "tl2-tag k-" + e.kind }, [TL_TAG[e.kind]]),
        el("span", { class: "tl2-title" }, [e.title]),
        el("span", { class: "tl2-date" }, [fmtDate(e.date)]),
      ]));
      cardEl.appendChild(el("div", { class: "tl2-desc" }, [e.desc]));
      item.appendChild(cardEl);
      wrap.appendChild(item);
    });
    c.body.appendChild(wrap);
    return c.card;
  }

  // ---- Outputs ---------------------------------------------------------------------------------
  var KINDS = { summary: "Visit summary pre-visita", letter: "Bozza lettera / relazione", instructions: "Istruzioni post-visita" };

  function outputsCard(p) {
    var c = card("Copilot · output pre-visita", "doc", "bozze AI · validate dal clinico");
    var acts = el("div", { class: "gen-actions" });
    acts.appendChild(el("button", { class: "btn2 pri", id: "btn-summary",
      onclick: function () { genOutput(p, "summary"); } }, [ic("spark"), "Genera visit summary"]));
    acts.appendChild(el("button", { class: "btn2 sec", id: "btn-letter",
      onclick: function () { genOutput(p, "letter"); } }, [ic("pen"), "Bozza lettera / relazione"]));
    acts.appendChild(el("button", { class: "btn2 ter", id: "btn-instructions",
      onclick: function () { genOutput(p, "instructions"); } }, ["Istruzioni post-visita (paziente)"]));
    c.body.appendChild(acts);
    c.body.appendChild(el("div", { id: "output-mount" }));
    return c.card;
  }

  function genOutput(p, kind) {
    var mount = document.getElementById("output-mount");
    clear(mount);
    var btn = document.getElementById("btn-" + kind);
    var prev = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin2"></span> Generazione…'; }
    mount.appendChild(el("div", { class: "gen-wait" }, [
      el("span", { class: "spin2" }), "Il copilot sta preparando la bozza dai dati del paziente…"]));

    C.generate(p, RISK[p.id], kind).then(function (out) {
      STATE.outputs[p.id + "|" + kind] = { markdown: out.markdown, mode: out.mode, model: out.model, signed: false };
      audit("Generato: " + KINDS[kind], p, out.mode);
      if (btn) { btn.disabled = false; btn.innerHTML = prev; }
      renderOutput(p, kind);
    });
  }

  function renderOutput(p, kind) {
    var mount = document.getElementById("output-mount");
    if (!mount) return;
    clear(mount);
    var out = STATE.outputs[p.id + "|" + kind];
    if (!out) return;

    var modeLabel = { live: "LLM live", fallback: "Fallback curato · offline", template: "Generato dai dati · offline" }[out.mode];
    var panel = el("div", { class: "out2" });
    panel.appendChild(el("div", { class: "sign2" }, [
      ic("sign", 21),
      el("div", {}, [
        el("div", { class: "t" }, ["DA RIVEDERE E FIRMARE DAL CLINICO"]),
        el("div", { class: "s" }, ["Bozza AI a supporto della decisione. Non valida senza revisione e firma del medico."]),
      ]),
    ]));
    var meta = el("div", { class: "out2-meta" });
    meta.appendChild(el("span", {}, [KINDS[kind]]));
    meta.appendChild(el("span", { class: "modechip " + out.mode }, [modeLabel + (out.model ? " · " + out.model : "")]));
    meta.appendChild(el("span", {}, [out.signed ? "Firmato da " + STATE.user.name : "Validazione: in attesa del clinico"]));
    panel.appendChild(meta);

    var bodyWrap = el("div", { class: "out2-body" });
    bodyWrap.appendChild(el("div", { class: "md", html: mdToHtml(out.markdown) }));
    if (out.signed) {
      bodyWrap.appendChild(el("div", { class: "stamp2" }, [
        ic("check", 17), "Validato e firmato da " + STATE.user.name + " (" + STATE.user.role + ") — " + out.signedAt,
      ]));
    }
    panel.appendChild(bodyWrap);

    var acts = el("div", { class: "out2-actions" });
    if (!out.signed) {
      acts.appendChild(el("button", { class: "btn2 pri mini",
        onclick: function () { signOutput(p, kind); } }, [ic("check"), "Valida e firma"]));
    }
    acts.appendChild(el("button", { class: "btn2 ter mini",
      onclick: function (e) { copyText(out.markdown, e.target.closest("button")); } }, [ic("copy"), "Copia"]));
    acts.appendChild(el("button", { class: "btn2 ter mini",
      onclick: function () { window.print(); } }, [ic("print"), "Stampa / PDF"]));
    panel.appendChild(acts);
    mount.appendChild(panel);
  }

  function signOutput(p, kind) {
    var out = STATE.outputs[p.id + "|" + kind];
    if (!out) return;
    out.signed = true;
    out.signedAt = nowStr();
    audit("Validato e firmato: " + KINDS[kind], p, null);
    toast("Documento firmato e registrato nell'audit trail ✓");
    renderOutput(p, kind);
  }

  function copyText(text, btn) {
    function done() {
      if (btn) {
        var t = btn.innerHTML;
        btn.innerHTML = "Copiato ✓";
        setTimeout(function () { btn.innerHTML = t; }, 1200);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  }

  // ---- Monitoring / context --------------------------------------------------------------------
  function dueInfo(m) {
    var a = H.anchorDate();
    var d = Math.round((new Date(m.due_date + "T00:00:00") - a) / 86400000);
    if (m.status === "scaduto" || d < 0) return { txt: "scaduto da " + Math.abs(d) + " gg", cls: "bad" };
    return { txt: "tra " + d + " gg", cls: m.status === "in_scadenza" ? "warn" : "" };
  }

  function monitoringCard(p) {
    var c = card("Aderenza & monitoraggio", "shield", "");
    var a = p.adherence;
    c.body.appendChild(el("div", { class: "adh-line", html:
      "Aderenza stimata <b>" + a.recent_pct + "%</b> (" + esc(a.trend) + ")" +
      (a.missed_doses_90d ? " · " + a.missed_doses_90d + " dosi mancate/90gg" : "") +
      (a.refill_gap_days ? " · gap rifornimenti " + a.refill_gap_days + " gg" : "") }));
    (p.monitoring || []).forEach(function (m) {
      var due = dueInfo(m);
      c.body.appendChild(el("div", { class: "mon2" }, [
        el("span", { class: "stt " + m.status }, [m.status === "in_scadenza" ? "in scad." : m.status]),
        el("span", { class: "mn" }, [m.item]),
        el("span", { class: "duechip " + due.cls }, [due.txt]),
      ]));
    });
    return c.card;
  }

  function contextCard(p) {
    var c = card("Contesto & governance", "info", "");
    c.body.appendChild(el("div", { class: "synthnote", html:
      "<b>Archetipo sintetico:</b> " + esc(p.note_synthetic || "—") }));
    c.body.appendChild(el("div", { style: "font-size:12.3px;color:var(--mut);margin:12px 0 12px", html:
      "Supporto decisionale con uomo-nel-loop: il copilot <b>non</b> diagnostica e <b>non</b> decide. Ogni output va validato e firmato." }));
    c.body.appendChild(el("button", { class: "btn2 ter mini", onclick: openDrawer },
      ["Intended use & audit trail"]));
    return c.card;
  }

  function renderDetail(id) {
    var p = null;
    DATA.patients.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) { go("#/panel"); return; }
    var view = document.getElementById("view");
    clear(view);

    view.appendChild(el("button", { class: "backlink", onclick: function () { go("#/panel"); } },
      [ic("back", 15), "Torna al pannello"]));
    view.appendChild(hero(p));

    var grid = el("div", { class: "dgrid" });
    var main = el("div", { class: "dcol-main" });
    main.appendChild(whyCard(p));
    main.appendChild(trendsCard(p));
    var wc = dbioCard(p); if (wc) main.appendChild(wc);
    main.appendChild(timelineCard(p));
    grid.appendChild(main);

    var side = el("div", { class: "dcol-side" });
    side.appendChild(outputsCard(p));
    side.appendChild(monitoringCard(p));
    side.appendChild(contextCard(p));
    grid.appendChild(side);

    view.appendChild(grid);
    setChrome(p.name, p.id + " · " + p.ms_type + " · scheda paziente", false);
    document.getElementById("foot2").textContent = "Scheda " + p.id + " · dati sintetici · la decisione resta al clinico";
    syncSidebar();
    window.scrollTo(0, 0);
  }

  // =============================================================================================
  // GOVERNANCE DRAWER + AUDIT + TOAST
  // =============================================================================================
  function audit(action, p, mode) {
    STATE.audit.unshift({ ts: nowStr(), actor: STATE.user.name, action: action,
      target: p ? p.name + " (" + p.id + ")" : "—", mode: mode || "" });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  function openDrawer() {
    var body = document.getElementById("dr-body");
    clear(body);
    body.appendChild(el("h4", {}, ["Intended use"]));
    body.appendChild(el("p", {}, ["NeuroInflammation Copilot è uno strumento di supporto decisionale (Clinical Decision Support) per il neurologo e il team multidisciplinare nella gestione della SM e delle malattie neuroinfiammatorie. Aiuta a prioritizzare i pazienti, sintetizzare i dati longitudinali e proporre azioni di follow-up. Non formula diagnosi autonome."]));
    body.appendChild(el("h4", {}, ["La decisione resta al clinico"]));
    body.appendChild(el("p", {}, ["Ogni flag deriva da regole trasparenti e mostra i fattori che lo determinano (punteggio scomposto). Ogni output è una bozza da rivedere e firmare. Il copilot non avvia azioni in autonomia."]));
    body.appendChild(el("h4", {}, ["Classificazione regolatoria preliminare"]));
    body.appendChild(el("ul", {}, [
      el("li", { html: "Profilo: <b>Clinical Decision Support</b> con uomo-nel-loop (non dispositivo diagnostico autonomo)." }),
      el("li", { html: "Sviluppo reale: valutazione come <b>software medical device</b> (MDR), intended use formale, validazione clinica, percorso CE." }),
    ]));
    body.appendChild(el("h4", {}, ["Dati & privacy"]));
    body.appendChild(el("ul", {}, [
      el("li", { html: "Dati <b>100% sintetici</b>, seed riproducibile (" + DATA.meta.seed + "). Nessun dato reale." }),
      el("li", { html: "In produzione: pseudonimizzazione, base giuridica e minimizzazione (GDPR), cifratura, RBAC, audit server-side." }),
      el("li", { html: "LLM live opzionale e <b>off di default</b>: la demo funziona offline con riassunti pre-generati." }),
    ]));
    body.appendChild(el("h4", {}, ["Disclaimer"]));
    body.appendChild(el("p", { html: "<b>Prototipo dimostrativo — NON destinato all'uso clinico.</b> Le performance cliniche non sono validate." }));
    body.appendChild(el("h4", {}, ["Audit trail della sessione"]));
    if (!STATE.audit.length) {
      body.appendChild(el("div", { class: "audit-empty2" }, ["Nessuna azione registrata. Genera o firma un output per popolare l'audit trail."]));
    } else {
      var tb = el("table", { class: "audit2" });
      tb.appendChild(el("tr", {}, [el("th", {}, ["Quando"]), el("th", {}, ["Chi"]), el("th", {}, ["Azione"]), el("th", {}, ["Paziente"])]));
      STATE.audit.forEach(function (a) {
        tb.appendChild(el("tr", {}, [
          el("td", {}, [a.ts]), el("td", {}, [a.actor]),
          el("td", {}, [el("b", {}, [a.action]), a.mode ? el("span", { style: "color:var(--mut)" }, [" · " + a.mode]) : null]),
          el("td", { style: "color:var(--mut)" }, [a.target]),
        ]));
      });
      body.appendChild(tb);
    }
    document.getElementById("drawer-ov").classList.add("open");
  }
  function closeDrawer() { document.getElementById("drawer-ov").classList.remove("open"); }

  // =============================================================================================
  // ROUTER + INIT
  // =============================================================================================
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    var m = (location.hash || "#/panel").match(/#\/patient\/(.+)$/);
    if (m) renderDetail(decodeURIComponent(m[1]));
    else renderPanel();
  }

  function init() {
    document.getElementById("user-initials").textContent = STATE.user.initials;
    document.getElementById("user-name").textContent = STATE.user.name;
    buildSidebar();

    document.getElementById("sb-brand").addEventListener("click", function () { closeNav(); go("#/panel"); });
    document.getElementById("sb-brand").addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeNav(); go("#/panel"); }
    });
    document.getElementById("nav-panel").addEventListener("click", function () { closeNav(); go("#/panel"); });
    document.getElementById("nav-flagship").addEventListener("click", function () { closeNav(); go("#/patient/MS-0142"); });
    document.getElementById("nav-gov").addEventListener("click", function () { closeNav(); openDrawer(); });
    document.getElementById("mb-gov").addEventListener("click", openDrawer);
    document.getElementById("dr-x").addEventListener("click", closeDrawer);
    document.getElementById("drawer-ov").addEventListener("click", function (e) {
      if (e.target.id === "drawer-ov") closeDrawer();
    });
    document.getElementById("burger").addEventListener("click", function () {
      document.getElementById("shell").classList.toggle("nav-open");
    });
    document.getElementById("scrim").addEventListener("click", closeNav);
    document.getElementById("search").addEventListener("input", function (e) {
      STATE.search = e.target.value;
      if (location.hash.indexOf("/patient/") < 0) renderPanel();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeDrawer(); closeNav(); }
    });
    window.addEventListener("hashchange", route);

    if (C && C.probe) C.probe();   // optional live-LLM probe; harmless offline
    route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
