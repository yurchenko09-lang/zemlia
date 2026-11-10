// Сторінка студента: практична робота з поясненням, індивідуальними задачами, підказками і оцінкою.
// Відповіді перевіряє сам сайт (точно, за формулою); ШІ лише пояснює, якщо студент просить.
import * as st from "./store.js";
import { WORKER_URL, AI_SUBJECT } from "./ai-config.js";
import { PRACTICALS, loadPractical } from "./pr/index.js";
import { buildTask, checkField, num, creditOf, gradeOf, taskStats, RULES, fmtN } from "./pr/core.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const plain = h => String(h).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const pct = x => Math.round(x * 100) + " %";
const PID = (new URLSearchParams(location.search).get("p") || "").trim();
const AI_MAX = 2;

let SETTINGS, PCFG, P, A = null, AID = null, UID = null, confirmSol = false, aiBusy = false;
const local = {
  get(id){ try { return JSON.parse(localStorage.getItem("pr:"+id)); } catch(e){ return null; } },
  set(id,d){ try { localStorage.setItem("pr:"+id, JSON.stringify(d)); } catch(e){} }
};
function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); }
function net(msg){ const n=$("net"); if(!n) return; if(!msg){ n.classList.remove("show"); return; } n.textContent=msg; n.classList.add("show"); }
let pending = false, retryT = null;
async function save(){
  A.updatedAt = new Date().toISOString();
  local.set(AID, A);
  try { await st.saveAttempt(AID, A); pending = false; net(""); }
  catch(e){ pending = true; net("Немає зв'язку — відповіді збережено на пристрої, надішлемо, щойно з'явиться інтернет."); clearTimeout(retryT); retryT = setTimeout(()=>{ if(pending) save(); }, 15000); }
}
window.addEventListener("online", ()=>{ if(pending) save(); });

// ---------- старт
async function start(){
  if (st.DEMO) $("demo").innerHTML = '<span class="demo">Демо-режим</span>';
  const meta = PRACTICALS.find(x => x.id === PID);
  if (!meta) { $("app").innerHTML = `<div class="card">Посилання неповне. Попросіть у викладача правильне посилання.</div>`; return; }
  try {
    let PR;
    [SETTINGS, UID, PR, P] = await Promise.all([st.getSettings(), st.studentInit(), st.getPractice(), loadPractical(PID)]);
    PCFG = (PR || {})[PID] || {};
  } catch(e){ $("app").innerHTML = `<div class="card">Не вдалося завантажити сторінку. Перевірте інтернет і оновіть сторінку.<br><span class="hint">${esc(e.message||e)}</span></div>`; return; }
  $("htitle").textContent = `Практична робота №${P.num}`;
  document.title = `Практична №${P.num} — ${P.title}`;
  if (!PCFG.open) { $("app").innerHTML = `<div class="card"><div class="tq">Практична робота №${P.num}. ${esc(P.title)}</div><p>Ця практична робота зараз закрита.</p></div>`; return; }
  renderLogin();
}

