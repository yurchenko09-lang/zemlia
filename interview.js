import * as st from "./store.js";
import { WORKER_URL } from "./ai-config.js";

const START = "Починаймо співбесіду.";
const MAX_ANSWER = 2000;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const params = new URLSearchParams(location.search);
const TID = (params.get("i") || "").trim();

let SETTINGS, CFG, TITLE = "", TLIST = "", A = null, AID = null, UID = null;
let busy = false, askedAt = 0, timerId = null, finishing = false;

const local = {
  get(id){ try { return JSON.parse(localStorage.getItem("ai:"+id)); } catch(e){ return null; } },
  set(id,d){ try { localStorage.setItem("ai:"+id, JSON.stringify(d)); } catch(e){} }
};
function net(msg){ const n=$("net"); if(!msg){ n.classList.remove("show"); return; } n.textContent=msg; n.classList.add("show"); }
function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); }
function unwarn(){ $("alert").classList.remove("show"); }

let pending = false, retryT = null;
async function save(){
  A.updatedAt = new Date().toISOString();
  local.set(AID, A);
  try { await st.saveAttempt(AID, A); pending = false; }
  catch(e){ pending = true; clearTimeout(retryT); retryT = setTimeout(()=>{ if(pending) save(); }, 15000); }
}
window.addEventListener("online", ()=>{ if(pending) save(); });

// ---------- старт
async function start(){
  if (!/^[a-z0-9_-]{1,40}$/i.test(TID)) { $("app").innerHTML = `<div class="card">Посилання неповне. Попросіть у викладача правильне посилання.</div>`; return; }
  let COURSE;
  try {
    [SETTINGS, UID] = await Promise.all([st.getSettings(), st.studentInit()]);
    COURSE = await fetch("course.json", { cache: "no-cache" }).then(r => r.json());
  } catch(e){ $("app").innerHTML = `<div class="card">Не вдалося завантажити сторінку. Перевірте інтернет і оновіть сторінку.<br><span class="hint">${esc(e.message||e)}</span></div>`; return; }
  CFG = (SETTINGS.ai || {})[TID] || {};
  const all = COURSE.sections.flatMap(s => s.topics);
  const tl = (CFG.topics || []).map(id => all.find(t => t.id === id)).filter(Boolean);
  TITLE = CFG.title || (tl.length === 1 ? `Тема ${tl[0].num}` : "Співбесіда");
  TLIST = tl.map(t => `Тема ${t.num}. ${esc(t.title)}`).join("<br>");
  $("htitle").textContent = "Співбесіда · " + TITLE;
  if (!CFG.open) { $("app").innerHTML = `<div class="card"><div class="tq">${esc(TITLE)}</div><p>Ця співбесіда зараз закрита.</p></div>`; return; }
  renderLogin();
}

