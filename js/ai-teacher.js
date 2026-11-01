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

function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); setTimeout(()=>a.classList.remove("show"), 6000); }
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
  SETTINGS = await st.getSettings(); SETTINGS.groups ||= []; SETTINGS.topics ||= {}; SETTINGS.ai ||= {};
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
const interviews = () => Object.entries(SETTINGS.ai).filter(([id,c]) => c && Array.isArray(c.topics)).sort((x,y) => (y[1].created||0) - (x[1].created||0));
const tTitle = id => { const t = allTopics().find(x => x.id === id); return t ? `${t.num}. ${t.title}` : id; };
function renderSetup(){
  const G = SETTINGS.groups, list = interviews();
  $("app").innerHTML = tabs() +
    (workerReady() ? "" : `<div class="info">Ще не вказано адресу воркера у файлі <code>js/ai-config.js</code> — співбесіди не працюватимуть, доки ви її не вставите.</div>`) +
    `<div class="card"><div class="row"><h3 style="margin:0">Співбесіди</h3><span class="sp"></span><button data-act="new">+ Нова співбесіда</button></div>
    <p class="hint">Співбесіда може охоплювати одну або кілька тем (до ${MAX_TOPICS}). ШІ розподілить питання між обраними темами. Групи редагуються в основному кабінеті.</p>
    ${list.length ? "" : '<p class="hint">Ще немає жодної співбесіди. Натисніть «+ Нова співбесіда».</p>'}
    ${list.map(([id, c]) => {
      const crit = c.criteria && c.criteria.length ? c.criteria : DEFAULT_CRITERIA;
      const sum = crit.reduce((s,x)=>s+Number(x.max||0),0);
      return `<div class="tp ${c.open?'on':''}" data-t="${id}">
        <label style="margin-top:0">Назва</label><input type="text" class="ti" value="${esc(c.title||"")}" placeholder="Напр., Тематична: Літосфера і ґрунти (теми 9–12)">
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
        <div class="row" style="margin-top:8px"><code>${esc(link(id))}</code><button class="sm sec" data-act="copy" data-v="${esc(link(id))}">Копіювати</button><span class="sp"></span>
          <button class="sm sec" data-act="delIv" data-v="${id}">Видалити</button><button class="sm" data-act="save" data-v="${id}">Зберегти</button></div>
      </div>`;
    }).join("")}</div>`;
}
async function newInterview(){
  const id = "s" + Date.now().toString(36);
  SETTINGS.ai[id] = { title: "", topics: [], open: false, nq: 6, minutes: 20, showScore: false, groups: [], criteria: DEFAULT_CRITERIA, created: Date.now() };
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
  if (!title) { warn("Вкажіть назву співбесіди — її бачитимуть студенти."); return; }
  if (!topics.length) { warn("Оберіть хоча б одну тему."); return; }
  if (topics.length > MAX_TOPICS) { warn(`Не більше ${MAX_TOPICS} тем в одній співбесіді.`); return; }
  if (!crit.length) { warn("Потрібен хоча б один критерій."); return; }
  if (crit.some(c => !(c.max >= 1 && c.max <= 100))) { warn("Максимальний бал критерію — ціле число від 1 до 100."); return; }
  if (new Set(crit.map(c=>c.name)).size !== crit.length) { warn("Назви критеріїв не повинні повторюватися."); return; }
  const nq = parseInt(box.querySelector(".nq").value, 10), mn = parseInt(box.querySelector(".mn").value, 10);
  if (!(nq >= 3 && nq <= 12)) { warn("Кількість питань — від 3 до 12."); return; }
  if (!(mn >= 0 && mn <= 180)) { warn("Час — від 0 до 180 хвилин."); return; }
  if (nq < topics.length) { if (!confirm(`Тем (${topics.length}) більше, ніж питань (${nq}) — деякі теми залишаться без питання. Зберегти так?`)) return; }
  SETTINGS.ai[id] = { title, topics, open: box.querySelector(".op").checked, nq, minutes: mn, showScore: box.querySelector(".ss").checked,
    groups: [...box.querySelectorAll(".gr:checked")].map(i => i.value), criteria: crit, created: (SETTINGS.ai[id] && SETTINGS.ai[id].created) || Date.now() };
  await st.saveSettings(SETTINGS); warn("Збережено. Зміни діють для нових повідомлень приблизно за 30 секунд."); render();
}
async function deleteInterview(id){
  const c = SETTINGS.ai[id] || {};
  if (!confirm(`Видалити співбесіду «${c.title || "без назви"}»? Студенти більше не зможуть її пройти. Уже збережені результати залишаться в базі.`)) return;
  delete SETTINGS.ai[id]; await st.saveSettings(SETTINGS); warn("Співбесіду видалено."); render();
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

function renderResults(){
  const list = interviews();
  const groups = [...new Set(ROWS.map(r => r.group))];
  const rows = ROWS.filter(r => !SEL.group || r.group === SEL.group);
  $("app").innerHTML = tabs() + `<div class="card">
    <div class="row"><select id="selT" style="width:auto;flex:1;min-width:240px"><option value="">— співбесіда —</option>${list.map(([id,c])=>`<option value="${id}" ${SEL.topic===id?'selected':''}>${esc(c.title||"без назви")}</option>`).join("")}</select>
      <select id="selG" style="width:auto"><option value="">Усі групи</option>${groups.map(g=>`<option ${SEL.group===g?'selected':''}>${esc(g)}</option>`).join("")}</select>
      <button class="sec sm" data-act="reload">Оновити</button><button class="sec sm" data-act="csv" ${rows.length?'':'disabled'}>CSV</button><button class="sec sm" data-act="json" ${rows.length?'':'disabled'}>JSON (протоколи)</button></div>
    ${SEL.topic ? (rows.length ? `<div style="overflow-x:auto;margin-top:12px"><table class="rep"><thead><tr><th>Студент</th><th>Група</th><th>Стан</th><th>Бал ШІ</th><th>Підозра ШІ</th><th title="Перемикання вкладок">Вкладки</th><th title="Спроби вставити текст">Вставки</th><th>Сер. час відповіді</th><th>Тривалість</th><th title="Цілісність протоколу">Протокол</th></tr></thead><tbody>
      ${rows.map(r => { const e = r.eval || {}; return `<tr class="clk ${SEL.id===r.id?'sel':''}" data-act="open" data-v="${esc(r.id)}">
        <td>${esc(r.name)}</td><td>${esc(r.group)}</td>
        <td>${r.done ? '<span class="ok">завершено</span>' : `в процесі (${asked(r)}/${nqOf(r)})`}</td>
        <td>${r.done && e.max ? `<b>${e.total}</b> / ${e.max}` : "—"}</td><td>${r.done ? suspect(e.ai_suspect) : "—"}</td>
        <td>${(r.meta&&r.meta.blur)||0}</td><td>${(r.meta&&r.meta.pastes)||0}</td><td>${fmt(avgSecs(r))}</td><td>${fmt(duration(r))}</td>
        <td data-ver="${esc(r.id)}">${verLabel(VER[r.id])}</td></tr>`; }).join("")}
      </tbody></table></div>` : '<p class="hint" style="margin-top:12px">Ще ніхто не проходив цю співбесіду.</p>') : `<p class="hint" style="margin-top:12px">Оберіть співбесіду.</p>`}
  </div><div id="detail"></div>`;
  $("selT").onchange = async e => { SEL = { topic: e.target.value, group: "", id: "" }; await loadRows(); render(); };
  $("selG").onchange = e => { SEL.group = e.target.value; SEL.id = ""; render(); };
  if (SEL.id) renderDetail();
}
function renderDetail(){
  const r = ROWS.find(x => x.id === SEL.id); if (!r) return;
  const e = r.eval || null, secs = (r.meta && r.meta.secs) || [];
  let ui = 0;
  $("detail").innerHTML = `<div class="card">
    <div class="row"><h3 style="margin:0">${esc(r.name)} · ${esc(r.group)}</h3><span class="sp"></span><span data-ver="${esc(r.id)}">${verLabel(VER[r.id])}</span></div>
    ${e ? `<p class="big" style="margin:8px 0">${e.total} / ${e.max}</p>
      ${e.error ? '<div class="alert show">ШІ не зміг коректно сформувати оцінку — оцініть за протоколом вручну.</div>' : ""}
      <table class="rep"><thead><tr><th>Критерій</th><th>Бал</th><th>Коментар ШІ</th></tr></thead><tbody>
      ${(e.criteria||[]).map(c=>`<tr><td>${esc(c.name)}</td><td><b>${c.score}</b> / ${c.max}</td><td>${esc(c.comment)}</td></tr>`).join("")}</tbody></table>
      <p><b>Підсумок:</b> ${esc(e.summary)}</p>
      ${e.gaps && e.gaps.length ? `<p><b>Прогалини:</b> ${e.gaps.map(esc).join("; ")}</p>` : ""}
      <p><b>Ймовірність використання ШІ:</b> ${suspect(e.ai_suspect)} ${esc(e.ai_suspect_why)}</p>` : `<p class="hint">Співбесіда ще не завершена.</p>`}
    <p class="hint">Вкладки: ${(r.meta&&r.meta.blur)||0} · Спроби вставки: ${(r.meta&&r.meta.pastes)||0} · Тривалість: ${fmt(duration(r))}${r.meta&&r.meta.aiNoticeAccepted ? ` · Попередження про ШІ прийнято: ${new Date(r.meta.aiNoticeAccepted).toLocaleString("uk-UA")}` : ""}</p>
    <h4>Протокол</h4>
    ${(r.messages||[]).slice(1).map(m => m.role === "user"
        ? `<div class="msg me">${esc(m.content)}${secs[ui] != null ? `<small>${fmt(secs[ui++])} · ${m.content.length} симв.</small>` : ""}</div>`
        : `<div class="msg ai">${esc(m.content)}</div>`).join("")}
    <div class="row" style="margin-top:12px"><span class="sp"></span>
      ${!r.done && r.uid ? `<button class="sm sec" data-act="unbind" data-v="${esc(r.id)}">Дозволити продовжити з іншого пристрою</button>` : ""}
      <button class="sm sec" data-act="del" data-v="${esc(r.id)}">Дозволити пройти заново</button></div>
  </div>`;
  $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
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
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act, v = el.dataset.v;
  try {
    if (act === "tab") { TAB = v; if (TAB === "results" && SEL.topic) await loadRows(); render(); }
    else if (act === "save") await saveTopic(v);
    else if (act === "copy") { await navigator.clipboard.writeText(v); warn("Посилання скопійовано"); }
    else if (act === "new") await newInterview();
    else if (act === "delIv") await deleteInterview(v);
    else if (act === "addCrit") el.closest(".tp").querySelector(".crit tbody").insertAdjacentHTML("beforeend", critRows([{ name: "", desc: "", max: 2 }]));
    else if (act === "delCrit") el.closest("tr").remove();
    else if (act === "resetCrit") el.closest(".tp").querySelector(".crit tbody").innerHTML = critRows(DEFAULT_CRITERIA);
    else if (act === "reload") { await loadRows(); render(); }
    else if (act === "open") { SEL.id = v; render(); }
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
