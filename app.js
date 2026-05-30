/* Autonomic Journal — offline PWA, no backend. All state in localStorage. */
(() => {
  "use strict";

  const STORAGE_KEY = "autonomic.journal.v1";
  const SCHEMA_VERSION = 1;

  /* ---------------- Utilities ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateFromKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const nowTime = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fmtDateLong = (k) => {
    const d = dateFromKey(k);
    const today = keyOf(new Date());
    const yest = keyOf(new Date(Date.now() - 86400000));
    const tom = keyOf(new Date(Date.now() + 86400000));
    if (k === today) return "Today";
    if (k === yest) return "Yesterday";
    if (k === tom) return "Tomorrow";
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
  };

  // tiny DOM builder: el('div.cls', {attrs}, [children])
  function el(tag, attrs, children) {
    let cls = "";
    let id = "";
    const parts = tag.split(/([.#])/);
    let name = parts[0];
    for (let i = 1; i < parts.length; i += 2) {
      const tok = parts[i + 1];
      if (parts[i] === ".") cls += (cls ? " " : "") + tok;
      else id = tok;
    }
    const node = document.createElement(name || "div");
    if (cls) node.className = cls;
    if (id) node.id = id;
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function")
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    }
    if (children)
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    return node;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 1900);
  }

  /* ---------------- State ---------------- */
  const READING_TYPES = {
    hrv: { label: "HRV", unit: "", fields: ["value"] },
    breathHrv: { label: "Breathing HRV", unit: "", fields: ["value"] },
    bp: { label: "Blood Pressure", unit: "", fields: ["sys", "dia", "pulse"] },
  };

  function defaultState() {
    const mk = (name, extra = {}) => ({ id: uid(), name, archived: false, ...extra });
    return {
      version: SCHEMA_VERSION,
      settings: { theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" },
      meta: { lastUpdated: null, lastImport: null },
      defs: {
        activities: [mk("Indoor bike"), mk("Walk"), mk("Legs up")],
        meds: [],
        symptoms: [
          mk("High BP", { hasValue: true }),
          mk("Pressure"),
          mk("Labile HR"),
          mk("Light headed"),
          mk("Sick"),
        ],
      },
      days: {},
    };
  }

  let state = load();
  let currentKey = keyOf(new Date());
  let analysisRange = 30; // days; 0 = all

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.error("load failed", e);
      return defaultState();
    }
  }

  function migrate(s) {
    if (!s || typeof s !== "object") return defaultState();
    const base = defaultState();
    s.version = SCHEMA_VERSION;
    s.settings = Object.assign({}, base.settings, s.settings);
    s.meta = Object.assign({ lastUpdated: null, lastImport: null }, s.meta);
    s.defs = Object.assign({ activities: [], meds: [], symptoms: [] }, s.defs);
    s.days = s.days || {};
    return s;
  }

  // Centralized persistence. Every change to the app flows through here, so
  // this is where we stamp meta.lastUpdated. (See CLAUDE.md.)
  function save() {
    try {
      state.meta = state.meta || {};
      state.meta.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderStatus();
    } catch (e) {
      toast("Storage error — data may not be saved");
      console.error(e);
    }
  }

  // get or create a day record (does not save)
  function day(k = currentKey, create = false) {
    let d = state.days[k];
    if (!d && create) {
      d = state.days[k] = {
        sleep: { bed: "", wake: "" },
        readings: [],
        activities: {},
        meds: {},
        symptoms: {},
      };
    }
    return (
      d || { sleep: { bed: "", wake: "" }, readings: [], activities: {}, meds: {}, symptoms: {} }
    );
  }

  // Should a catalog item be shown for this day? Visible if active, or this
  // day already has a record for it (so archiving never erases the past).
  function visibleDefs(category, k) {
    const d = state.days[k];
    const recorded = (id) => {
      if (!d) return false;
      if (category === "activities") return id in d.activities;
      if (category === "meds") return id in d.meds;
      if (category === "symptoms") return id in d.symptoms;
      return false;
    };
    return state.defs[category].filter((it) => !it.archived || recorded(it.id));
  }

  /* ---------------- Theme ---------------- */
  function applyTheme() {
    const t = state.settings.theme;
    document.documentElement.setAttribute("data-theme", t);
    // ︎ forces text (monochrome) presentation so the glyph inherits
    // currentColor instead of rendering as a colored emoji.
    $("#themeBtn").textContent = t === "dark" ? "☀︎" : "☾︎";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#000000" : "#e03127");
  }
  function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    save();
    applyTheme();
  }

  /* ---------------- Status line (last updated / last import) ---------------- */
  function fmtStamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  function renderStatus() {
    const node = document.getElementById("statusLine");
    if (!node) return;
    const m = state.meta || {};
    const parts = ["Updated " + fmtStamp(m.lastUpdated)];
    if (m.lastImport && m.lastImport.name) parts.push("Imported: " + m.lastImport.name);
    node.textContent = parts.join("   ·   ");
  }

  /* ---------------- Modal system ---------------- */
  function openModal(buildBody) {
    clearModal(); // replace any existing drawer instantly
    const body = el("div.modal", {}, [el("div.modal-grip")]);
    const overlay = el("div.modal-overlay", {
      onclick: (e) => {
        if (e.target === overlay) closeModal();
      },
    }, [body]);
    buildBody(body, closeModal);
    $("#modalRoot").appendChild(overlay);
    document.body.style.overflow = "hidden";
  }
  function clearModal() {
    $("#modalRoot").innerHTML = "";
    document.body.style.overflow = "";
  }
  // Animate the drawer back down out of view, then remove it.
  function closeModal() {
    const overlay = $("#modalRoot").firstElementChild;
    document.body.style.overflow = "";
    if (!overlay) return;
    if (overlay.dataset.closing) return;
    overlay.dataset.closing = "1";
    overlay.classList.add("closing");
    const modal = overlay.querySelector(".modal");
    if (modal) modal.classList.add("closing");
    setTimeout(() => overlay.remove(), 240);
  }

  /* ---------------- Journal rendering ---------------- */
  function renderDate() {
    const lbl = $("#dateLabel");
    lbl.textContent = fmtDateLong(currentKey);
    lbl.classList.toggle("today", currentKey === keyOf(new Date()));
  }

  function shiftDay(delta) {
    const d = dateFromKey(currentKey);
    d.setDate(d.getDate() + delta);
    currentKey = keyOf(d);
    renderDate();
    renderDay();
  }

  function sectionHead(title, withDot, action) {
    return el("div.section-head", {}, [
      el("h3.section-title", {}, [withDot ? el("span.dot") : null, title]),
      action || null,
    ]);
  }

  function renderDay() {
    const root = $("#dayContent");
    root.innerHTML = "";
    root.appendChild(renderSleep());
    root.appendChild(renderReadings());
    root.appendChild(renderCatalog("activities", "Activities"));
    root.appendChild(renderCatalog("meds", "Medications & Supplements"));
    root.appendChild(renderCatalog("symptoms", "Symptoms"));
  }

  function renderSleep() {
    const d = day();
    const sec = el("div.section");
    sec.appendChild(sectionHead("Sleep"));
    const onChange = (field) => (e) => {
      day(currentKey, true).sleep[field] = e.target.value;
      save();
    };
    sec.appendChild(
      el("div.section-body", {}, [
        el("div.sleep-grid", {}, [
          el("div.sleep-cell", {}, [
            el("label", { text: "Wake time" }),
            el("input", { type: "time", value: d.sleep.wake || "", onchange: onChange("wake") }),
          ]),
          el("div.sleep-cell", {}, [
            el("label", { text: "Bed time" }),
            el("input", { type: "time", value: d.sleep.bed || "", onchange: onChange("bed") }),
          ]),
        ]),
      ])
    );
    return sec;
  }

  function readingSummary(r) {
    if (r.type === "bp") {
      let s = `${r.sys}/${r.dia}`;
      if (r.pulse) s += ` · ${r.pulse} bpm`;
      return s;
    }
    return String(r.value ?? "");
  }

  function renderReadings() {
    const d = day();
    const sec = el("div.section");
    sec.appendChild(
      sectionHead(
        "Readings",
        false,
        el("button.add-link", { text: "+ Add", onclick: () => readingMenu() })
      )
    );
    const bodyEl = el("div.section-body");
    const list = [...d.readings].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (!list.length) {
      bodyEl.appendChild(el("div.muted", { text: "No readings yet." }));
    } else {
      list.forEach((r) => {
        bodyEl.appendChild(
          el("div.row", { onclick: () => readingForm(r.type, r) }, [
            el("div.row-main", {}, [
              el("div.row-title", { text: READING_TYPES[r.type].label }),
              r.note ? el("div.row-sub", { text: r.note }) : null,
            ]),
            el("div.row-val", { text: readingSummary(r) }),
            r.time ? el("span.pill", { text: r.time }) : null,
          ])
        );
      });
    }
    sec.appendChild(bodyEl);
    return sec;
  }

  function readingMenu() {
    openModal((body) => {
      body.appendChild(el("h2", { text: "Add reading" }));
      Object.keys(READING_TYPES).forEach((type) => {
        body.appendChild(
          el("button.menu-item", {
            onclick: () => {
              closeModal();
              readingForm(type, null);
            },
          }, [
            el("span.mi-ico", { text: type === "bp" ? "🩸" : "💗" }),
            el("div", {}, [el("div", { text: READING_TYPES[type].label })]),
          ])
        );
      });
    });
  }

  function readingForm(type, existing) {
    const def = READING_TYPES[type];
    const r = existing
      ? { ...existing }
      : { id: uid(), type, time: nowTime(), note: "" };
    openModal((body) => {
      body.appendChild(el("h2", { text: (existing ? "Edit " : "") + def.label }));
      const inputs = {};
      if (type === "bp") {
        body.appendChild(
          el("div.field-inline", {}, [
            field("Systolic", (inputs.sys = numInput(r.sys))),
            field("Diastolic", (inputs.dia = numInput(r.dia))),
            field("Pulse", (inputs.pulse = numInput(r.pulse))),
          ])
        );
      } else {
        inputs.value = numInput(r.value);
        body.appendChild(field(def.label + " value", inputs.value));
      }
      const time = el("input", { type: "time", value: r.time || nowTime() });
      const note = el("input", { type: "text", value: r.note || "", placeholder: "Optional note" });
      body.appendChild(field("Time", time));
      body.appendChild(field("Note", note));

      body.appendChild(
        el("div.modal-actions", {}, [
          existing
            ? el("button.btn.btn-danger", {
                text: "Delete",
                onclick: () => {
                  const d = day(currentKey, true);
                  d.readings = d.readings.filter((x) => x.id !== r.id);
                  save();
                  closeModal();
                  renderDay();
                },
              })
            : null,
          el("button.btn.btn-primary", {
            text: "Save",
            onclick: () => {
              if (type === "bp") {
                r.sys = inputs.sys.value.trim();
                r.dia = inputs.dia.value.trim();
                r.pulse = inputs.pulse.value.trim();
                if (!r.sys && !r.dia) return toast("Enter a blood pressure");
              } else {
                r.value = inputs.value.value.trim();
                if (r.value === "") return toast("Enter a value");
              }
              r.time = time.value;
              r.note = note.value.trim();
              const d = day(currentKey, true);
              const i = d.readings.findIndex((x) => x.id === r.id);
              if (i >= 0) d.readings[i] = r;
              else d.readings.push(r);
              save();
              closeModal();
              renderDay();
            },
          }),
        ])
      );
    });
  }

  function field(label, input) {
    return el("div.field", {}, [el("label", { text: label }), input]);
  }
  function numInput(v) {
    return el("input", {
      type: "number",
      inputmode: "decimal",
      value: v ?? "",
      placeholder: "—",
    });
  }

  /* ----- Catalog sections (activities / meds / symptoms) ----- */
  function renderCatalog(category, title) {
    const sec = el("div.section");
    sec.appendChild(
      sectionHead(
        title,
        false,
        el("button.add-link", {
          text: "+ Add",
          onclick: () => defForm(category, null),
        })
      )
    );
    const bodyEl = el("div.section-body");
    const items = visibleDefs(category, currentKey);
    if (!items.length) {
      bodyEl.appendChild(el("div.muted", { text: "Nothing here yet. Tap “+ Add”." }));
    } else {
      items.forEach((it) => bodyEl.appendChild(catalogRow(category, it)));
    }
    sec.appendChild(bodyEl);
    return sec;
  }

  function catalogRow(category, it) {
    const d = day();
    const rec = d[category][it.id];
    const on = !!rec;
    const check = el("button.check" + (on ? ".on" : ""), {
      text: on ? "✓" : "",
      "aria-label": "Toggle " + it.name,
      onclick: () => toggleCatalog(category, it),
    });
    const sub = [];
    if (on && rec.value) sub.push(rec.value);
    if (on && rec.dose) sub.push(rec.dose);
    if (on && rec.time) sub.push(rec.time);
    return el("div.row", {}, [
      check,
      el("div.row-main", { onclick: () => toggleCatalog(category, it) }, [
        el("div.row-title", { text: it.name }),
        sub.length ? el("div.row-sub", { text: sub.join(" · ") }) : null,
      ]),
      el("button.row-edit", {
        text: "✎",
        "aria-label": "Edit " + it.name,
        onclick: (e) => {
          e.stopPropagation();
          defForm(category, it);
        },
      }),
    ]);
  }

  function toggleCatalog(category, it) {
    const d = day(currentKey, true);
    const map = d[category];
    if (it.id in map) {
      delete map[it.id];
      save();
      renderDay();
      return;
    }
    // turning on
    if (category === "symptoms" && it.hasValue) {
      promptValue(it.name, "", (val) => {
        map[it.id] = { time: nowTime(), value: val };
        save();
        renderDay();
      });
      return;
    }
    if (category === "meds") {
      map[it.id] = { time: nowTime(), dose: it.dose || "" };
    } else {
      map[it.id] = { time: nowTime() };
    }
    save();
    renderDay();
  }

  function promptValue(name, current, onSave) {
    openModal((body) => {
      body.appendChild(el("h2", { text: name }));
      const input = el("input", {
        type: "text",
        inputmode: "decimal",
        value: current || "",
        placeholder: "e.g. 150/95",
      });
      body.appendChild(field("Reading / value (optional)", input));
      body.appendChild(
        el("div.modal-actions", {}, [
          el("button.btn", { text: "Skip", onclick: () => { onSave(""); closeModal(); } }),
          el("button.btn.btn-primary", {
            text: "Save",
            onclick: () => { onSave(input.value.trim()); closeModal(); },
          }),
        ])
      );
      setTimeout(() => input.focus(), 50);
    });
  }

  // Add / edit a catalog definition
  function defForm(category, existing) {
    const labels = {
      activities: "Activity",
      meds: "Medication / Supplement",
      symptoms: "Symptom",
    };
    const it = existing ? { ...existing } : { id: uid(), name: "", archived: false };
    openModal((body) => {
      body.appendChild(el("h2", { text: (existing ? "Edit " : "Add ") + labels[category] }));
      const name = el("input", { type: "text", value: it.name || "", placeholder: labels[category] });
      body.appendChild(field("Name", name));

      let doseInput = null;
      let valueCheck = null;
      if (category === "meds") {
        doseInput = el("input", { type: "text", value: it.dose || "", placeholder: "e.g. 5 mg" });
        body.appendChild(field("Default dose (optional)", doseInput));
      }
      if (category === "symptoms") {
        valueCheck = el("input", { type: "checkbox" });
        valueCheck.checked = !!it.hasValue;
        body.appendChild(
          el("div.field", {}, [
            el("label", {}, [
              valueCheck,
              el("span", { text: " Record a value when logged (e.g. a BP number)", style: "margin-left:8px" }),
            ]),
          ])
        );
      }

      body.appendChild(
        el("div.modal-actions", {}, [
          existing
            ? el("button.btn.btn-danger", {
                text: "Delete",
                onclick: () => {
                  it.archived = true; // preserves past records
                  commitDef(category, it);
                  closeModal();
                  renderDay();
                  toast("Removed — past entries kept");
                },
              })
            : null,
          el("button.btn.btn-primary", {
            text: "Save",
            onclick: () => {
              const nm = name.value.trim();
              if (!nm) return toast("Enter a name");
              it.name = nm;
              if (doseInput) it.dose = doseInput.value.trim();
              if (valueCheck) it.hasValue = valueCheck.checked;
              commitDef(category, it);
              closeModal();
              renderDay();
            },
          }),
        ])
      );
      setTimeout(() => name.focus(), 50);
    });
  }

  function commitDef(category, it) {
    const arr = state.defs[category];
    const i = arr.findIndex((x) => x.id === it.id);
    if (i >= 0) arr[i] = it;
    else arr.push(it);
    save();
  }

  /* ---------------- Calendar ---------------- */
  function openCalendar() {
    let view = dateFromKey(currentKey);
    view.setDate(1);
    openModal((body) => {
      const wrap = el("div");
      body.appendChild(wrap);
      const draw = () => {
        wrap.innerHTML = "";
        const monthName = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        wrap.appendChild(
          el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px" }, [
            el("button.icon-btn", { text: "‹", onclick: () => { view.setMonth(view.getMonth() - 1); draw(); } }),
            el("strong", { text: monthName, style: "font-size:16px" }),
            el("button.icon-btn", { text: "›", onclick: () => { view.setMonth(view.getMonth() + 1); draw(); } }),
          ])
        );
        const grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center" });
        ["S", "M", "T", "W", "T", "F", "S"].forEach((d) =>
          grid.appendChild(el("div", { text: d, style: "font-size:11px;color:var(--text-dim);font-weight:700;padding:4px 0" }))
        );
        const first = new Date(view.getFullYear(), view.getMonth(), 1);
        const startPad = first.getDay();
        const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        for (let i = 0; i < startPad; i++) grid.appendChild(el("div"));
        const todayKey = keyOf(new Date());
        for (let dn = 1; dn <= daysInMonth; dn++) {
          const dk = keyOf(new Date(view.getFullYear(), view.getMonth(), dn));
          const isSel = dk === currentKey;
          const isToday = dk === todayKey;
          const hasData = dayHasData(dk);
          const btn = el("button", {
            style:
              "position:relative;aspect-ratio:1;border-radius:50%;border:none;cursor:pointer;font-size:14px;font-family:inherit;" +
              (isSel
                ? "background:var(--accent);color:#fff;font-weight:700;"
                : "background:transparent;color:var(--text);") +
              (isToday && !isSel ? "outline:2px solid var(--accent);outline-offset:-2px;" : ""),
            text: String(dn),
            onclick: () => {
              currentKey = dk;
              closeModal();
              renderDate();
              renderDay();
            },
          });
          if (hasData && !isSel)
            btn.appendChild(
              el("span", {
                style:
                  "position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:var(--accent)",
              })
            );
          grid.appendChild(btn);
        }
        wrap.appendChild(grid);
      };
      draw();
      body.appendChild(
        el("div.modal-actions", {}, [
          el("button.btn", {
            text: "Jump to Today",
            onclick: () => {
              currentKey = keyOf(new Date());
              closeModal();
              renderDate();
              renderDay();
            },
          }),
        ])
      );
    });
  }

  function dayHasData(k) {
    const d = state.days[k];
    if (!d) return false;
    return (
      (d.readings && d.readings.length) ||
      Object.keys(d.activities || {}).length ||
      Object.keys(d.meds || {}).length ||
      Object.keys(d.symptoms || {}).length ||
      (d.sleep && (d.sleep.bed || d.sleep.wake))
    );
  }

  /* ---------------- Menu / Import / Export ---------------- */
  function openMenu() {
    openModal((body) => {
      body.appendChild(el("h2", { text: "Menu" }));
      const item = (ico, title, sub, onclick) =>
        el("button.menu-item", { onclick }, [
          el("span.mi-ico", { text: ico }),
          el("div", {}, [el("div", { text: title }), sub ? el("div.mi-sub", { text: sub }) : null]),
        ]);
      body.appendChild(item("⬇", "Export data", "Download everything as JSON", () => { closeModal(); exportData(); }));
      body.appendChild(item("⬆", "Import data", "Replace everything from a JSON file", () => { closeModal(); importData(); }));
      const days = Object.keys(state.days).length;
      body.appendChild(
        el("div", {
          style: "margin-top:18px;font-size:12.5px;color:var(--text-dim);text-align:center",
          text: `Autonomic Journal · ${days} day${days === 1 ? "" : "s"} recorded · stored on this device`,
        })
      );
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `autonomic-journal-${keyOf(new Date())}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported");
  }

  function importData() {
    const input = el("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== "object" || !("days" in parsed))
            throw new Error("Not an Autonomic Journal file");
          confirmImport(parsed, file.name);
        } catch (e) {
          toast("Import failed: " + e.message);
        }
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
  }

  function confirmImport(parsed, fileName) {
    openModal((body) => {
      body.appendChild(el("h2", { text: "Replace all data?" }));
      const days = Object.keys(parsed.days || {}).length;
      body.appendChild(
        el("p", {
          style: "color:var(--text-dim);font-size:14px",
          text: `This will replace everything currently on this device with the imported file (${days} day${days === 1 ? "" : "s"}). This cannot be undone.`,
        })
      );
      body.appendChild(
        el("div.modal-actions", {}, [
          el("button.btn", { text: "Cancel", onclick: closeModal }),
          el("button.btn.btn-danger", {
            text: "Replace",
            onclick: () => {
              state = migrate(parsed);
              state.meta.lastImport = { name: fileName || "(file)", at: new Date().toISOString() };
              currentKey = keyOf(new Date());
              save();
              applyTheme();
              renderDate();
              renderDay();
              renderAnalysis();
              closeModal();
              toast("Imported");
            },
          }),
        ])
      );
    });
  }

  /* ---------------- Analysis ---------------- */
  function daysInRange() {
    const keys = Object.keys(state.days).sort();
    if (analysisRange === 0) return keys;
    const cutoff = keyOf(new Date(Date.now() - (analysisRange - 1) * 86400000));
    return keys.filter((k) => k >= cutoff);
  }

  function renderAnalysis() {
    const root = $("#analysisContent");
    root.innerHTML = "";

    // range tabs
    const tabs = el("div.range-tabs");
    [[7, "7d"], [30, "30d"], [90, "90d"], [0, "All"]].forEach(([val, lbl]) => {
      tabs.appendChild(
        el("button.range-tab" + (analysisRange === val ? ".active" : ""), {
          text: lbl,
          onclick: () => { analysisRange = val; renderAnalysis(); },
        })
      );
    });
    root.appendChild(tabs);

    const keys = daysInRange();
    if (!keys.length) {
      root.appendChild(el("div.chart-empty", { text: "No data in this range yet." }));
      return;
    }

    // collect series
    const hrv = [], breath = [], sys = [], dia = [];
    keys.forEach((k) => {
      const d = state.days[k];
      (d.readings || []).forEach((r) => {
        const num = parseFloat(r.value);
        if (r.type === "hrv" && !isNaN(num)) hrv.push({ k, v: num });
        if (r.type === "breathHrv" && !isNaN(num)) breath.push({ k, v: num });
        if (r.type === "bp") {
          const s = parseFloat(r.sys), dd = parseFloat(r.dia);
          if (!isNaN(s)) sys.push({ k, v: s });
          if (!isNaN(dd)) dia.push({ k, v: dd });
        }
      });
    });

    const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x.v, 0) / a.length) : null);
    const stat = (label, val, sub) =>
      el("div.stat", {}, [
        el("div.stat-label", { text: label }),
        el("div.stat-value", {}, [val == null ? "—" : String(val), sub ? el("small", { text: " " + sub }) : null]),
      ]);

    root.appendChild(
      el("div.stat-grid", {}, [
        stat("Avg HRV", avg(hrv)),
        stat("Avg Breathing HRV", avg(breath)),
        stat("Avg BP", avg(sys) != null ? `${avg(sys)}/${avg(dia)}` : null),
        stat("Days tracked", keys.length),
      ])
    );

    root.appendChild(lineChartCard("HRV", [{ data: hrv, color: "var(--accent)" }]));
    root.appendChild(lineChartCard("Breathing HRV", [{ data: breath, color: "#3b82f6" }]));
    root.appendChild(
      lineChartCard("Blood Pressure", [
        { data: sys, color: "var(--accent)", label: "Sys" },
        { data: dia, color: "#3b82f6", label: "Dia" },
      ])
    );

    root.appendChild(freqCard("Symptoms", "symptoms", keys));
    root.appendChild(freqCard("Activities", "activities", keys));
  }

  function lineChartCard(title, series) {
    const card = el("div.chart-card", {}, [el("h3", { text: title })]);
    const hasData = series.some((s) => s.data.length);
    if (!hasData) {
      card.appendChild(el("div.chart-empty", { text: "No readings in range." }));
      return card;
    }
    card.appendChild(buildLineChart(series));
    // legend
    if (series.length > 1) {
      card.appendChild(
        el("div", { style: "display:flex;gap:14px;margin-top:8px;font-size:12px;color:var(--text-dim)" },
          series.map((s) =>
            el("span", { style: "display:flex;align-items:center;gap:5px" }, [
              el("span", { style: `width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block` }),
              s.label || "",
            ])
          )
        )
      );
    }
    return card;
  }

  function buildLineChart(series) {
    const W = 320, H = 140, padL = 30, padR = 8, padT = 10, padB = 20;
    const allKeys = [...new Set(series.flatMap((s) => s.data.map((d) => d.k)))].sort();
    const xIndex = new Map(allKeys.map((k, i) => [k, i]));
    const n = allKeys.length;
    let min = Infinity, max = -Infinity;
    series.forEach((s) => s.data.forEach((d) => { min = Math.min(min, d.v); max = Math.max(max, d.v); }));
    if (min === max) { min -= 5; max += 5; }
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;

    const xFor = (k) => padL + (n <= 1 ? (W - padL - padR) / 2 : (xIndex.get(k) / (n - 1)) * (W - padL - padR));
    const yFor = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");

    // gridlines + y labels (min, mid, max)
    [min, (min + max) / 2, max].forEach((val) => {
      const y = yFor(val);
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("stroke", "var(--border)"); line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", 2); t.setAttribute("y", y + 3);
      t.setAttribute("font-size", "9"); t.setAttribute("fill", "var(--text-dim)");
      t.textContent = Math.round(val);
      svg.appendChild(t);
    });

    series.forEach((s) => {
      if (!s.data.length) return;
      const pts = [...s.data].sort((a, b) => a.k.localeCompare(b.k));
      const dStr = pts.map((p, i) => `${i ? "L" : "M"}${xFor(p.k).toFixed(1)} ${yFor(p.v).toFixed(1)}`).join(" ");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", dStr);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", s.color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
      pts.forEach((p) => {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", xFor(p.k)); c.setAttribute("cy", yFor(p.v));
        c.setAttribute("r", "2.5"); c.setAttribute("fill", s.color);
        svg.appendChild(c);
      });
    });

    return el("div.chart", {}, [svg]);
  }

  function freqCard(title, category, keys) {
    const card = el("div.chart-card", {}, [el("h3", { text: title })]);
    const counts = new Map();
    keys.forEach((k) => {
      const d = state.days[k];
      Object.keys((d && d[category]) || {}).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    const nameOf = (id) => {
      const def = state.defs[category].find((x) => x.id === id);
      return def ? def.name : "—";
    };
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      card.appendChild(el("div.chart-empty", { text: "None logged in range." }));
      return card;
    }
    const maxC = rows[0][1];
    rows.forEach(([id, c]) => {
      card.appendChild(
        el("div.freq-row", {}, [
          el("div.freq-name", { text: nameOf(id) }),
          el("div.freq-bar-wrap", {}, [el("div.freq-bar", { style: `width:${(c / maxC) * 100}%` })]),
          el("div.freq-count", { text: String(c) }),
        ])
      );
    });
    return card;
  }

  /* ---------------- View switching ---------------- */
  function switchView(name) {
    const journal = name === "journal";
    $("#journalView").classList.toggle("hidden", !journal);
    $("#analysisView").classList.toggle("hidden", journal);
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === name)
    );
    if (!journal) renderAnalysis();
  }

  /* ---------------- Wire up ---------------- */
  function init() {
    applyTheme();
    renderStatus();
    renderDate();
    renderDay();

    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#menuBtn").addEventListener("click", openMenu);
    $("#prevDay").addEventListener("click", () => shiftDay(-1));
    $("#nextDay").addEventListener("click", () => shiftDay(1));
    $("#dateLabel").addEventListener("click", openCalendar);
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => switchView(t.dataset.view))
    );

    // keyboard: left/right arrows change day
    document.addEventListener("keydown", (e) => {
      if ($("#modalRoot").children.length) {
        if (e.key === "Escape") closeModal();
        return;
      }
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") shiftDay(-1);
      if (e.key === "ArrowRight") shiftDay(1);
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () =>
        navigator.serviceWorker.register("sw.js").catch(() => {})
      );
    }
  }

  init();
})();