function renderLogin(){
  const groups = (CFG.groups && CFG.groups.length ? CFG.groups : SETTINGS.groups) || [];
  const nq = CFG.nq || 6;
  $("app").innerHTML = `<div class="card">
    <div class="hint">Співбесіда з ШІ-екзаменатором</div><div class="tq">${esc(TITLE)}</div><div class="hint" style="margin-bottom:10px">${TLIST}</div>
    <ol class="hint" style="padding-left:20px;margin:0">
      <li>ШІ поставить <b>${nq} питань</b> за матеріалом ${(CFG.topics||[]).length > 1 ? "цих тем" : "лекції"} і може уточнювати ваші відповіді.</li>
      <li>Відповідайте <b>своїми словами</b>, як на усному занятті. Вставляти скопійований текст не можна.</li>
      ${CFG.minutes ? `<li>На всю співбесіду — <b>${CFG.minutes} хв</b>. Коли час мине, співбесіда завершиться автоматично.</li>` : ""}
      <li>Перемикання на інші вкладки і програми фіксується.</li>
      <li>Якщо зник зв'язок чи світло, відкрийте посилання знову з <b>того самого пристрою і браузера</b>, введіть ті самі групу і ПІБ — продовжите з того ж місця.</li>
    </ol>
    <div class="info" style="margin-top:14px">
      <b>⚠ Питання ставить штучний інтелект, а не викладач.</b>
      <ul style="margin:6px 0 0;padding-left:20px">
        <li>Співбесіду веде мовна модель Claude (компанія Anthropic). Вона ставить питання за лекціями курсу і пропонує <b>попередню</b> оцінку за критеріями.</li>
        <li><b>Остаточну оцінку виставляє викладач.</b> Він бачить увесь діалог і може змінити оцінку ШІ в будь-який бік.</li>
        <li>ШІ отримує лише текст ваших відповідей. Ваше прізвище, ім'я і група йому <b>не передаються</b>, вони зберігаються тільки в базі сайту. Відповіді не використовуються для навчання моделі.</li>
        <li>ШІ може помилятися. Якщо питання здалося некоректним або незрозумілим, так і напишіть у відповіді, а якщо не згодні з результатом — зверніться до викладача.</li>
        <li>Не пишіть у відповідях особистих даних (телефон, адресу тощо) — вони не потрібні.</li>
      </ul>
    </div>
    <label class="chk" style="margin:6px 0 4px"><input type="checkbox" id="agree"> Я ознайомився(-лася) і розумію, що співбесіду веде ШІ, а оцінку виставляє викладач</label>
    <label>Група</label><select id="grp"><option value="">— оберіть —</option>${groups.map(g=>`<option>${esc(g)}</option>`).join("")}</select>
    <label>Прізвище та ім'я</label>${st.nameField()}
    <div class="row" style="margin-top:16px"><span class="bad" id="regErr"></span><span class="sp"></span><button id="go">Почати / продовжити</button></div></div>`;
  $("go").onclick = login;

}

async function login(){
  let g = $("grp").value, n = $("nm").value.trim().replace(/\s+/g," ");
  const er = $("regErr");
  if (!$("agree").checked) { er.textContent = "Підтвердіть, що ознайомилися з умовами співбесіди."; return; }
  if (!g) { er.textContent = "Оберіть групу."; return; }
  if (!st.isUkrainian(n) || n.split(" ").length < 2) { er.textContent = "Введіть прізвище та ім'я українською."; return; }
  if (st.hasRosterFor(SETTINGS, g)) {
    er.textContent = "Перевіряємо…";
    const m = await st.matchName(SETTINGS, g, n);
    if (m.status === "none") { er.textContent = "Такого студента немає у списку групи. Перевірте групу і введіть прізвище та ім'я українською, як у журналі."; return; }
    if (m.status === "hint") {
      er.innerHTML = `Можливо, ви — ${m.names.map(x => `<button class="sm sec" data-pick="${esc(x)}">${esc(x)}</button>`).join(" ")}? Натисніть своє ім'я.`;
      er.querySelectorAll("[data-pick]").forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); $("nm").value = b.dataset.pick; login(); });
      return;
    }
    n = m.name;          // точне написання зі списку
  }
  er.textContent = "Зачекайте…"; $("go").disabled = true;
  AID = st.attemptId("ai-"+TID, g, n);
  let server;
  try { server = await st.getAttempt(AID); } catch(e){ server = undefined; }
  if (server && server.__locked) { er.innerHTML = "Цю співбесіду ви вже почали на <b>іншому пристрої чи браузері</b>. Продовжіть там або попросіть викладача дозволити продовження тут."; $("go").disabled = false; return; }
  let loc = local.get(AID);
  if (server === null && loc && loc.done) loc = null;     // викладач дозволив пройти заново
  // беремо новішу копію (локальна може бути новішою, якщо зник зв'язок)
  A = server && loc ? ((loc.messages||[]).length > (server.messages||[]).length ? loc : server) : (server || loc);
  if (A && A.done) { renderDone(); return; }
  if (!A) {
    A = { topic: "ai-"+TID, t: TID, topics: CFG.topics || [], group: g, name: n, uid: UID, messages: [], sig: "", done: false,
          meta: { startedAt: new Date().toISOString(), blur: 0, pastes: 0, secs: [], aiNoticeAccepted: new Date().toISOString() } };
  }
  A.uid = UID; A.meta ||= { startedAt: new Date().toISOString(), blur: 0, pastes: 0, secs: [] };
  await save();
  renderChat();
  if (!A.messages.length) send(START);
  else if (A.messages.length % 2 === 0) { askedAt = Date.now(); }        // останнє — питання ШІ, чекаємо відповідь
  else send(null);                                                     // відповідь студента не дійшла — надсилаємо ще раз
}