function renderLogin(){
  const groups = (PCFG.groups && PCFG.groups.length ? PCFG.groups : SETTINGS.groups) || [];
  const n = P.tasks.length;
  $("app").innerHTML = `<div class="card">
    <div class="hint">Практична робота №${P.num}</div><div class="tq">${esc(P.title)}</div>
    <p><b>Мета:</b> ${esc(P.goal)}</p>
    <ol class="hint" style="padding-left:20px;margin:0">
      <li>Спершу прочитайте <b>пояснення і розв'язані приклади</b>. Вони будуть доступні й під час задач.</li>
      <li>Далі — <b>${n} задач</b>. У кожного студента <b>свої числа</b>, тож списати відповідь у сусіда не вийде.</li>
      <li>Відповідь — число (дробове — через кому). Сайт одразу перевіряє її і, якщо є помилка, підказує, де саме.</li>
      <li>Застрягли — візьміть <b>підказку</b>${PCFG.ai !== false ? " або <b>запитайте ШІ-помічника</b>" : ""}. Не виходить зовсім — можна подивитися розв'язок, і тоді ви отримаєте <b>аналогічну задачу</b> з іншими числами.</li>
      <li>Наприкінці — короткий <b>висновок</b> своїми словами.</li>
    </ol>
    <div class="info" style="margin-top:12px"><b>Як рахується оцінка</b> (максимум 12 балів, усі задачі однакові за вагою):
      <ul style="margin:6px 0 0;padding-left:20px">
        <li>розв'язали <b>самі з першої спроби</b> — 100 % балу за задачу;</li>
        <li>кожна неправильна спроба — −${pct(RULES.wrong)} (враховуються перші 3);</li>
        <li>підказка «з чого почати» — −${pct(RULES.hint1)}, підказка «формула з числами» — ще −${pct(RULES.hint2)}${PCFG.ai !== false ? `; запитання ШІ — −${pct(RULES.ai)}` : ""};</li>
        <li>якщо зрештою розв'язали самі — не менше ${pct(RULES.floor)};</li>
        <li>подивилися розв'язок — 0 за задачу, але аналогічна задача дає до ${pct(RULES.twin)}.</li>
      </ul>
      ${PCFG.ai !== false ? `<p style="margin:8px 0 0">ШІ-помічник — мовна модель Claude (Anthropic). Він отримує лише умову задачі і ваше запитання, без прізвища та групи. Оцінку ставить не ШІ, а сайт за правилами вище; остаточну — викладач.</p>` : ""}
    </div>
    <label>Група</label><select id="grp"><option value="">— оберіть —</option>${groups.map(g=>`<option>${esc(g)}</option>`).join("")}</select>
    <label>Прізвище та ім'я</label>${st.nameField()}
    <div class="row" style="margin-top:16px"><span class="bad" id="regErr"></span><span class="sp"></span><button id="go">Почати / продовжити</button></div></div>`;
  $("go").onclick = login;
}

async function login(){
  let g = $("grp").value, n = $("nm").value.trim().replace(/\s+/g," ");
  const er = $("regErr");
  if (!g) { er.textContent = "Оберіть групу."; return; }
  if (!st.isUkrainian(n) || n.split(" ").length < 2) { er.textContent = "Введіть прізвище та ім'я українською."; return; }
  if (st.hasRosterFor(SETTINGS, g)) {
    er.textContent = "Перевіряємо…";
    const m = await st.matchName(SETTINGS, g, n);
    if (m.status === "none") { er.textContent = "Такого студента немає у списку групи. Перевірте групу і введіть прізвище та ім'я українською, як у журналі."; return; }
    if (m.status === "hint") {
      er.innerHTML = `Можливо, ви — ${m.names.map(x => `<button class="sm sec" data-pick="${esc(x)}">${esc(x)}</button>`).join(" ")}? Натисніть своє ім'я.`;
      er.querySelectorAll("[data-pick]").forEach(b => b.onclick = ev => { ev.preventDefault(); $("nm").value = b.dataset.pick; login(); });
      return;
    }
    n = m.name;
  }
  er.textContent = "Зачекайте…"; $("go").disabled = true;
  AID = st.attemptId("pr-" + PID, g, n);
  let server;
  try { server = await st.getAttempt(AID); } catch(e){ server = undefined; }
  if (server && server.__locked) { er.innerHTML = "Цю роботу ви вже почали на <b>іншому пристрої чи браузері</b>. Продовжіть там або попросіть викладача дозволити продовження тут."; $("go").disabled = false; return; }
  let loc = local.get(AID);
  if (server === null && loc && loc.done) loc = null;            // викладач дозволив пройти заново
  const steps = a => (a && a.tasks || []).reduce((s, t) => s + (t.log || []).length, 0) + (a && a.done ? 1000 : 0);
  A = server && loc ? (steps(loc) > steps(server) ? loc : server) : (server || loc);
  if (!A) {
    A = { topic: "pr-" + PID, pid: PID, group: g, name: n, uid: UID, done: false, stage: "theory", cur: 0,
      seed: Math.random().toString(36).slice(2, 12),
      tasks: P.tasks.map((T, i) => ({ key: T.key, slot: i, variant: 0, max: 1, log: [] })),
      conclusion: "", meta: { startedAt: new Date().toISOString(), blur: 0 } };
  }
  A.uid = UID;
  await save();
  route();
}

function route(){
  if (A.done) return renderDone();
  if (A.stage === "theory") return renderTheory();
  if (A.stage === "conclusion") return renderConclusion();
  renderTask();
}

