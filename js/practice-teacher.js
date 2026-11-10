// Кабінет викладача: практичні роботи — відкриття для груп, результати, протоколи.
// Оцінка тут перераховується з журналу дій студента (pr/core.js), а не береться з того, що надіслав браузер.
import * as st from "./store.js";
import { PRACTICALS, loadPractical } from "./pr/index.js";
import { buildTask, creditOf, gradeOf, summaryOf, taskStats, fmtN } from "./pr/core.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const fmt = s => { s = Math.round(s||0); return Math.floor(s/60) + " хв " + String(s%60).padStart(2,"0") + " с"; };
const pct = x => Math.round(x * 100) + " %";
const normN = s => String(s||"").toLowerCase().replace(/[’'`ʼ]/g,"").replace(/\s+/g," ").trim();
const link = id => new URL(`practice.html?p=${id}`, location.href).href;

let SETTINGS, PR, ROSTER = {}, SEL = "", GRP = "", ROWS = [], MOD = {};
let warnT = null;
function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); clearTimeout(warnT); warnT = setTimeout(()=>a.classList.remove("show"), 8000); }

async function start(){
  if (st.DEMO) $("demo").innerHTML = '<span class="demo">Демо-режим: Firebase ще не підключено</span>';
  let u = null;
  try { u = await st.teacherCurrent(); } catch(e){ warn(esc(e.message||e)); }
  if (!u){
    $("app").innerHTML = `<div class="card"><h3 style="margin-top:0">Вхід викладача</h3><button id="gin">Увійти через Google</button></div>`;
    await new Promise(res => { $("gin").onclick = async () => { try { u = await st.teacherSignIn(); res(); } catch(e){ warn(esc(e.message||e)); } }; });
  }
  $("who").textContent = u.email;
  [SETTINGS, PR] = await Promise.all([st.getSettings(), st.getPractice()]);
  SETTINGS.groups ||= []; PR ||= {};
  try { ROSTER = await st.getRoster(); } catch(e){ ROSTER = {}; }
  for (const p of PRACTICALS) MOD[p.id] = await loadPractical(p.id);
  SEL = PRACTICALS[0] && PRACTICALS[0].id;
  render();
}

function cfgOf(id){ return PR[id] || { open: false, groups: [], ai: true }; }
function render(){
  $("app").innerHTML = PRACTICALS.map(p => {
    const c = cfgOf(p.id);
    return `<div class="card tp ${c.open ? "on" : ""}" data-p="${p.id}">
      <div class="row"><h3 style="margin:0">№${p.num}. ${esc(p.title)}</h3><span class="sp"></span>
        <span class="pill ${c.open ? "st-ok" : "st-off"}">${c.open ? "відкрита" : "закрита"}</span></div>
      <div style="margin:10px 0 4px"><b>Групи:</b> ${SETTINGS.groups.map(g => `<label class="chk"><input type="checkbox" class="g" value="${esc(g)}" ${(c.groups||[]).includes(g) ? "checked" : ""}> ${esc(g)}</label>`).join("") || '<span class="hint">груп немає — додайте їх в основному кабінеті</span>'}</div>
      <label class="chk"><input type="checkbox" class="ai" ${c.ai !== false ? "checked" : ""}> ШІ-помічник (пояснює хід розв'язання; кожне запитання −10 % балу за задачу)</label>
      <div class="row" style="margin-top:10px">
        <button data-act="toggle" data-p="${p.id}">${c.open ? "Закрити" : "Відкрити для студентів"}</button>
        <button class="sec" data-act="save" data-p="${p.id}">Зберегти групи</button>
        <button class="sec" data-act="copy" data-p="${p.id}">Копіювати посилання</button>
        <a class="hint" href="${link(p.id)}" target="_blank">Переглянути як студент ↗</a></div>
      <p class="hint" style="margin:6px 0 0">Посилання для студентів: <code>${esc(link(p.id))}</code></p>
    </div>`; }).join("") + `<div class="card" id="res"><p class="hint">Завантаження результатів…</p></div>`;
  loadResults();
}