// ---------- чат
function bubble(m, i){
  if (i === 0) return "";
  const text = m.role === "assistant" ? (m.content.split(/<eval>/i)[0].trim() || "Дякую! Співбесіду завершено.") : m.content;
  return `<div class="msg ${m.role==="user"?"me":"ai"}">${esc(text)}</div>`;
}
function renderChat(){
  unwarn();
  $("app").innerHTML = `<div class="card">
    <div class="hint">${esc(TITLE)}</div>
    <div class="hint" style="margin-bottom:8px">${esc(A.name)} · ${esc(A.group)}</div>
    <div class="chat" id="chat">${A.messages.map(bubble).join("")}</div>
    <div class="composer" id="composer">
      <textarea id="ans" maxlength="${MAX_ANSWER}" placeholder="Ваша відповідь своїми словами…" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
      <div class="row" style="margin-top:8px"><span class="cnt" id="cnt">0 / ${MAX_ANSWER}</span><span class="bad" id="sendErr"></span><span class="sp"></span>
        <button id="send">Надіслати</button></div>
      <div class="hint" style="margin-top:6px">Ctrl+Enter — надіслати</div>
    </div></div>`;
  const ta = $("ans");
  ta.addEventListener("paste", noPaste); ta.addEventListener("drop", noPaste);
  ta.addEventListener("beforeinput", e => { if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") noPaste(e); });
  ta.addEventListener("input", () => { $("cnt").textContent = `${ta.value.length} / ${MAX_ANSWER}`; try { localStorage.setItem("ai-draft:"+AID, ta.value); } catch(e){} });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); } });
  try { ta.value = localStorage.getItem("ai-draft:"+AID) || ""; $("cnt").textContent = `${ta.value.length} / ${MAX_ANSWER}`; } catch(e){}
  $("send").onclick = onSend;
  startTimer();
  scrollEnd();
}
function noPaste(e){
  e.preventDefault();
  A.meta.pastes = (A.meta.pastes||0) + 1;
  $("sendErr").textContent = "Вставляти текст не можна — пишіть своїми словами.";
  setTimeout(()=>{ const s=$("sendErr"); if (s && s.textContent.startsWith("Вставляти")) s.textContent=""; }, 4000);
}
function scrollEnd(){ window.scrollTo(0, document.body.scrollHeight); }
function typing(on){
  const c = $("chat"); if (!c) return;
  const t = c.querySelector(".typing"); if (t) t.remove();
  if (on) { c.insertAdjacentHTML("beforeend", `<div class="typing"><i></i><i></i><i></i></div>`); scrollEnd(); }
}
function lockInput(on){ const b=$("send"), t=$("ans"); if (b) b.disabled = on; if (t) t.disabled = on; }

function onSend(){
  if (busy) return;
  const text = $("ans").value.trim();
  if (!text) { $("sendErr").textContent = "Напишіть відповідь."; return; }
  send(text);
}