// ---------- теорія
function renderTheory(){
  $("app").innerHTML = `<div class="card th">
    <div class="hint">Практична робота №${P.num}</div><div class="tq">${esc(P.title)}</div>
    <p><b>Мета:</b> ${esc(P.goal)}</p>
    ${P.theory}
    <h3>6. Розв'язані приклади</h3>${P.examples}
    <div class="btns"><span class="sp"></span><button id="toTasks">Я ознайомився(-лася) — до задач →</button></div></div>`;
  window.scrollTo(0, 0);
  $("toTasks").onclick = async () => { A.stage = "tasks"; A.meta.tasksAt = new Date().toISOString(); await save(); route(); };
}

// ---------- задача
const cur = () => A.tasks[A.cur];
function progress(){
  return `<div class="prog">${A.tasks.map((t, i) => { const s = taskStats(t), c = creditOf(t), m = t.max ?? 1;
    const cls = (s.ok || s.sol) ? (c >= 0.999 * m ? "ok" : c > 0 ? "half" : "zero") : "";
    return `<span class="${cls}${i === A.cur ? " cur" : ""}" title="${t.twin ? "Аналогічна задача" : "Задача " + (t.slot + 1)}"></span>`; }).join("")}</div>`;
}
function fieldHtml(f, t, done){
  const v = (t.vals || {})[f.id] ?? "";
  if (f.type === "choice") return `<div class="fld" data-f="${f.id}"><label>${esc(f.label)}</label><select data-in="${f.id}" ${done ? "disabled" : ""}><option value="">—</option>${f.options.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  return `<div class="fld" data-f="${f.id}"><label>${esc(f.label)}</label><input type="text" inputmode="decimal" autocomplete="off" data-in="${f.id}" value="${esc(v)}" ${done ? "disabled" : ""}><span class="u">${esc(f.unit || "")}</span></div>`;
}
function tableHtml(fs, t, done){
  const rows = fs.filter(f => f.h !== undefined), rest = fs.filter(f => f.h === undefined);
  return `<table class="ptab"><tr><th>Висота, м</th><th>Тиск, мм рт. ст.</th></tr>${rows.map(f => `<tr class="fld" data-f="${f.id}"><td>${f.h}</td><td><input type="text" inputmode="decimal" autocomplete="off" data-in="${f.id}" value="${esc((t.vals||{})[f.id] ?? "")}" ${done ? "disabled" : ""}></td></tr>`).join("")}</table>
    <div id="graph"></div>${rest.map(f => fieldHtml(f, t, done)).join("")}`;
}
// графік «висота — тиск» з чисел, які ввів студент
function drawGraph(fs, vals){
  const pts = fs.filter(f => f.h !== undefined).map(f => ({ h: f.h, p: num(vals[f.id]) })).filter(x => Number.isFinite(x.p));
  const g = $("graph"); if (!g) return;
  if (pts.length < 2) { g.innerHTML = `<p class="hint">Графік з'явиться, коли заповните хоча б два рядки.</p>`; return; }
  const W = 520, H = 300, L = 56, B = 40, R = 16, T = 14;
  const ps = pts.map(x => x.p), lo = Math.floor((Math.min(...ps) - 10) / 10) * 10, hi = Math.ceil((Math.max(...ps) + 10) / 10) * 10;
  const X = h => L + (W - L - R) * h / 1000, Y = p => T + (H - T - B) * (hi - p) / (hi - lo || 1);
  const yt = []; for (let v = lo; v <= hi; v += Math.max(10, Math.round((hi - lo) / 6 / 10) * 10)) yt.push(v);
  g.innerHTML = `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Графік тиску від висоти">
    ${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e4e9de"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="#5f6b5f">${v}</text>`).join("")}
    ${[0, 200, 400, 600, 800, 1000].map(h => `<text x="${X(h)}" y="${H - B + 18}" font-size="12" text-anchor="middle" fill="#5f6b5f">${h}</text>`).join("")}
    <line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#5f6b5f"/><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#5f6b5f"/>
    <text x="${(W + L) / 2}" y="${H - 4}" font-size="12" text-anchor="middle" fill="#1f2a1f">Висота, м</text>
    <text x="14" y="${(H - B) / 2}" font-size="12" text-anchor="middle" fill="#1f2a1f" transform="rotate(-90 14 ${(H - B) / 2})">Тиск, мм рт. ст.</text>
    <polyline fill="none" stroke="#4f6b3a" stroke-width="2.5" points="${pts.map(x => X(x.h) + "," + Y(x.p)).join(" ")}"/>
    ${pts.map(x => `<circle cx="${X(x.h)}" cy="${Y(x.p)}" r="4" fill="#4f6b3a"/>`).join("")}</svg>`;
}

function renderTask(){
  const t = cur();
  const { T, p, fields } = buildTask(P, t.key, A.seed, t.variant);
  const s = taskStats(t), done = s.ok || s.sol;
  const N = P.tasks.length;
  const head = t.twin ? `Аналогічна до задачі ${t.slot + 1} <span class="hint">(до ${pct(RULES.twin)} балу)</span>` : `Задача ${t.slot + 1} з ${N} · ${esc(T.title)}`;
  const nowMax = creditIfSolvedNow(t);
  $("app").innerHTML = `<div class="card">
    <details class="thd"><summary>📖 Теорія і приклади</summary><div class="th">${P.theory}<h3>Розв'язані приклади</h3>${P.examples}</div></details>
    ${progress()}
    <div class="tq" style="font-size:17px">${head}</div>
    <div class="cond">${T.text(p)}</div>
    <div id="fields">${T.graph ? tableHtml(fields, t, done) : fields.map(f => fieldHtml(f, t, done)).join("")}</div>
    <div id="fbs">${feedbackHistory(t, T, p)}</div>
    ${done ? "" : `<p class="hint" style="margin:6px 0 0">Якщо розв'яжете зараз: <b>${pct(nowMax)}</b> балу за задачу.</p>`}
    <div class="btns">
      ${done ? `<span class="sp"></span><button id="next">${A.cur + 1 < A.tasks.length ? "Далі →" : "До висновку →"}</button>` : `
        <button id="check">Перевірити</button>
        ${!s.hint2 ? `<button class="sec" id="hint">${s.hint1 ? "Підказка 2: формула з числами" : "Підказка: з чого почати"} <span class="cost">−${pct(s.hint1 ? RULES.hint2 : RULES.hint1)}</span></button>` : ""}
        ${PCFG.ai !== false && s.ai < AI_MAX ? `<button class="sec" id="askAi">Запитати ШІ <span class="cost">−${pct(RULES.ai)}</span></button>` : ""}
        <span class="sp"></span>
        <button class="sec" id="sol">${confirmSol ? "Точно показати? За задачу буде 0" : "Показати розв'язок"}</button>`}
    </div>
    <div id="aiBox"></div>
  </div>`;
  if (T.graph) drawGraph(fields, t.vals || {});
  document.querySelectorAll("[data-in]").forEach(el => {
    el.addEventListener("input", () => { (t.vals ||= {})[el.dataset.in] = el.value; el.closest(".fld").classList.remove("bad"); if (T.graph) drawGraph(fields, t.vals); local.set(AID, A); });
    el.addEventListener("change", () => { (t.vals ||= {})[el.dataset.in] = el.value; });
    el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(); } });
  });
  markFields(t, fields);
  if ($("next")) $("next").onclick = next;
  if ($("check")) $("check").onclick = check;
  if ($("hint")) $("hint").onclick = hint;
  if ($("askAi")) $("askAi").onclick = openAi;
  if ($("sol")) $("sol").onclick = showSolution;
}
function creditIfSolvedNow(t){ return creditOf({ ...t, log: [...(t.log || []), { type: "try", ok: true }] }); }
function markFields(t, fields){
  const last = [...(t.log || [])].reverse().find(e => e.type === "try");
  if (!last) return;
  fields.forEach(f => { const el = document.querySelector(`.fld[data-f="${f.id}"]`); if (!el) return;
    if (last.ok) el.classList.add("good"); else if ((last.wrong || []).includes(f.id)) el.classList.add("bad"); });
}
// усе, що студент уже отримав по задачі: повідомлення про помилки, підказки, відповіді ШІ, розв'язок
function feedbackHistory(t, T, p){
  return (t.log || []).map(e => {
    if (e.type === "try") return e.ok ? `<div class="fb ok"><b>Правильно!</b> ${T.solution(p)}<br><span class="hint">За задачу: ${pct(creditOf(t) / (t.max ?? 1) * (t.max ?? 1))}${(t.max ?? 1) < 1 ? " (максимум " + pct(t.max) + ")" : ""}</span></div>`
      : `<div class="fb bad"><b>Неправильно${e.wrong && e.wrong.length > 1 ? ` (помилки в ${e.wrong.length} полях)` : ""}.</b> ${esc(e.msg || "Перевірте обчислення і одиниці.")}</div>`;
    if (e.type === "hint") return `<div class="fb hint"><b>Підказка ${e.lvl}:</b> ${e.lvl === 1 ? T.hint1(p) : T.hint2(p)}</div>`;
    if (e.type === "ai") return `<div class="fb ai"><b>Ви:</b> ${esc(e.q)}\n<b>ШІ:</b> ${esc(e.a)}</div>`;
    if (e.type === "sol") return `<div class="fb hint"><b>Розв'язок:</b> ${T.solution(p)}${t.twin ? "" : `<br>Далі буде <b>аналогічна задача</b> з іншими числами — розв'яжіть її самостійно.`}</div>`;
    return "";
  }).join("");
}

