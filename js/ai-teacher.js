import * as st from "./store.js";
import { WORKER_URL } from "./ai-config.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const fmt = s => { s = Math.round(s||0); return Math.floor(s/60) + " хв " + String(s%60).padStart(2,"0") + " с"; };
const DEFAULT_CRITERIA = [
  { name: "Знання матеріалу", desc: "повнота і точність фактів, понять, термінів з лекції", max: 4 },
  { name: "Розуміння зв'язків", desc: "пояснює причини і наслідки, а не лише називає", max: 3 },
  { name: "Застосування", desc: "наводить власні приклади, переносить знання на нову ситуацію, зокрема на Україну", max: 3 },
  { name: "Самостійність", desc: "відповідає своїми словами, аргументує, справляється з уточнювальними питаннями", max: 2 }
];
let COURSE, SETTINGS, TAB = "setup", ROWS = [], SEL = { topic: "", group: "", id: "" }, VER = {};

let warnT = null;
function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); clearTimeout(warnT); warnT = setTimeout(()=>a.classList.remove("show"), 8000); }
// повідомлення в картці співбесіди, біля кнопки «Зберегти» (видно, навіть коли сторінку прокручено вниз)
function boxMsg(id, m, bad = true){ const el = document.querySelector(`.tp[data-t="${id}"] .boxmsg`); if (el) { el.className = "boxmsg " + (bad ? "bad" : "ok"); el.textContent = m; } else warn(m); }
const allTopics = () => COURSE.sections.flatMap(s => s.topics);
const readyTopics = () => allTopics().filter(t => t.ready);
const link = id => new URL(`interview.html?i=${id}`, location.href).href;
const workerReady = () => !/ВСТАВТЕ/.test(WORKER_URL);

async function start(){
  if (st.DEMO) $("demo").innerHTML = '<span class="demo">Демо-режим: Firebase ще не підключено</span>';
  let u = null;
  try { u = await st.teacherCurrent(); } catch(e){ warn(esc(e.message||e)); }
  if (!u){
    $("app").innerHTML = `<div class="card"><h3 style="margin-top:0">Вхід викладача</h3><button id="gin">Увійти через Google</button></div>`;
    await new Promise(res => { $("gin").onclick = async () => { try { u = await st.teacherSignIn(); res(); } catch(e){ warn(esc(e.message||e)); } }; });
  }
  $("who").textContent = u.email;
  COURSE = await fetch("course.json").then(r => r.json());
  SETTINGS = await st.getSettings(); SETTINGS.groups ||= []; SETTINGS.topics ||= {}; SETTINGS.ai ||= {}; snap();
  try { ROSTER = await st.getRoster(); } catch(e){ ROSTER = {}; }
  render();
}
function tabs(){ return `<div class="tabs">${[["setup","Налаштування"],["results","Результати"]].map(([k,l])=>`<button class="${TAB===k?'on':''}" data-act="tab" data-v="${k}">${l}</button>`).join("")}</div>`; }
function render(){ TAB === "setup" ? renderSetup() : renderResults(); }