async function savePr(id, patch){
  PR = await st.getPractice() || {};               // свіжа копія, щоб не затерти зміни з іншої вкладки
  PR[id] = { ...cfgOf(id), ...patch };
  await st.savePractice(PR);
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.p, box = b.closest(".tp");
  const groups = box ? [...box.querySelectorAll(".g:checked")].map(x => x.value) : [];
  const ai = box ? box.querySelector(".ai").checked : true;
  try {
    if (b.dataset.act === "toggle") {
      const open = !cfgOf(id).open;
      if (open && !groups.length) { warn("Позначте хоча б одну групу."); return; }
      await savePr(id, { open, groups, ai }); render(); warn(open ? "Практичну відкрито ✓ Зміни діють приблизно за 30 секунд." : "Практичну закрито.");
    }
    if (b.dataset.act === "save") { await savePr(id, { groups, ai }); render(); warn("Збережено ✓"); }
    if (b.dataset.act === "copy") { await navigator.clipboard.writeText(link(id)); warn("Посилання скопійовано."); }
    if (b.dataset.act === "sel") { SEL = b.dataset.v; loadResults(); }
    if (b.dataset.act === "reset") {
      if (!confirm("Видалити спробу цього студента? Він зможе пройти роботу заново (з новими числами).")) return;
      await st.deleteAttempt(b.dataset.id); loadResults();
    }
    if (b.dataset.act === "csv") csv();
  } catch(err){ warn("Помилка: " + esc(err.message || err)); }
});
document.addEventListener("change", e => { if (e.target.id === "grpSel") { GRP = e.target.value; paintResults(); } if (e.target.id === "prSel") { SEL = e.target.value; loadResults(); } });