async function check(){
  const t = cur(); const { T, p, fields } = buildTask(P, t.key, A.seed, t.variant);
  document.querySelectorAll("[data-in]").forEach(el => (t.vals ||= {})[el.dataset.in] = el.value);
  const vals = t.vals || {};
  const empty = fields.filter(f => String(vals[f.id] ?? "").trim() === "");
  if (empty.length) { warnInline("Заповніть усі поля відповіді."); return; }
  const bad = fields.filter(f => f.type !== "choice" && !Number.isFinite(num(vals[f.id])));
  if (bad.length) { warnInline("Введіть число (дробове — через кому), без зайвих символів."); return; }
  const wrong = fields.filter(f => !checkField(f, vals[f.id])).map(f => f.id);
  const nv = {}; fields.forEach(f => nv[f.id] = f.type === "choice" ? vals[f.id] : num(vals[f.id]));
  const e = { type: "try", t: new Date().toISOString(), vals: { ...vals }, ok: !wrong.length };
  if (wrong.length) { e.wrong = wrong; const d = T.diagnose ? T.diagnose(p, nv) : null; if (d) e.msg = d; }
  (t.log ||= []).push(e);
  confirmSol = false;
  await save();
  renderTask();
  if (e.ok) $("fbs").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function warnInline(m){ const fb = $("fbs"); fb.insertAdjacentHTML("beforeend", `<div class="fb bad" data-tmp>${esc(m)}</div>`); setTimeout(() => fb.querySelector("[data-tmp]")?.remove(), 4000); }
async function hint(){
  const t = cur(), s = taskStats(t);
  t.log.push({ type: "hint", lvl: s.hint1 ? 2 : 1, t: new Date().toISOString() });
  confirmSol = false; await save(); renderTask();
}
async function showSolution(){
  if (!confirmSol) { confirmSol = true; renderTask(); return; }
  confirmSol = false;
  const t = cur();
  t.log.push({ type: "sol", t: new Date().toISOString() });
  if (!t.twin) A.tasks.splice(A.cur + 1, 0, { key: t.key, slot: t.slot, variant: 1, twin: true, max: RULES.twin, log: [] });
  await save(); renderTask();
}
async function next(){
  A.cur++;
  if (A.cur >= A.tasks.length) A.stage = "conclusion";
  await save(); route(); window.scrollTo(0, 0);
}

// ---------- ШІ-помічник: пояснює, але не дає готового числа
function openAi(){
  $("aiBox").innerHTML = `<div class="fb ai" style="white-space:normal"><label style="margin-top:0">Що саме незрозуміло? Напишіть коротко.</label>
    <textarea id="aiQ" maxlength="300" style="min-height:70px" placeholder="Напр.: не розумію, чому треба віднімати"></textarea>
    <div class="btns"><span class="hint">ШІ пояснить хід розв'язання, але готової відповіді не дасть.</span><span class="sp"></span><button id="aiSend">Надіслати</button></div></div>`;
  $("aiQ").focus();
  $("aiSend").onclick = askAi;
}
async function askAi(){
  if (aiBusy) return;
  const q = $("aiQ").value.trim();
  if (q.length < 3) { $("aiQ").focus(); return; }
  const t = cur(); const { T, p, fields } = buildTask(P, t.key, A.seed, t.variant);
  aiBusy = true; $("aiSend").disabled = true; $("aiSend").textContent = "Думаю…";
  try {
    const tries = (t.log || []).filter(e => e.type === "try").slice(-3).map(e => fields.map(f => `${f.label}: ${e.vals[f.id] ?? ""}`).join("; "));
    const r = await fetch(WORKER_URL.replace(/\/$/, "") + "/hint", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: AI_SUBJECT, pid: PID, title: P.title, theory: plain(P.theory).slice(0, 3000), task: plain(T.text(p)),
        solution: plain(T.solution(p)), fields: fields.map(f => f.label + (f.unit ? ", " + f.unit : "")), tries, question: q }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.reply) throw new Error(d.error || "Помічник не відповів");
    t.log.push({ type: "ai", q, a: d.reply, t: new Date().toISOString() });
    await save(); renderTask();
  } catch(e){
    $("aiSend").disabled = false; $("aiSend").textContent = "Надіслати";
    $("aiBox").insertAdjacentHTML("beforeend", `<p class="bad">Не вдалося отримати відповідь: ${esc(e.message || e)}. Спробуйте ще раз або візьміть підказку.</p>`);
  } finally { aiBusy = false; }
}