// ---------- налаштування
function critRows(list){
  return list.map(c => `<tr><td><input type="text" class="cn" value="${esc(c.name)}"></td><td><input type="text" class="cd" value="${esc(c.desc||"")}"></td>
    <td><input type="text" class="cm num" value="${esc(c.max)}" inputmode="numeric"></td><td><button class="sm sec" data-act="delCrit">✕</button></td></tr>`).join("");
}
const MAX_TOPICS = 6;
// ---------- стан співбесід: що збережено, що змінено, що ще не зроблено
let SAVED = {}, ATT = {};
const snap = () => { SAVED = JSON.parse(JSON.stringify(SETTINGS.ai || {})); };
function formOf(box){
  return {
    title: box.querySelector(".ti").value.trim(),
    topics: [...box.querySelectorAll(".tc:checked")].map(i => i.value),
    open: box.querySelector(".op").checked,
    nq: parseInt(box.querySelector(".nq").value, 10), minutes: parseInt(box.querySelector(".mn").value, 10),
    showScore: box.querySelector(".ss").checked,
    groups: [...box.querySelectorAll(".gr:checked")].map(i => i.value),
    criteria: [...box.querySelectorAll(".crit tbody tr")].map(tr => ({ name: tr.querySelector(".cn").value.trim(), desc: tr.querySelector(".cd").value.trim(), max: parseInt(tr.querySelector(".cm").value, 10) })).filter(c => c.name)
  };
}
const cmpKeys = ["title","topics","open","nq","minutes","showScore","groups","criteria"];
const pick = o => JSON.stringify(cmpKeys.map(k => o ? o[k] : null));
// стан збереженої співбесіди (для огляду і плашки)
function stateOf(id){
  const s = SAVED[id];
  if (!s || s.unsaved) return { key: "new", label: "Не збережено", cls: "st-warn" };
  const miss = [];
  if (!s.title) miss.push("назва"); if (!(s.topics||[]).length) miss.push("теми"); if (!(s.groups||[]).length) miss.push("групи");
  if (s.open && !miss.length && workerReady()) return { key: "open", label: "Відкрита — студенти можуть заходити", cls: "st-ok" };
  if (s.open) return { key: "broken", label: "Відкрита, але не працює: " + (miss.length ? "бракує — " + miss.join(", ") : "немає адреси воркера"), cls: "st-bad" };
  return { key: "closed", label: "Закрита — студенти не можуть зайти", cls: "st-off" };
}
function paintStatus(id){
  const box = document.querySelector(`.tp[data-t="${id}"]`); if (!box) return;
  const f = formOf(box), s = SAVED[id], saved = s && !s.unsaved, dirty = saved && pick(f) !== pick(s);
  const st0 = stateOf(id);
  const head = !saved ? { label: "Не збережено — студенти поки не можуть зайти", cls: "st-warn" }
    : dirty ? { label: "Є незбережені зміни — натисніть «Зберегти». Зараз діє: " + st0.label.toLowerCase(), cls: "st-warn" } : st0;
  const it = (ok, text, warnOnly) => `<li class="${ok ? "ok" : warnOnly ? "wn" : "no"}">${ok ? "✓" : warnOnly ? "!" : "✗"} ${text}</li>`;
  const tl = f.topics.length, a = ATT[id];
  const list = [
    it(!!f.title, f.title ? "Назва вказана" : "Вкажіть назву"),
    it(tl > 0, tl ? `Теми: ${tl}` : "Оберіть хоча б одну тему"),
    it(f.groups.length > 0, f.groups.length ? `Групи: ${f.groups.map(esc).join(", ")}` : "Відмітьте групи"),
    tl ? it(f.nq >= tl, f.nq >= tl ? `Питань: ${f.nq} (≈${Math.max(1, Math.floor(f.nq / tl))} на тему)` : `Питань (${f.nq}) менше, ніж тем (${tl}) — частина тем без питань`, true) : "",
    it(f.open, f.open ? "Відмічено «Відкрита»" : "Не відмічено «Відкрита» — студенти побачать «закрита»"),
    it(saved && !dirty, saved && !dirty ? "Збережено" : "Не збережено — натисніть «Зберегти»"),
    workerReady() ? "" : it(false, "Не вказано адресу воркера в js/ai-config.js")
  ].join("");
  box.querySelector(".ivstat").innerHTML = `<div class="stbar ${head.cls}">${esc(head.label)}</div>
    <ul class="chkl">${list}</ul>
    ${saved ? `<div class="hint">Результати: ${a ? `<b>${a.done}</b> завершили · <b>${a.prog}</b> в процесі` : "…"}</div>` : ""}`;
  box.className = "tp " + head.cls;
}
async function loadCounts(){
  await Promise.all(interviews().filter(([id]) => SAVED[id] && !SAVED[id].unsaved).map(async ([id]) => {
    try { const rows = await st.listAttempts("ai-" + id); ATT[id] = { done: rows.filter(r => r.done).length, prog: rows.filter(r => !r.done).length }; }
    catch(e){ ATT[id] = null; }
  }));
  if (TAB === "setup") { interviews().forEach(([id]) => paintStatus(id)); paintOverview(); }
}
function paintOverview(){
  const el = $("overview"); if (!el) return;
  const list = interviews();
  el.innerHTML = list.length ? `<table class="rep"><tr><th>Співбесіда</th><th>Стан</th><th>Групи</th><th>Результати</th></tr>${list.map(([id, c]) => {
    const s = SAVED[id] || c, st0 = stateOf(id), a = ATT[id];
    return `<tr class="clk" data-act="goto" data-v="${id}"><td><b>${esc(s.title || "без назви")}</b><br><span class="hint">${(s.topics||[]).length} тем · ${s.nq||"?"} питань</span></td>
      <td><span class="pill ${st0.cls}">${esc(st0.label)}</span></td><td>${(s.groups||[]).map(esc).join(", ") || '<span class="bad">не вибрано</span>'}</td>
      <td>${a ? `${a.done} завершили${a.prog ? ` · ${a.prog} в процесі` : ""}` : (st0.key === "new" ? "—" : "…")}</td></tr>`; }).join("")}</table>` : "";
}
const interviews = () => Object.entries(SETTINGS.ai).filter(([id,c]) => c && Array.isArray(c.topics)).sort((x,y) => (y[1].created||0) - (x[1].created||0));
const tTitle = id => { const t = allTopics().find(x => x.id === id); return t ? `${t.num}. ${t.title}` : id; };
function renderSetup(){
  const G = SETTINGS.groups, list = interviews();
  $("app").innerHTML = tabs() +
    (workerReady() ? "" : `<div class="info">Ще не вказано адресу воркера у файлі <code>js/ai-config.js</code> — співбесіди не працюватимуть, доки ви її не вставите.</div>`) +
    `<div class="card"><div class="row"><h3 style="margin:0">Співбесіди</h3><span class="sp"></span><button data-act="new">+ Нова співбесіда</button></div>
    <p class="hint">Співбесіда може охоплювати одну або кілька тем (до ${MAX_TOPICS}). ШІ розподілить питання між обраними темами. Групи редагуються в основному кабінеті.</p>
    ${list.length ? '<div id="overview"></div>' : '<p class="hint">Ще немає жодної співбесіди. Натисніть «+ Нова співбесіда».</p>'}
    ${list.map(([id, c]) => {
      const crit = c.criteria && c.criteria.length ? c.criteria : DEFAULT_CRITERIA;
      const sum = crit.reduce((s,x)=>s+Number(x.max||0),0);
      return `<div class="tp" data-t="${id}"><div class="ivstat"></div>
        <label>Назва</label><input type="text" class="ti" value="${esc(c.title||"")}" placeholder="Напр., Тематична: Літосфера і ґрунти (теми 9–12)">
        <label>Теми</label>
        <div>${COURSE.sections.map(sec => { const ts = sec.topics.filter(t => t.ready); return ts.length ? `<div class="hint" style="margin-top:6px">${esc(sec.title)}</div>${ts.map(t =>
          `<label class="chk"><input type="checkbox" class="tc" value="${t.id}" ${c.topics.includes(t.id)?'checked':''}> ${t.num}. ${esc(t.title.length > 70 ? t.title.slice(0,70) + "…" : t.title)}</label>`).join("")}` : ""; }).join("")}</div>
        <div class="row" style="margin-top:10px">
          <label class="chk"><input type="checkbox" class="op" ${c.open?'checked':''}> Відкрита</label>
          <span class="hint">Питань:</span><input type="text" class="nq num" value="${esc(c.nq||6)}" inputmode="numeric">
          <span class="hint">Час, хв (0 — без обмеження):</span><input type="text" class="mn num" value="${esc(c.minutes ?? 20)}" inputmode="numeric">
          <label class="chk"><input type="checkbox" class="ss" ${c.showScore?'checked':''}> Показувати студенту бал ШІ</label>
        </div>
        <div><span class="hint">Групи: </span>${G.map(g=>`<label class="chk"><input type="checkbox" class="gr" value="${esc(g)}" ${(c.groups||[]).includes(g)?'checked':''}> ${esc(g)}</label>`).join("") || '<span class="hint">спершу додайте групи в основному кабінеті</span>'}</div>
        <details class="cfg"><summary>Критерії оцінювання (разом ${sum} б.)</summary>
          <table class="rep crit" style="margin-top:6px"><thead><tr><th>Критерій</th><th>Що оцінюється</th><th>Макс</th><th></th></tr></thead><tbody>${critRows(crit)}</tbody></table>
          <div class="row" style="margin-top:6px"><button class="sm sec" data-act="addCrit">+ критерій</button><button class="sm sec" data-act="resetCrit">Стандартні</button></div>
        </details>
        <div class="row" style="margin-top:8px">${c.unsaved ? '<span class="hint">Посилання з\'явиться після збереження</span>' : `<code>${esc(link(id))}</code><button class="sm sec" data-act="copy" data-v="${esc(link(id))}">Копіювати</button>`}<span class="sp"></span><span class="boxmsg"></span>
          <button class="sm sec" data-act="delIv" data-v="${id}">Видалити</button><button class="sm" data-act="save" data-v="${id}">Зберегти</button></div>
      </div>`;
    }).join("")}</div>`;
  interviews().forEach(([id]) => paintStatus(id)); paintOverview(); loadCounts();
}
async function newInterview(){
  const id = "s" + Date.now().toString(36);
  SETTINGS.ai[id] = { title: "", topics: [], open: false, nq: 6, minutes: 20, showScore: false, groups: [], criteria: DEFAULT_CRITERIA, created: Date.now(), unsaved: true };
  render();
  const box = document.querySelector(`.tp[data-t="${id}"]`); box.scrollIntoView({ behavior: "smooth", block: "center" }); box.querySelector(".ti").focus();
}
async function saveTopic(id){
  const box = document.querySelector(`.tp[data-t="${id}"]`);
  const crit = [...box.querySelectorAll(".crit tbody tr")].map(tr => ({
    name: tr.querySelector(".cn").value.trim(), desc: tr.querySelector(".cd").value.trim(), max: parseInt(tr.querySelector(".cm").value, 10)
  })).filter(c => c.name);
  const topics = [...box.querySelectorAll(".tc:checked")].map(i => i.value);
  const title = box.querySelector(".ti").value.trim();
  if (!title) { boxMsg(id, "Вкажіть назву співбесіди — її бачитимуть студенти."); return; }
  if (!topics.length) { boxMsg(id, "Оберіть хоча б одну тему."); return; }
  if (topics.length > MAX_TOPICS) { boxMsg(id, `Не більше ${MAX_TOPICS} тем в одній співбесіді.`); return; }
  if (!crit.length) { boxMsg(id, "Потрібен хоча б один критерій."); return; }
  if (crit.some(c => !(c.max >= 1 && c.max <= 100))) { boxMsg(id, "Максимальний бал критерію — ціле число від 1 до 100."); return; }
  if (new Set(crit.map(c=>c.name)).size !== crit.length) { boxMsg(id, "Назви критеріїв не повинні повторюватися."); return; }
  const nq = parseInt(box.querySelector(".nq").value, 10), mn = parseInt(box.querySelector(".mn").value, 10);
  if (!(nq >= 3 && nq <= 12)) { boxMsg(id, "Кількість питань — від 3 до 12."); return; }
  if (!(mn >= 0 && mn <= 180)) { boxMsg(id, "Час — від 0 до 180 хвилин."); return; }
  if (nq < topics.length) { if (!confirm(`Тем (${topics.length}) більше, ніж питань (${nq}) — деякі теми залишаться без питання. Зберегти так?`)) return; }
  SETTINGS.ai[id] = { title, topics, open: box.querySelector(".op").checked, nq, minutes: mn, showScore: box.querySelector(".ss").checked,
    groups: [...box.querySelectorAll(".gr:checked")].map(i => i.value), criteria: crit, created: (SETTINGS.ai[id] && SETTINGS.ai[id].created) || Date.now() };
  await st.saveSettings(SETTINGS); snap(); render(); boxMsg(id, "Збережено ✓ Зміни діють приблизно за 30 секунд.", false);
}
async function deleteInterview(id){
  const c = SETTINGS.ai[id] || {};
  if (!confirm(`Видалити співбесіду «${c.title || "без назви"}»? Студенти більше не зможуть її пройти. Уже збережені результати залишаться в базі.`)) return;
  delete SETTINGS.ai[id]; await st.saveSettings(SETTINGS); snap(); warn("Співбесіду видалено."); render();
}