// ---------- результати
async function loadResults(){
  try { ROWS = await st.listAttempts("pr-" + SEL); } catch(e){ ROWS = []; warn("Не вдалося завантажити результати: " + esc(e.message||e)); }
  paintResults();
}
const duration = r => r.meta && r.meta.startedAt ? ((new Date(r.finishedAt || r.updatedAt || Date.now())) - new Date(r.meta.startedAt)) / 1000 : 0;
function statusOf(r, P){
  if (!r) return `<span class="pill st-off">не розпочинав</span>`;
  if (r.done) return `<span class="pill st-ok">завершено</span>`;
  const solved = (r.tasks || []).filter(t => !t.twin && (taskStats(t).ok || taskStats(t).sol)).length;
  return `<span class="pill st-warn">${r.stage === "theory" ? "читає теорію" : r.stage === "conclusion" ? "пише висновок" : `задачі ${solved}/${P.tasks.length}`}</span>`;
}
function rowsFor(P){
  const c = cfgOf(SEL), groups = GRP ? [GRP] : (c.groups && c.groups.length ? c.groups : SETTINGS.groups);
  const have = new Set(ROWS.map(r => r.group + "|" + normN(r.name)));
  const list = ROWS.filter(r => !GRP || r.group === GRP).map(r => ({ r, group: r.group, name: r.name }));
  groups.forEach(g => (ROSTER[g] || []).forEach(n => { if (!have.has(g + "|" + normN(n))) list.push({ r: null, group: g, name: n }); }));
  return list.sort((a, b) => a.group.localeCompare(b.group, "uk") || a.name.localeCompare(b.name, "uk"));
}
function paintResults(){
  const P = MOD[SEL]; if (!P) return;
  const c = cfgOf(SEL), groups = c.groups && c.groups.length ? c.groups : SETTINGS.groups;
  const list = rowsFor(P);
  $("res").innerHTML = `<div class="row"><h3 style="margin:0">Результати</h3><span class="sp"></span>
      <select id="prSel" style="width:auto;max-width:100%">${PRACTICALS.map(p => `<option value="${p.id}" ${p.id === SEL ? "selected" : ""}>№${p.num}. ${esc(p.title)}</option>`).join("")}</select>
      <select id="grpSel" style="width:auto"><option value="">Усі групи</option>${groups.map(g => `<option ${g === GRP ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>
      <button class="sec sm" data-act="sel" data-v="${SEL}">Оновити</button><button class="sec sm" data-act="csv">CSV</button></div>
    <p class="hint">Оцінка = 12 × (сума балів за задачі) / ${P.tasks.length}. Бал за задачу: з першої спроби — 100 %; −15 % за кожну помилку (перші 3), −20 % і −30 % за підказки, −10 % за запитання ШІ; не менше 20 %, якщо розв'язано самостійно; показаний розв'язок — 0, аналогічна задача — до 50 %.</p>
    <div style="overflow-x:auto"><table class="rep"><tr><th>Студент</th><th>Група</th><th>Стан</th><th>Оцінка</th><th title="Розв'язано самостійно з першої спроби, без підказок">З 1-ї спроби</th><th>Помилок</th><th>Підказок</th><th>ШІ</th><th title="Скільки разів студент відкрив розв'язок">Розв'язків</th><th title="Виходи зі сторінки під час задач">Вкладки</th><th>Тривалість</th></tr>
    ${list.map(({ r, group, name }) => { if (!r) return `<tr class="none"><td>${esc(name)}</td><td>${esc(group)}</td><td>${statusOf(null, P)}</td><td colspan="8"></td></tr>`;
      const g = gradeOf(r, P.tasks.length), s = summaryOf(r);
      return `<tr class="clk" data-id="${esc(r.id)}"><td>${esc(r.name)}</td><td>${esc(r.group)}</td><td>${statusOf(r, P)}</td>
        <td><b>${r.done ? g.grade : "—"}</b>${r.done ? ` <span class="hint">(${fmtN(g.points, 1)})</span>` : ""}</td><td>${s.firstTry} / ${P.tasks.length}</td><td>${s.wrong}</td><td>${s.hints}</td><td>${s.ai}</td><td>${s.sol}</td>
        <td>${(r.meta && r.meta.blur) || 0}</td><td>${fmt(duration(r))}</td></tr>`; }).join("")}
    </table></div>
    <div id="proto">${list.filter(x => x.r).map(x => protoHtml(x.r, P)).join("")}</div>`;
  document.querySelectorAll("tr.clk").forEach(tr => tr.onclick = () => { const d = document.getElementById("pr_" + tr.dataset.id); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth" }); } });
}
function logLine(e, T, p, fields){
  const time = e.t ? new Date(e.t).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  if (e.type === "try") return `<li><span class="hint">${time}</span> ${e.ok ? "✅" : "❌"} ${fields.map(f => `${esc(f.label)}: <b>${esc(e.vals && e.vals[f.id])}</b>${!e.ok && (e.wrong||[]).includes(f.id) ? " ✗" : ""}`).join("; ")}${e.msg ? ` <span class="hint">— сайт: «${esc(e.msg)}»</span>` : ""}</li>`;
  if (e.type === "hint") return `<li><span class="hint">${time}</span> 💡 підказка ${e.lvl}</li>`;
  if (e.type === "ai") return `<li><span class="hint">${time}</span> 🤖 <b>Запитання:</b> ${esc(e.q)}<br><b>ШІ:</b> ${esc(e.a)}</li>`;
  if (e.type === "sol") return `<li><span class="hint">${time}</span> 📖 відкрив розв'язок</li>`;
  return "";
}
function protoHtml(r, P){
  const g = gradeOf(r, P.tasks.length);
  return `<details class="proto" id="pr_${esc(r.id)}"><summary><b>${esc(r.name)}</b> · ${esc(r.group)} · ${r.done ? `оцінка <b>${g.grade}</b> (${fmtN(g.points, 1)})` : "не завершено"}</summary>
    <p class="hint">Почав: ${r.meta && r.meta.startedAt ? new Date(r.meta.startedAt).toLocaleString("uk-UA") : "—"} · Тривалість: ${fmt(duration(r))} · Виходи зі сторінки: ${(r.meta && r.meta.blur) || 0}${(r.meta && r.meta.away || []).length ? " (" + r.meta.away.map(a => `задача ${a.task} — ${a.s} с`).join(", ") + ")" : ""}</p>
    ${(r.tasks || []).map(t => { const { T, p, fields } = buildTask(P, t.key, r.seed, t.variant);
      return `<div class="ex" style="margin:8px 0"><b>${t.twin ? "↳ Аналогічна до задачі " + (t.slot + 1) : "Задача " + (t.slot + 1) + ". " + esc(T.title)}</b> — бал ${pct(creditOf(t))}${t.twin ? " (макс. 50 %)" : ""}
        <div style="margin:4px 0">${T.text(p)}</div>
        <div class="hint">Правильно: ${fields.map(f => `${esc(f.label)} — ${f.type === "choice" ? esc(f.answer) : fmtN(f.answer, 1)}${f.unit ? " " + esc(f.unit) : ""}`).join("; ")}</div>
        ${(t.log || []).length ? `<ul style="margin:6px 0 0;padding-left:18px">${t.log.map(e => logLine(e, T, p, fields)).join("")}</ul>` : `<p class="hint">ще не розв'язував</p>`}</div>`; }).join("")}
    <p><b>Висновок студента:</b></p><p style="white-space:pre-wrap">${esc(r.conclusion || "—")}</p>
    <div class="row"><span class="sp"></span><button class="sec sm" data-act="reset" data-id="${esc(r.id)}">Дозволити пройти заново</button></div></details>`;
}
function csv(){
  const P = MOD[SEL]; const list = rowsFor(P);
  const head = ["Студент","Група","Стан","Оцінка","Бали","З 1-ї спроби","Помилок","Підказок","Запитань ШІ","Розв'язків показано","Виходи зі сторінки","Тривалість, хв"];
  const rows = list.map(({ r, group, name }) => { if (!r) return [name, group, "не розпочинав"];
    const g = gradeOf(r, P.tasks.length), s = summaryOf(r);
    return [r.name, r.group, r.done ? "завершено" : "в процесі", r.done ? g.grade : "", String(g.points).replace(".", ","), s.firstTry, s.wrong, s.hints, s.ai, s.sol, (r.meta && r.meta.blur) || 0, Math.round(duration(r) / 60)]; });
  const text = "﻿" + [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `практична_${MOD[SEL].num}.csv`; a.click();
}

start();
