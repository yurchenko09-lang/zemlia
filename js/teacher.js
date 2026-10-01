import * as st from "./store.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const fmt = s => { s=Math.round(s||0); return Math.floor(s/60)+" хв "+String(s%60).padStart(2,"0")+" с"; };
const FAST_WPS = 6;
let COURSE, SETTINGS, READY = {}, TAB = "access", TOPICS = {}, KEYS = {}, ROWS = [], SEL = { topic:"", group:"" };

function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); setTimeout(()=>a.classList.remove("show"), 6000); }
const allTopics = () => COURSE.sections.flatMap(s=>s.topics);
const studentLink = id => new URL(`index.html?t=${id}`, location.href).href;

async function start(){
  if (st.DEMO) $("demo").innerHTML = '<span class="demo">Демо-режим: Firebase ще не підключено</span>';
  let u = null;
  try { u = await st.teacherCurrent(); } catch(e){ warn(esc(e.message||e)); }
  if (!u){
    $("app").innerHTML = `<div class="card"><h3 style="margin-top:0">Вхід викладача</h3><p class="hint">Увійдіть один раз — браузер запам'ятає вхід.</p><button class="mb" id="gin">Увійти через Google</button></div>`;
    await new Promise(res => { $("gin").onclick = async () => {
      try { u = await st.teacherSignIn(); res(); } catch(e){ warn(esc(e.message||e)); }
    }; });
  }
  $("who").textContent = u.email;
  COURSE = await fetch("course.json").then(r=>r.json());
  SETTINGS = await st.getSettings(); SETTINGS.groups ||= []; SETTINGS.topics ||= {};
  allTopics().forEach(t => READY[t.id] = !!t.ready);
  render();
}
function tabs(){ return `<div class="tabs">${[["access","Теми і доступ"],["results","Результати"],["keys","Ключі відповідей"]].map(([k,l])=>`<button class="${TAB===k?'on':''}" data-act="tab" data-v="${k}">${l}</button>`).join("")}</div>`; }
function render(){
  if (TAB==="access") renderAccess(); else if (TAB==="results") renderResults(); else renderKeys();
}
// ---------- доступ
function renderAccess(){
  const G = SETTINGS.groups;
  $("app").innerHTML = tabs() + `<div class="card">
    <h3 style="margin-top:0">Групи</h3><p class="hint">По одній назві в рядку.</p>
    <textarea id="groups" style="min-height:90px">${esc(G.join("\n"))}</textarea>
    <div class="row" style="margin-top:8px"><span class="sp"></span><button class="sec" data-act="saveGroups">Зберегти групи</button></div></div>
    <div class="card"><h3 style="margin-top:0">Теми</h3><p class="hint">Відкрийте тему, оберіть групи і дедлайн, збережіть — і надішліть студентам посилання.</p>
    ${COURSE.sections.map(s=>`<h4 style="margin:16px 0 4px">${esc(s.title)}</h4>${s.topics.map(t=>{
      const c = SETTINGS.topics[t.id] || {}; const r = READY[t.id];
      return `<div class="tp ${c.open?'on':''}" data-t="${t.id}"><div class="row"><b>${t.num}. ${esc(t.title)}</b><span class="sp"></span>${r?'':'<span class="hint">ще не готова</span>'}</div>
      ${r?`<div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" class="op" ${c.open?'checked':''}> Відкрита</label>
        <span class="hint">Дедлайн:</span><input type="datetime-local" class="dl" value="${esc(c.deadline||'')}" style="width:auto"></div>
        <div>${G.map(g=>`<label class="chk"><input type="checkbox" class="gr" value="${esc(g)}" ${(c.groups||[]).includes(g)?'checked':''}> ${esc(g)}</label>`).join("") || '<span class="hint">Спершу додайте групи</span>'}</div>
        <div class="row" style="margin-top:6px"><code>${esc(studentLink(t.id))}</code><button class="sm sec" data-act="copy" data-v="${esc(studentLink(t.id))}">Копіювати</button> <a class="sm sec" style="padding:6px 10px;border-radius:8px;background:#e7ebe2;text-decoration:none;color:inherit" href="preview.html?t=${t.id}" target="_blank">Переглянути</a><span class="sp"></span><button class="sm" data-act="saveTopic" data-v="${t.id}">Зберегти</button></div>`:''}</div>`;
    }).join("")}`).join("")}</div>`;
}
async function saveGroups(){ SETTINGS.groups = $("groups").value.split("\n").map(s=>s.trim()).filter(Boolean); await st.saveSettings(SETTINGS); warn("Групи збережено"); render(); }
async function saveTopic(id){
  const box = document.querySelector(`.tp[data-t="${id}"]`);
  SETTINGS.topics[id] = { open: box.querySelector(".op").checked, deadline: box.querySelector(".dl").value, groups: [...box.querySelectorAll(".gr:checked")].map(i=>i.value) };
  await st.saveSettings(SETTINGS); warn("Збережено"); render();
}
// ---------- результати
async function loadTopic(id){
  if (!TOPICS[id]) TOPICS[id] = await st.loadTopic(id);
  if (KEYS[id] === undefined) KEYS[id] = await st.getKeys(id);
  ROWS = await st.listAttempts(id);
}
function score(T, K, a){
  if (!K) return null; let ok=0, n=0;
  T.blocks.forEach((B,i)=>{ const b=(a.blocks||{})[i]; if(!b||!b.picks) return; const k=K.keys[i][b.variant||0]; b.picks.forEach((p,qi)=>{ n++; if(p===k[qi]) ok++; }); });
  return { ok, n };
}
function stats(T, a){
  const bl = Object.entries(a.blocks||{}).map(([i,b])=>({i:+i, ...b}));
  const read = bl.reduce((s,b)=>s+(b.readSec||0),0);
  const fast = bl.filter(b => b.picks && b.readSec < T.blocks[b.i].words/FAST_WPS).length;
  const blur = bl.reduce((s,b)=>s+(b.blur||0),0) + (a.finalBlur||0);
  const intr = bl.reduce((s,b)=>s+(b.interrupts||0),0);
  const notEnd = bl.filter(b => b.picks && !b.reachedEnd).length;
  const G = KEYS[SEL.topic] && KEYS[SEL.topic].gems; const gems = G ? bl.filter(b=>b.picks && b.letter && b.letter===G[b.i][a.wordV||0]).length : null;
  const cx = T.cross && a.cross ? `${a.cross.ok.length}/${T.cross[a.crossV||0].entries.length}` : "—";
  const word = a.word ? (a.word.ok ? "✓" : (a.word.answer ? "✗" : "—")) : "—";
  return { read, fast, blur, intr, notEnd, subm: bl.filter(b=>b.picks).length, gems, cx, word };
}
function renderResults(){
  const ready = allTopics().filter(t=>READY[t.id]);
  if (!SEL.topic && ready.length) SEL.topic = ready[0].id;
  $("app").innerHTML = tabs() + `<div class="card"><div class="row">
    <select id="selT" style="width:auto">${ready.map(t=>`<option value="${t.id}" ${t.id===SEL.topic?'selected':''}>Тема ${t.num}</option>`).join("")}</select>
    <select id="selG" style="width:auto"><option value="">Усі групи</option>${SETTINGS.groups.map(g=>`<option ${g===SEL.group?'selected':''}>${esc(g)}</option>`).join("")}</select>
    <button class="sec" data-act="load">Оновити</button><span class="sp"></span>
    <button class="sec" data-act="exportCsv">CSV (журнал)</button><button data-act="exportJson">JSON (для перевірки відкритих)</button></div>
    <div id="res" style="margin-top:14px" class="hint">Завантаження…</div></div>`;
  $("selT").onchange = e => { SEL.topic=e.target.value; renderResults(); };
  $("selG").onchange = e => { SEL.group=e.target.value; drawTable(); };
  loadTopic(SEL.topic).then(drawTable).catch(e=>{ $("res").innerHTML = '<span class="bad">Помилка: '+esc(e.message||e)+'</span>'; });
}
function filtered(){ return ROWS.filter(a=>!SEL.group || a.group===SEL.group).sort((a,b)=>(a.group+a.name).localeCompare(b.group+b.name,"uk")); }
function drawTable(){
  const T = TOPICS[SEL.topic], K = KEYS[SEL.topic], rows = filtered();
  if (!rows.length){ $("res").innerHTML = "Ще ніхто не почав цю тему."; return; }
  $("res").innerHTML = `${K?'':'<div class="info">Ключі відповідей для цієї теми не завантажено — бали за тести не рахуються (вкладка «Ключі відповідей»).</div>'}
  <table class="rep"><tr><th>Студент</th><th>Прогрес</th><th>Читав</th><th>Тест</th><th>Гра: букви · слово · кросворд</th><th>Сигнали</th><th>Оновлено</th></tr>
  ${rows.map(a=>{ const s=stats(T,a), sc=score(T,K,a);
    const sig = [s.fast?`<span class="bad">швидко: ${s.fast} бл.</span>`:"", s.notEnd?`<span class="bad">не догортав: ${s.notEnd}</span>`:"", s.blur?`<span class="bad">виходи: ${s.blur}</span>`:"", s.intr?`<span class="hint">перерви: ${s.intr}</span>`:""].filter(Boolean).join("<br>") || '<span class="ok">—</span>';
    return `<tr class="clk" data-act="detail" data-v="${esc(a.id)}"><td><b>${esc(a.name)}</b><br><span class="hint">${esc(a.group)}</span></td>
      <td>${a.done?'<span class="ok">завершено</span>':`${s.subm}/${T.blocks.length}`}</td><td>${fmt(s.read)}</td>
      <td>${sc?`${sc.ok}/${sc.n}`:'—'}</td><td>${s.gems===null?'—':`${s.gems}/${T.blocks.length}`} · ${s.word} · ${s.cx}</td><td>${sig}</td><td class="hint">${a.updatedAt?new Date(a.updatedAt).toLocaleString("uk-UA"):""}</td></tr>`; }).join("")}</table>
  <p class="hint">Натисніть на рядок, щоб побачити відповіді. «Швидко» — читав швидше за ${FAST_WPS} слів/с.</p>`;
}
function detail(id){
  const a = ROWS.find(r=>r.id===id), T = TOPICS[SEL.topic], K = KEYS[SEL.topic];
  $("res").innerHTML = `<div class="row"><button class="sec sm" data-act="back">← До списку</button><span class="sp"></span>
    <button class="sec sm" data-act="unbind" data-v="${esc(id)}">Дозволити продовжити на іншому пристрої</button>
    <button class="sm" style="background:var(--warn)" data-act="reset" data-v="${esc(id)}">Скинути спробу</button></div>
    <h3>${esc(a.name)} · ${esc(a.group)}</h3>
    <p class="hint">Почав: ${a.startedAt?new Date(a.startedAt).toLocaleString("uk-UA"):""} · Сеансів: ${a.sessions||1} · ${a.done?'Завершив: '+new Date(a.finishedAt).toLocaleString("uk-UA"):'не завершено'}</p>
    ${T.blocks.map((B,i)=>{ const b=(a.blocks||{})[i]; if(!b) return ""; const V=B.variants[b.variant||0]; const k=K?K.keys[i][b.variant||0]:null;
      return `<h4 style="margin:18px 0 4px">${i+1}. ${esc(B.title)} ${b.variant?'<span class="badge">запасні питання</span>':''}</h4>
      <p class="hint">Читав ${fmt(b.readSec)} (норма ≈ ${fmt(B.words/2.5)})${b.readSec<B.words/FAST_WPS&&b.picks?' <span class="bad">дуже швидко</span>':''}${b.reachedEnd?'':' <span class="bad">не догортав</span>'}
       · буква: ${b.letter?esc(b.letter):'—'}${K&&K.gems?((b.letter===K.gems[i][a.wordV||0])?' <span class="ok">✓</span>':` <span class="bad">✗ (${esc(K.gems[i][a.wordV||0])})</span>`):''}
       · відповідав ${fmt(b.quizSec)}${b.auto?' (час вичерпано)':''} · виходи: ${b.blur||0} · перерви: ${b.interrupts||0}</p>
      ${b.picks?`<table class="rep">${V.mcq.map((m,qi)=>{ const p=b.picks[qi]; const ok=k?p===k[qi]:null;
        return `<tr><td>${esc(m.q)}</td><td>${p>=0?esc(m.o[p]):'<span class="bad">— без відповіді —</span>'}${k&&!ok?`<br><span class="hint">Правильно: ${esc(m.o[k[qi]])}</span>`:''}</td><td class="${ok?'ok':ok===false?'bad':''}">${ok?'✓':ok===false?'✗':''}</td></tr>`; }).join("")}
        <tr><td>${esc(V.open)}</td><td colspan="2">${b.open?esc(b.open):'<span class="bad">— порожньо —</span>'}</td></tr></table>`:'<p class="hint">Ще відповідає…</p>'}`; }).join("")}
    ${a.cross?`<h4>Кросворд (варіант ${(a.crossV||0)+1})</h4><p class="hint">Розгадано ${a.cross.ok.length} з ${T.cross[a.crossV||0].entries.length} · перевірок: ${a.cross.checks} · час: ${fmt(a.cross.sec)}</p>`:''}
    ${a.word?`<h4>Кодове слово</h4><p>${a.word.ok?'<span class="ok">✓ складено правильно</span>':'<span class="bad">✗ не складено</span>'} (спроб: ${a.word.tries}, відповідь: ${esc(a.word.answer||'—')})</p><table class="rep"><tr><td>Що означає слово і де траплялося в темі</td><td>${a.word.expl?esc(a.word.expl):'<span class="bad">— порожньо —</span>'}</td></tr></table>`:''}
    ${a.done?`<h4>Підсумкове завдання</h4><p class="hint">Виходи: ${a.finalBlur||0}</p><table class="rep"><tr><td>${esc(T.final)}</td><td>${a.final?esc(a.final):'<span class="bad">— порожньо —</span>'}</td></tr></table>`:''}`;
}
function download(name, text, type){ const b=new Blob([text],{type}); const u=URL.createObjectURL(b); const l=document.createElement("a"); l.href=u; l.download=name; l.click(); setTimeout(()=>URL.revokeObjectURL(u),2000); }
function exportJson(){
  const T=TOPICS[SEL.topic], K=KEYS[SEL.topic];
  const out = { course:COURSE.title, topic:`Тема ${T.num}. ${T.title}`, exported:new Date().toISOString(), group:SEL.group||"усі",
    students: filtered().map(a=>({ name:a.name, group:a.group, done:!!a.done,
      blocks: T.blocks.map((B,i)=>{ const b=(a.blocks||{})[i]; if(!b||!b.picks) return null; const V=B.variants[b.variant||0], k=K?K.keys[i][b.variant||0]:null;
        return { block:`${i+1}. ${B.title}`, lecture_summary:B.sum, readSec:b.readSec, fast:b.readSec<B.words/FAST_WPS, reachedEnd:!!b.reachedEnd, blur:b.blur||0, interrupts:b.interrupts||0, reserve:!!b.variant,
          tests: V.mcq.map((m,qi)=>({ q:m.q, answer:b.picks[qi]>=0?m.o[b.picks[qi]]:null, correct:k?b.picks[qi]===k[qi]:null })),
          open:{ q:V.open, answer:b.open||"" } }; }).filter(Boolean),
      game: { letters_ok: stats(T,a).gems, word: a.word ? { answer:a.word.answer||"", correct:!!a.word.ok, explanation:a.word.expl||"" } : null,
              crossword: a.cross ? { variant:(a.crossV||0)+1, solved:a.cross.ok.length, total:T.cross[a.crossV||0].entries.length } : null },
      final: a.done ? { q:T.final, answer:a.final||"" } : null })) };
  download(`${SEL.topic}_${SEL.group||"all"}_answers.json`, JSON.stringify(out,null,1), "application/json");
}
function exportCsv(){
  const T=TOPICS[SEL.topic], K=KEYS[SEL.topic];
  const q = v => `"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [["Група","ПІБ","Завершено","Блоків здано","Тест (правильних)","Тест (усього)","Читання, хв","Блоків «швидко»","Виходи","Перерви","Букви","Слово","Кросворд"].map(q).join(";")];
  filtered().forEach(a=>{ const s=stats(T,a), sc=score(T,K,a); lines.push([a.group,a.name,a.done?"так":"ні",s.subm,sc?sc.ok:"",sc?sc.n:"",Math.round(s.read/60),s.fast,s.blur,s.intr,s.gems??"",s.word,s.cx].map(q).join(";")); });
  download(`${SEL.topic}_${SEL.group||"all"}.csv`, "﻿"+lines.join("\n"), "text/csv");
}
// ---------- ключі
function renderKeys(){
  const ready = allTopics().filter(t=>READY[t.id]);
  $("app").innerHTML = tabs() + `<div class="card"><h3 style="margin-top:0">Ключі відповідей</h3>
    <p class="hint">Правильні відповіді не лежать на сайті, щоб студенти не могли їх підглянути. Для кожної теми завантажте файл <code>tXX_keys.json</code>, який надсилає Claude разом із темою.</p>
    <table class="rep"><tr><th>Тема</th><th>Ключі</th><th></th></tr>${ready.map(t=>`<tr><td>Тема ${t.num}. ${esc(t.title)}</td><td id="k_${t.id}" class="hint">…</td>
      <td><input type="file" accept=".json" data-t="${t.id}" class="kf"></td></tr>`).join("")}</table></div>`;
  ready.forEach(async t=>{ const k = KEYS[t.id]!==undefined ? KEYS[t.id] : (KEYS[t.id]=await st.getKeys(t.id)); $("k_"+t.id).innerHTML = k?'<span class="ok">завантажено</span>':'<span class="bad">немає</span>'; });
  document.querySelectorAll(".kf").forEach(inp=>inp.onchange=async e=>{
    const id=e.target.dataset.t; try { const k=JSON.parse(await e.target.files[0].text());
      if(k.topic!==id || !Array.isArray(k.keys)) throw new Error("Це файл ключів для іншої теми");
      await st.saveKeys(id,k); KEYS[id]={keys:k.keys, gems:k.gems||null}; warn("Ключі збережено"); renderKeys(); } catch(err){ warn(esc(err.message||err)); } });
}
// ---------- дії
const ACT = {
  signin: start, tab: el=>{ TAB=el.dataset.v; render(); }, saveGroups, saveTopic: el=>saveTopic(el.dataset.v),
  copy: el=>{ navigator.clipboard?.writeText(el.dataset.v); warn("Посилання скопійовано"); },
  load: ()=>{ ROWS=[]; loadTopic(SEL.topic).then(drawTable); }, detail: el=>detail(el.dataset.v), back: drawTable,
  unbind: async el=>{ await st.updateAttempt(el.dataset.v,{uid:null}); warn("Тепер студент може продовжити з іншого пристрою"); },
  reset: async el=>{ if(!confirm("Видалити всю спробу цього студента? Це не можна скасувати.")) return; await st.deleteAttempt(el.dataset.v); ROWS=ROWS.filter(r=>r.id!==el.dataset.v); drawTable(); },
  exportJson, exportCsv
};
document.addEventListener("click", e=>{ const b=e.target.closest("[data-act]"); if(!b) return; e.preventDefault(); ACT[b.dataset.act](b); });
if (st.DEMO) start();