// text: рядок — нове повідомлення; null — повторити надсилання останнього
async function send(text, finish = false){
  if (busy) return;
  busy = true; lockInput(true); $("sendErr") && ($("sendErr").textContent = "");
  if (text !== null) {
    if (askedAt && text !== START) A.meta.secs.push(Math.round((Date.now() - askedAt) / 1000));
    A.messages.push({ role: "user", content: text });
    if (text !== START) $("chat").insertAdjacentHTML("beforeend", bubble(A.messages[A.messages.length-1], 1));
    try { localStorage.removeItem("ai-draft:"+AID); } catch(e){}
    $("ans").value = ""; $("cnt").textContent = `0 / ${MAX_ANSWER}`;
    await save();
  }
  typing(true);
  try {
    const r = await fetch(WORKER_URL.replace(/\/$/,"") + "/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: TID, sid: AID, messages: A.messages, sig: A.sig, finish: finish || timeIsUp() })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || ("Помилка " + r.status)), { status: r.status });
    typing(false); net("");
    A.messages.push({ role: "assistant", content: d.reply });
    A.sig = d.sig;
    $("chat").insertAdjacentHTML("beforeend", bubble(A.messages[A.messages.length-1], 1));
    if (d.done) {
      A.done = true; A.eval = d.eval; A.score = d.eval ? d.eval.total : null;
      A.meta.finishedAt = new Date().toISOString();
      await save();
      setTimeout(renderDone, 1500);
      return;
    }
    await save();
    askedAt = Date.now();
    busy = false; lockInput(false); $("ans").focus(); scrollEnd();
  } catch(e){
    typing(false); busy = false;
    if (e.status) {
      // сервер відповів помилкою: повідомлення студента повертаємо в поле, щоб не втратити
      const last = A.messages[A.messages.length-1];
      if (last && last.role === "user" && last.content !== START) {
        A.messages.pop(); A.meta.secs.pop();
        const bs = $("chat").querySelectorAll(".msg.me"); if (bs.length) bs[bs.length-1].remove();
        $("ans").value = last.content;
      } else if (last && last.content === START) { A.messages.pop(); }
      await save();
      lockInput(false);
      $("sendErr").textContent = e.message;
    } else {
      // немає зв'язку: повідомлення збережено, пропонуємо повторити
      net("Немає зв'язку з сервером. Відповідь збережено.");
      $("sendErr").innerHTML = `Не вдалося надіслати. <button class="sm sec" id="retry">Надіслати ще раз</button>`;
      $("retry").onclick = () => send(null, finish);
    }
  }
}

// ---------- таймер
function deadline(){ return CFG.minutes ? new Date(A.meta.startedAt).getTime() + CFG.minutes * 60000 : 0; }
function timeIsUp(){ const d = deadline(); return !!d && Date.now() >= d; }
function startTimer(){
  clearInterval(timerId);
  if (!CFG.minutes) return;
  const el = $("timer"); el.style.display = "";
  const tick = () => {
    const left = Math.max(0, Math.round((deadline() - Date.now()) / 1000));
    el.textContent = `${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`;
    el.classList.toggle("low", left < 120);
    if (left === 0 && !finishing && !A.done) {
      finishing = true; clearInterval(timerId);
      const wait = setInterval(() => {
        if (busy) return;
        clearInterval(wait);
        if (A.messages.length % 2 === 0) { const t = ($("ans").value || "").trim(); send(t || "(час вичерпано, відповіді немає)", true); }
        else send(null, true);
      }, 500);
    }
  };
  tick(); timerId = setInterval(tick, 1000);
}

// ---------- кінець
function renderDone(){
  clearInterval(timerId); $("timer").style.display = "none";
  const e = A.eval;
  const show = CFG.showScore && e && !e.error;
  $("app").innerHTML = `<div class="card">
    <div class="tq">Співбесіду завершено</div>
    <p>Дякуємо! Ваші відповіді збережено і передано викладачу.</p>
    ${show ? `<p class="big">${e.total} / ${e.max}</p><p class="hint">Попередня оцінка ШІ. Остаточну оцінку виставляє викладач.</p>
      ${e.gaps && e.gaps.length ? `<p><b>Що варто повторити:</b></p><ul>${e.gaps.map(g=>`<li>${esc(g)}</li>`).join("")}</ul>` : ""}` : ""}
  </div>`;
}

// ---------- перемикання вкладок
document.addEventListener("visibilitychange", () => {
  if (document.hidden && A && !A.done && A.messages.length) { A.meta.blur = (A.meta.blur||0) + 1; save(); }
});

start();