// ---------- висновок і результат
function renderConclusion(){
  $("app").innerHTML = `<div class="card">${progress()}
    <div class="tq" style="font-size:17px">Висновок</div>
    <p>${esc(P.conclusion)}</p>
    <textarea id="concl" maxlength="1500" style="min-height:120px" placeholder="Своїми словами, 3–5 речень">${esc(A.conclusion || "")}</textarea>
    <div class="btns"><span class="bad" id="cErr"></span><span class="sp"></span><button id="fin">Завершити роботу</button></div></div>`;
  $("concl").oninput = e => { A.conclusion = e.target.value; local.set(AID, A); };
  $("fin").onclick = async () => {
    const c = $("concl").value.trim();
    if (c.length < 40) { $("cErr").textContent = "Напишіть висновок хоча б у 2–3 реченнях."; return; }
    A.conclusion = c; A.done = true; A.finishedAt = new Date().toISOString();
    A.result = gradeOf(A, P.tasks.length);
    await save(); route();
  };
}
function verdict(t){
  const s = taskStats(t);
  if (s.sol) return "розв'язок показано";
  if (!s.ok) return "не розв'язано";
  const parts = [];
  if (s.wrong) parts.push(`помилок: ${s.wrong}`);
  if (s.hint2) parts.push("2 підказки"); else if (s.hint1) parts.push("1 підказка");
  if (s.ai) parts.push(`ШІ: ${s.ai}`);
  return parts.length ? "розв'язано (" + parts.join(", ") + ")" : "з першої спроби";
}
function renderDone(){
  const g = gradeOf(A, P.tasks.length);
  $("app").innerHTML = `<div class="card">
    <div class="hint">Практична робота №${P.num}</div><div class="tq">Роботу завершено</div>
    <p style="font-size:18px">Попередня оцінка: <b>${g.grade} з 12</b> <span class="hint">(${fmtN(g.points, 1)} бала)</span>. Остаточну оцінку виставляє викладач.</p>
    <table class="rep res"><tr><th>Задача</th><th>Результат</th><th>Бал</th></tr>
      ${A.tasks.map(t => { const T = P.tasks.find(x => x.key === t.key);
        return `<tr><td>${t.twin ? "↳ аналогічна" : (t.slot + 1) + ". " + esc(T.title)}</td><td>${verdict(t)}</td><td>${pct(creditOf(t))}</td></tr>`; }).join("")}
    </table>
    <p class="hint">Бал за кожну основну задачу разом з її аналогічною — до 100 %. Підсумок = 12 × (сума) / ${P.tasks.length}.</p>
    <details><summary>Ваш висновок</summary><p style="white-space:pre-wrap">${esc(A.conclusion)}</p></details></div>`;
}

// ---------- виходи зі сторінки (для викладача; на оцінку не впливають)
let hideAt = 0;
document.addEventListener("visibilitychange", () => {
  if (!A || A.done || A.stage !== "tasks") return;
  if (document.hidden) { A.meta.blur = (A.meta.blur || 0) + 1; hideAt = Date.now(); save(); }
  else if (hideAt) {
    const s = Math.round((Date.now() - hideAt) / 1000); hideAt = 0;
    if (s >= 3) { const t = cur(); (A.meta.away ||= []).push({ task: t ? (t.twin ? t.slot + 1 + "а" : t.slot + 1) : "", s }); save(); }
  }
});

start();