// ---------- результати
async function loadRows(){
  ROWS = SEL.topic ? await st.listAttempts("ai-" + SEL.topic) : [];
  ROWS.sort((a,b) => a.group.localeCompare(b.group, "uk") || a.name.localeCompare(b.name, "uk"));
  VER = {};
  if (workerReady()) ROWS.forEach(r => verify(r));
}
async function verify(r){
  if (!r.messages || r.messages.length < 2 || !r.sig) { VER[r.id] = "none"; return; }
  try {
    const res = await fetch(WORKER_URL.replace(/\/$/,"") + "/verify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: r.t, sid: r.id, messages: r.messages, sig: r.sig, eval: r.done ? (r.eval ?? null) : null }) }).then(x => x.json());
    VER[r.id] = res.ok ? "ok" : "bad";
  } catch(e){ VER[r.id] = "err"; }
  if (TAB === "results") paintVer(r.id);
}
function verLabel(v){
  return v === "ok" ? '<span class="ok" title="Протокол підписаний сервером і не змінювався">✓</span>'
    : v === "bad" ? '<span class="bad" title="Протокол або оцінку змінено поза співбесідою">⚠ змінено</span>'
    : v === "none" ? '<span class="hint">—</span>' : v === "err" ? '<span class="hint">?</span>' : '<span class="hint">…</span>';
}
function paintVer(id){ document.querySelectorAll(`[data-ver="${CSS.escape(id)}"]`).forEach(el => el.innerHTML = verLabel(VER[id])); }
function suspect(v){
  const s = String(v||"").toLowerCase();
  return s.startsWith("вис") ? '<span class="pill p-hi">висока</span>' : s.startsWith("сер") ? '<span class="pill p-mid">середня</span>' : s.startsWith("низ") ? '<span class="pill p-lo">низька</span>' : '<span class="hint">—</span>';
}
const nqOf = r => (SETTINGS.ai[r.t] || {}).nq || 6;
function asked(r){ return (r.messages||[]).filter(m => m.role === "assistant" && /Питання\s+\d+\s+з\s+\d+/.test(m.content)).length; }
function duration(r){ const a = r.meta && r.meta.startedAt, b = (r.meta && r.meta.finishedAt) || r.updatedAt; return a && b ? (new Date(b) - new Date(a)) / 1000 : 0; }
function avgSecs(r){ const s = (r.meta && r.meta.secs) || []; return s.length ? s.reduce((x,y)=>x+y,0) / s.length : 0; }

// стан спроби студента
function attemptState(r){
  if (!r) return { label: "не розпочинав", cls: "st-off", order: 3 };
  const e = r.eval || evalFromText(r);
  if (VER[r.id] === "bad") return { label: "⚠ протокол змінено", cls: "st-bad", order: 0 };
  if (r.done && e && e.error) return { label: "завершено, оцінку не сформовано", cls: "st-bad", order: 1 };
  if (r.done) return { label: "завершено", cls: "st-ok", order: 4 };
  if (e) return { label: "обірвано (стара версія)", cls: "st-bad", order: 1 };
  const k = asked(r), n = nqOf(r), idle = (Date.now() - new Date(r.updatedAt || 0)) / 60000;
  return { label: !k ? "увійшов, питань ще не було" : `в процесі · питання ${k} з ${n}` + (idle > 30 ? " · без активності " + Math.round(idle) + " хв" : ""), cls: "st-warn", order: 2 };
}
const normN = n => st.normPart(n).split(" ").filter(Boolean).sort().join(" ");
// усі студенти співбесіди: хто проходив + хто зі списку групи ще не почав
function allRows(){
  const cfg = SAVED[SEL.topic] || SETTINGS.ai[SEL.topic] || {};
  const rows = ROWS.map(r => ({ r, group: r.group, name: r.name }));
  const have = new Set(ROWS.map(r => r.group + "|" + normN(r.name)));
  (cfg.groups || []).forEach(g => (ROSTER[g] || []).forEach(n => { if (!have.has(g + "|" + normN(n))) rows.push({ r: null, group: g, name: n }); }));
  return rows.filter(x => !SEL.group || x.group === SEL.group)
    .sort((x, y) => x.group.localeCompare(y.group, "uk", { numeric: true }) || x.name.localeCompare(y.name, "uk"));
}
function renderResults(){
  const list = interviews();
  if (SEL.topic && !list.some(([id]) => id === SEL.topic)) list.push([SEL.topic, { title: "(видалена співбесіда)" }]);
  const cfg = SAVED[SEL.topic] || {};
  const groups = [...new Set([...(cfg.groups || []), ...ROWS.map(r => r.group)])];
  const rows = SEL.topic ? allRows() : [];
  const att = rows.filter(x => x.r).map(x => x.r);
  // підсумок по групах
  const sum = groups.filter(g => !SEL.group || g === SEL.group).map(g => {
    const gr = rows.filter(x => x.group === g), c = { done: 0, prog: 0, none: 0, bad: 0 };
    gr.forEach(x => { const s0 = attemptState(x.r); if (s0.cls === "st-ok") c.done++; else if (s0.cls === "st-warn") c.prog++; else if (s0.cls === "st-bad") c.bad++; else c.none++; });
    return `<div class="gsum"><b>${esc(g)}</b> <span class="pill st-ok">${c.done} завершили</span>${c.prog ? ` <span class="pill st-warn">${c.prog} в процесі</span>` : ""}${c.bad ? ` <span class="pill st-bad">${c.bad} з проблемою</span>` : ""}${c.none ? ` <span class="pill st-off">${c.none} не розпочинали</span>` : ""}${!ROSTER[g] ? ' <span class="hint">(списку групи немає — видно лише тих, хто заходив)</span>' : ""}</div>`;
  }).join("");
  $("app").innerHTML = tabs() + `<div class="card">
    <div class="row"><select id="selT" style="width:auto;flex:1;min-width:240px"><option value="">— співбесіда —</option>${list.map(([id,c])=>`<option value="${id}" ${SEL.topic===id?'selected':''}>${esc(c.title||"без назви")}</option>`).join("")}</select>
      <select id="selG" style="width:auto"><option value="">Усі групи</option>${groups.map(g=>`<option ${SEL.group===g?'selected':''}>${esc(g)}</option>`).join("")}</select>
      <button class="sec sm" data-act="reload">Оновити</button><button class="sec sm" data-act="csv" ${att.length?'':'disabled'}>CSV</button><button class="sec sm" data-act="json" ${att.length?'':'disabled'}>JSON (протоколи)</button></div>
    ${SEL.topic ? `<div style="margin-top:12px">${sum}</div>` + (rows.length ? `<div style="overflow-x:auto;margin-top:8px"><table class="rep"><thead><tr><th>Студент</th><th>Група</th><th>Стан</th><th>Бал ШІ</th><th>Підозра ШІ</th><th title="Перемикання вкладок">Вкладки</th><th title="Спроби вставити текст">Вставки</th><th>Сер. час відповіді</th><th>Тривалість</th><th title="Цілісність протоколу">Протокол</th></tr></thead><tbody>
      ${rows.map(({ r, group, name }) => { const s0 = attemptState(r); if (!r) return `<tr class="none"><td>${esc(name)}</td><td>${esc(group)}</td><td><span class="pill st-off">не розпочинав</span></td><td colspan="7"></td></tr>`;
        const e = r.eval || evalFromText(r) || {}; return `<tr class="clk" data-act="open" data-v="${esc(r.id)}">
        <td>${esc(r.name)}</td><td>${esc(r.group)}</td><td><span class="pill ${s0.cls}">${esc(s0.label)}</span></td>
        <td>${e.max ? `<b>${e.total}</b> / ${e.max}` : "—"}</td><td>${e.ai_suspect ? suspect(e.ai_suspect) : "—"}</td>
        <td>${(r.meta&&r.meta.blur)||0}</td><td>${(r.meta&&r.meta.pastes)||0}</td><td>${fmt(avgSecs(r))}</td><td>${fmt(duration(r))}</td>
        <td data-ver="${esc(r.id)}">${verLabel(VER[r.id])}</td></tr>`; }).join("")}
      </tbody></table></div>` : '<p class="hint" style="margin-top:12px">Ще ніхто не проходив цю співбесіду, а списків груп немає.</p>') : `<p class="hint" style="margin-top:12px">Оберіть співбесіду.</p>`}
  </div>
  ${att.length ? `<div class="card"><div class="row"><h3 style="margin:0">Протоколи (${att.length})</h3><span class="sp"></span><button class="sm sec" data-act="expandAll">Розгорнути всі</button><button class="sm sec" data-act="collapseAll">Згорнути всі</button></div>
    ${rows.filter(x => x.r).map(({ r }) => { const s0 = attemptState(r), e = r.eval || evalFromText(r);
      return `<details class="proto" id="p-${esc(r.id)}" ${COLLAPSED.has(r.id) ? "" : "open"} data-pid="${esc(r.id)}"><summary><b>${esc(r.name)}</b> · ${esc(r.group)} <span class="pill ${s0.cls}">${esc(s0.label)}</span>${e && e.max ? ` <b>${e.total} / ${e.max}</b>` : ""}</summary>${detailHtml(r)}</details>`; }).join("")}</div>` : ""}`;
  $("selT").onchange = async e => { SEL = { topic: e.target.value, group: "", id: "" }; await loadRows(); render(); };
  $("selG").onchange = e => { SEL.group = e.target.value; SEL.id = ""; render(); };
  document.querySelectorAll("details.proto").forEach(d => d.addEventListener("toggle", () => { d.open ? COLLAPSED.delete(d.dataset.pid) : COLLAPSED.add(d.dataset.pid); }));
  if (SEL.id) { const d = document.getElementById("p-" + SEL.id); if (d) { d.open = true; COLLAPSED.delete(SEL.id); d.scrollIntoView({ behavior: "smooth", block: "start" }); } SEL.id = ""; }
}
let COLLAPSED = new Set(), ROSTER = {};
function detailHtml(r){
  const e = r.eval || evalFromText(r), secs = (r.meta && r.meta.secs) || [];
  let ui = 0;
  return `<div class="pbody">
    <div class="row"><span class="sp"></span><span data-ver="${esc(r.id)}">${verLabel(VER[r.id])}</span></div>
    ${e ? `${e.error ? '<div class="alert show">ШІ не зміг коректно сформувати оцінку — оцініть за протоколом вручну.</div>' : ""}
      <table class="rep"><thead><tr><th>Критерій</th><th>Бал</th><th>Коментар ШІ</th></tr></thead><tbody>
      ${(e.criteria||[]).map(c=>`<tr><td>${esc(c.name)}</td><td style="white-space:nowrap"><b>${c.score}</b> / ${c.max}</td><td>${esc(c.comment)}</td></tr>`).join("")}</tbody></table>
      <p><b>Підсумок:</b> ${esc(e.summary)}</p>
      ${e.gaps && e.gaps.length ? `<p><b>Прогалини:</b> ${e.gaps.map(esc).join("; ")}</p>` : ""}
      ${e.ai_suspect ? `<p><b>Ймовірність використання ШІ:</b> ${suspect(e.ai_suspect)} ${esc(e.ai_suspect_why)}</p>` : ""}` : `<p class="hint">Співбесіда ще не завершена — оцінки поки немає.</p>`}
    <p class="hint">Вкладки: ${(r.meta&&r.meta.blur)||0} · Спроби вставки: ${(r.meta&&r.meta.pastes)||0} · Тривалість: ${fmt(duration(r))}${r.meta&&r.meta.aiNoticeAccepted ? ` · Попередження про ШІ прийнято: ${new Date(r.meta.aiNoticeAccepted).toLocaleString("uk-UA")}` : ""}</p>
    ${e && !r.eval ? '<div class="info">Оцінку відновлено з тексту діалогу (стара версія воркера). Протокол не завершено — за потреби дозвольте пройти заново.</div>' : ""}
    ${(r.messages||[]).slice(1).map(m => m.role === "user"
        ? `<div class="msg me">${esc(m.content)}${secs[ui] != null ? `<small>${fmt(secs[ui++])} · ${m.content.length} симв.</small>` : ""}</div>`
        : `<div class="msg ai">${esc(m.content.split(/<eval>/i)[0].trim() || "(оцінка — вище)")}</div>`).join("")}
    <div class="row" style="margin-top:12px"><span class="sp"></span>
      ${!r.done && r.uid ? `<button class="sm sec" data-act="unbind" data-v="${esc(r.id)}">Дозволити продовжити з іншого пристрою</button>` : ""}
      <button class="sm sec" data-act="del" data-v="${esc(r.id)}">Дозволити пройти заново</button></div>
  </div>`;
}
// оцінка, що потрапила в текст повідомлення ШІ (обрізана чи без тега) → об'єкт для показу
function evalFromText(r){
  const last = [...(r.messages||[])].reverse().find(m => m.role === "assistant" && /<eval>/i.test(m.content));
  if (!last) return null;
  let raw = last.content.split(/<eval>/i)[1].replace(/<\/eval>[\s\S]*$/i, "").trim(), o = null;
  try { o = JSON.parse(raw); } catch(e) {
    const crit = [...raw.matchAll(/"name"\s*:\s*"([^"]*)"\s*,\s*"score"\s*:\s*(\d+)\s*,\s*"max"\s*:\s*(\d+)\s*,\s*"comment"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
      .map(m => ({ name: m[1], score: +m[2], max: +m[3], comment: m[4].replace(/\\"/g, '"') }));
    const sm = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/);
    o = { criteria: crit, summary: sm ? sm[1] + (raw.includes('"gaps"') ? "" : "…") : "", gaps: [] };
  }
  const c = o.criteria || [];
  return { criteria: c, total: c.reduce((a, x) => a + (x.score||0), 0), max: c.reduce((a, x) => a + (x.max||0), 0) || o.max || 0,
    summary: o.summary || "", gaps: o.gaps || [], ai_suspect: o.ai_suspect || "", ai_suspect_why: o.ai_suspect_why || "", recovered: true };
}
function download(name, text, type){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
function exportCsv(){
  const rows = ROWS.filter(r => !SEL.group || r.group === SEL.group);
  const crit = [...new Set(rows.flatMap(r => ((r.eval||{}).criteria||[]).map(c => c.name)))];
  const q = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const head = ["Група","Студент","Стан","Бал","Макс",...crit,"Підозра ШІ","Вкладки","Вставки","Сер. час відповіді, с","Тривалість, с","Протокол","Підсумок"];
  const lines = rows.map(r => { const e = r.eval || {}; return [r.group, r.name, r.done?"завершено":"в процесі", e.total ?? "", e.max ?? "",
    ...crit.map(n => { const c = (e.criteria||[]).find(x => x.name === n); return c ? c.score : ""; }),
    e.ai_suspect || "", (r.meta&&r.meta.blur)||0, (r.meta&&r.meta.pastes)||0, Math.round(avgSecs(r)), Math.round(duration(r)),
    VER[r.id] === "ok" ? "ок" : VER[r.id] === "bad" ? "змінено" : "", e.summary || ""].map(q).join(";"); });
  download(`spivbesida_${SEL.topic}${SEL.group?"_"+SEL.group:""}.csv`, "﻿" + [head.map(q).join(";"), ...lines].join("\r\n"), "text/csv;charset=utf-8");
}
function exportJson(){
  const rows = ROWS.filter(r => !SEL.group || r.group === SEL.group).map(r => ({ group: r.group, name: r.name, done: !!r.done, eval: r.eval || null,
    meta: r.meta || {}, integrity: VER[r.id] || "", dialog: (r.messages||[]).slice(1).map(m => ({ who: m.role === "user" ? "студент" : "ШІ", text: m.content })) }));
  download(`spivbesida_${SEL.topic}${SEL.group?"_"+SEL.group:""}.json`, JSON.stringify(rows, null, 1), "application/json");
}

// ---------- події
["input","change"].forEach(t => document.addEventListener(t, ev => { const b = ev.target.closest && ev.target.closest(".tp[data-t]"); if (b) paintStatus(b.dataset.t); }));
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act, v = el.dataset.v;
  try {
    if (act === "tab") { TAB = v; if (TAB === "results" && SEL.topic) await loadRows(); render(); }
    else if (act === "save") await saveTopic(v);
    else if (act === "copy") { await navigator.clipboard.writeText(v); warn("Посилання скопійовано"); }
    else if (act === "new") await newInterview();
    else if (act === "goto") document.querySelector(`.tp[data-t="${v}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (act === "delIv") await deleteInterview(v);
    else if (act === "addCrit") el.closest(".tp").querySelector(".crit tbody").insertAdjacentHTML("beforeend", critRows([{ name: "", desc: "", max: 2 }]));
    else if (act === "delCrit") el.closest("tr").remove();
    else if (act === "resetCrit") el.closest(".tp").querySelector(".crit tbody").innerHTML = critRows(DEFAULT_CRITERIA);
    else if (act === "reload") { await loadRows(); render(); }
    else if (act === "open") { SEL.id = v; render(); }
    else if (act === "expandAll") { COLLAPSED.clear(); document.querySelectorAll("details.proto").forEach(d => d.open = true); }
    else if (act === "collapseAll") { document.querySelectorAll("details.proto").forEach(d => { d.open = false; COLLAPSED.add(d.dataset.pid); }); }
    else if (act === "csv") exportCsv();
    else if (act === "json") exportJson();
    else if (act === "unbind") { await st.updateAttempt(v, { uid: null }); warn("Тепер студент може продовжити з іншого пристрою."); await loadRows(); render(); }
    else if (act === "del") {
      const r = ROWS.find(x => x.id === v);
      if (!confirm(`Видалити спробу «${r ? r.name : ""}»? Протокол і оцінку буде втрачено, студент зможе пройти співбесіду заново.`)) return;
      await st.deleteAttempt(v); SEL.id = ""; warn("Спробу видалено."); await loadRows(); render();
    }
  } catch(e){ warn(esc(e.message || e)); }
});

start();
