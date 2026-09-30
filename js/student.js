import * as st from "./store.js";
 
const CFG = { secPerMcq: 60, secOpen: 180, draftEvery: 30000, readSaveEvery: 90000 };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const toTop = () => window.scrollTo(0, 0);
const params = new URLSearchParams(location.search);
 
let COURSE, SETTINGS, T = null, A = null, AID = null, UID = null;
let S = { phase:"", readStart:0, qStart:0, blur:0, tid:null, did:null, rid:null };
 
// ---------- збереження з локальною копією і повтором при відсутності зв'язку
const local = {
  get(id){ try { return JSON.parse(localStorage.getItem("att:"+id)); } catch(e){ return null; } },
  set(id,d){ try { localStorage.setItem("att:"+id, JSON.stringify(d)); } catch(e){} }
};
let pending = false, retryT = null;
function net(msg){ const n=$("net"); if(!msg){ n.classList.remove("show"); return; } n.textContent=msg; n.classList.add("show"); }
async function save(){
  A.updatedAt = new Date().toISOString();
  local.set(AID, A);
  try { await st.saveAttempt(AID, A); pending=false; net(""); }
  catch(e){
    pending = true; net("Немає зв'язку. Відповіді збережено на пристрої, надішлемо автоматично.");
    clearTimeout(retryT); retryT = setTimeout(()=>{ if(pending) save(); }, 15000);
  }
}
window.addEventListener("online", ()=>{ if(pending) save(); });
 
function warn(m){ const a=$("alert"); a.innerHTML=m; a.classList.add("show"); }
function unwarn(){ $("alert").classList.remove("show"); }
 
// ---------- карта курсу
function courseMap(activeId){
  const open = SETTINGS.topics || {};
  return COURSE.sections.map(s => `<div class="map"><div class="mtitle">${s.title}</div><div class="midea">${s.idea}</div><div class="mblocks">${
    s.topics.map(t => {
      const o = open[t.id] && open[t.id].open;
      const cls = t.id===activeId ? "cur" : o ? "" : "off";
      return o ? `<a class="mb ${cls}" href="?t=${t.id}">${t.num}. ${esc(t.title)}</a>` : `<span class="mb ${cls}">${t.num}. ${esc(t.title)}</span>`;
    }).join('<span class="arr">→</span>')
  }</div></div>`).join("");
}
function topicMap(cur){
  let n = 0;
  return `<div class="map">${T.map.map(s => `<div><div class="mtitle">${s.sec}</div><div class="midea">${s.idea}</div><div class="mblocks">${
    Array.from({length:s.n}, () => { const i=n++; const c = i<cur?"done":i===cur?"cur":""; return `<span class="mb ${c}">${i<cur?"✓ ":""}${i+1}. ${esc(T.blocks[i].title)}</span>`; }).join('<span class="arr">→</span>')
  }</div></div>`).join('<div class="down">↓</div>')}</div>`;
}
function bar(label){
  const d = Math.min(T.blocks.length, A.cur + (S.phase==="bridge"?1:0)), p = Math.round(100*d/T.blocks.length);
  return `<div class="bar"><div class="in"><span>${label}</span><div class="pbar"><i style="width:${p}%"></i></div><span>${d}/${T.blocks.length}</span></div></div>`;
}
const blk = i => (A.blocks[i] ||= { readSec:0, reachedEnd:false, variant:0, interrupts:0, blur:0 });
 
// ---------- екрани
function renderHome(){
  $("app").innerHTML = `<div class="card"><div class="hint">Ключове питання курсу</div><div class="tq">${esc(COURSE.question)}</div>
    <p class="hint">Оберіть відкриту тему (активні теми можна натиснути).</p>${courseMap(null)}</div>`;
}
function renderLogin(){
  const cfg = (SETTINGS.topics||{})[T.id] || {};
  const groups = (cfg.groups && cfg.groups.length ? cfg.groups : SETTINGS.groups) || [];
  $("htitle").textContent = `Тема ${T.num}. ${T.title}`;
  $("app").innerHTML = `<div class="card">
    <div class="hint">Ключове питання теми</div><div class="tq">${esc(T.question)}</div>
    ${topicMap(-1)}
    ${cfg.deadline ? `<div class="info">Тема відкрита до <b>${new Date(cfg.deadline).toLocaleString("uk-UA",{dateStyle:"long",timeStyle:"short"})}</b>. Проходити можна частинами: прогрес зберігається після кожного кроку.</div>` : ""}
    <h2 style="margin:18px 0 6px;font-size:18px">Як це працює</h2>
    <ol class="hint" style="padding-left:20px;margin:0">
      <li>Тема поділена на ${T.blocks.length} блоків, кожен відповідає на своє ключове питання.</li>
      <li>Читайте у своєму темпі — час читання фіксується.</li>
      <li>Після кнопки «Прочитав — до питань» текст блоку зникне.</li>
      <li>Якщо доведеться перерватися, закрийте сторінку. Потім увійдіть з <b>того самого пристрою і браузера</b> з тими самими групою і ПІБ і продовжуйте.</li>
    </ol>
    <label>Група</label><select id="grp"><option value="">— оберіть —</option>${groups.map(g=>`<option>${esc(g)}</option>`).join("")}</select>
    <label>Прізвище та ім'я</label><input type="text" id="nm" placeholder="Напр., Коваленко Олена" autocomplete="name">
    <div class="row" style="margin-top:16px"><span class="bad" id="regErr"></span><span class="sp"></span><button data-act="login">Почати / продовжити</button></div></div>`;
}
async function login(){
  const g=$("grp").value, n=$("nm").value.trim().replace(/\s+/g," ");
  const er=$("regErr");
  if(!g){ er.textContent="Оберіть групу."; return; }
  if(n.split(" ").length<2){ er.textContent="Введіть прізвище та ім'я."; return; }
  er.textContent="Зачекайте…";
  AID = st.attemptId(T.id, g, n);
  let server;
  try { server = await st.getAttempt(AID); } catch(e){ server = undefined; }
  if (server && server.__locked){ er.innerHTML="Цю тему ви вже почали на <b>іншому пристрої чи браузері</b>. Продовжіть там або попросіть викладача дозволити продовження тут."; return; }
  const loc = local.get(AID);
  if (server === undefined && !loc){ er.textContent="Немає зв'язку з сервером. Перевірте інтернет і спробуйте ще раз."; return; }
  // server === null: спроби на сервері немає (нова або скинута викладачем) — локальну копію не беремо
  if (server === null) A = null;
  else if (server === undefined) A = loc;
  else A = (loc && (loc.updatedAt||"") > (server.updatedAt||"")) ? loc : server;
  if (A && A.done){ er.textContent=""; renderDone(true); return; }
  if (!A) A = { uid:UID, topic:T.id, group:g, name:n, startedAt:new Date().toISOString(), cur:0, phase:"intro", blocks:{}, sessions:0, done:false,
    wordV: Math.floor(Math.random()*(T.game?T.game.words:1)), crossV: Math.floor(Math.random()*(T.cross?T.cross.length:1)) };
  A.uid = UID; A.sessions = (A.sessions||0)+1;
  // повернення після переривання
  if (A.phase === "quiz" && A.cur < T.blocks.length){
    const b = blk(A.cur); b.interrupts++; b.variant = 1; b.draft = "";
    A.phase = "intro"; A.resumeNote = true;
  } else if (A.phase === "final"){ A.finalInterrupts = (A.finalInterrupts||0)+1; }
  else if (A.phase === "read") A.phase = "intro";
  else if (A.phase === "bridge"){ A.cur++; A.phase = "intro"; }
  await save();
  er.textContent="";
  route();
}
function route(){
  if (A.cur < T.blocks.length) { renderIntro(); return; }
  if (A.phase==="word") renderWord(); else if (A.phase==="final") renderFinal(); else if (T.cross && !A.crossDone) renderCross(); else if (T.game && !A.wordDone) renderWord(); else renderFinal();
}
function renderIntro(){
  S.phase="intro"; A.phase="intro"; const B=T.blocks[A.cur], b=blk(A.cur);
  const note = A.resumeNote ? `<div class="info">Ви перервалися під час відповідей на питання цього блоку. Прочитайте блок ще раз — питання будуть <b>інші</b>.</div>` : (b.readSec>0 ? `<div class="info">Продовжуємо з блоку ${A.cur+1}.</div>` : "");
  A.resumeNote = false;
  $("app").innerHTML = bar("Блок "+(A.cur+1)) + `<div class="card">${note}
    ${A.cur===0?`<div class="hint">Ключове питання теми</div><div class="tq">${esc(T.question)}</div>${topicMap(0)}`:`<details class="mapd"><summary>Карта теми</summary>${topicMap(A.cur)}</details>`}
    <div class="keyq"><div class="hint">Ключове питання блоку ${A.cur+1}</div><b>${esc(B.key)}</b></div>
    <p class="hint" style="margin:10px 0 0">${esc(B.frm)}</p>
    <div class="row" style="margin-top:16px"><span class="hint">≈ ${Math.max(1,Math.round(B.words/150))} хв читання</span><span class="sp"></span><button data-act="read">Почати читання</button></div></div>`;
  toTop();
}
function flushRead(){ if(S.phase!=="read") return; const b=blk(A.cur); b.readSec += Math.round((Date.now()-S.readStart)/1000); S.readStart=Date.now(); }
function renderRead(){
  S.phase="read"; A.phase="read"; S.readStart=Date.now(); const B=T.blocks[A.cur];
  save();
  $("app").innerHTML = bar("Блок "+(A.cur+1)+": читання") + `<div class="card">
    <div class="hint">Блок ${A.cur+1} з ${T.blocks.length}</div>
    <h2 style="margin:4px 0;font-size:22px">${esc(B.title)}</h2>
    <div class="keyq" style="margin-bottom:16px"><b>${esc(B.key)}</b></div>
    <div class="lec">${B.html}</div>
    <div class="wm">${esc(A.name)} · ${esc(A.group)}</div>
    <div class="endbox" id="endbox"><div class="row"><span class="hint">Готові? Питання будуть без доступу до тексту.</span><span class="sp"></span><button data-act="openModal">Прочитав — до питань</button></div></div></div>`;
  document.querySelectorAll(".lec .gem").forEach(g => { g.textContent = (B.riddles||[])[A.wordV||0]||""; });
  document.querySelectorAll(".lec img[data-src]").forEach(i => { i.src = `topics/${T.id}/${i.dataset.src}`; i.parentElement.dataset.act="zoom"; });
  const ob = new IntersectionObserver(e => { if(e[0].isIntersecting){ blk(A.cur).reachedEnd=true; ob.disconnect(); } }); ob.observe($("endbox"));
  clearInterval(S.rid); S.rid = setInterval(()=>{ flushRead(); save(); }, CFG.readSaveEvery);
  toTop();
}
function renderQuiz(){
  $("modal").classList.remove("show"); clearInterval(S.rid); flushRead();
  const B=T.blocks[A.cur], b=blk(A.cur), V=B.variants[b.variant] || B.variants[0];
  S.phase="quiz"; A.phase="quiz"; S.blur=0; S.qStart=Date.now();
  const total = V.mcq.length*CFG.secPerMcq + CFG.secOpen; S.deadline = Date.now()+total*1000;
  b.quizStartedAt = new Date().toISOString(); save();
  $("app").innerHTML = bar("Блок "+(A.cur+1)+": питання") + `<div class="card">
    <div class="row"><h2 style="margin:0;font-size:18px">Блок ${A.cur+1}. ${esc(B.title)}: питання</h2><span class="sp"></span><span class="timer" id="tmr"></span></div>
    <p class="hint">Тексту блоку більше не видно. Відповідайте з пам'яті.</p>
    ${V.mcq.map((m,qi)=>`<div class="q"><h3>${qi+1}. ${esc(m.q)}</h3>${m.o.map((o,oi)=>`<label class="opt"><input type="radio" name="q${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join("")}</div>`).join("")}
    ${T.game?`<div class="q"><h3>✦ Буква для гри з цього блоку <span class="badge">гра</span></h3><p class="hint" style="margin:-4px 0 8px">Її загадка була в тексті. Якщо не пам'ятаєте — залиште порожнім.</p><input type="text" id="gemA" maxlength="1" autocomplete="off" style="width:70px;text-align:center;font-size:22px;text-transform:uppercase"></div>`:""}
    <div class="q"><h3>${V.mcq.length+1}. ${esc(V.open)}<span class="badge">відкрите, перевіряє викладач</span></h3>
      <textarea id="openA" placeholder="Ваша відповідь…"></textarea><div class="hint" id="cnt">0 слів</div></div>
    <div class="row"><span class="sp"></span><button data-act="submit">Надіслати відповіді блоку</button></div></div>`;
  $("openA").addEventListener("input", e => $("cnt").textContent = e.target.value.trim().split(/\s+/).filter(Boolean).length+" слів");
  clearInterval(S.tid); tick(); S.tid=setInterval(tick,500);
  clearInterval(S.did); S.did=setInterval(()=>{ const t=$("openA"); if(t){ blk(A.cur).draft=t.value; save(); } }, CFG.draftEvery);
  toTop();
  function tick(){ const ms=S.deadline-Date.now(), t=$("tmr"); if(!t) return;
    if(ms<=0){ clearInterval(S.tid); submit(true); return; }
    const s=Math.ceil(ms/1000); t.textContent="⏱ "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); t.classList.toggle("low", s<=60); }
}
function submit(auto){
  clearInterval(S.tid); clearInterval(S.did); unwarn();
  const B=T.blocks[A.cur], b=blk(A.cur), V=B.variants[b.variant]||B.variants[0];
  b.picks = V.mcq.map((m,qi)=>{ const r=document.querySelector(`input[name=q${qi}]:checked`); return r? +r.value : -1; });
  b.open = $("openA").value.trim(); delete b.draft;
  if ($("gemA")) b.letter = norm($("gemA").value);
  b.quizSec = Math.round((Date.now()-S.qStart)/1000); b.blur = (b.blur||0)+S.blur; b.auto=!!auto;
  b.submittedAt = new Date().toISOString();
  A.phase="bridge"; save(); renderBridge();
}
function renderBridge(){
  S.phase="bridge"; const B=T.blocks[A.cur], last=A.cur+1>=T.blocks.length;
  $("app").innerHTML = bar("Блок "+(A.cur+1)+": підсумок") + `<div class="card">
    <h2 style="margin-top:0;font-size:18px">Отже, блок ${A.cur+1}</h2>
    <p class="ok" style="margin:0 0 8px">✓ Відповіді збережено</p>
    <div class="keyq"><div class="hint">Відповідь на ключове питання: ${esc(B.key)}</div>${esc(B.sum)}</div>
    <p style="margin:14px 0 0"><b>Що далі і навіщо:</b> ${esc(B.nxt)}</p>
    ${last?"":`<div class="keyq"><div class="hint">Блок ${A.cur+2}. ${esc(T.blocks[A.cur+1].title)} · ≈ ${Math.max(1,Math.round(T.blocks[A.cur+1].words/150))} хв</div><b>${esc(T.blocks[A.cur+1].key)}</b></div>`}
    <details class="mapd"><summary>Карта теми</summary>${topicMap(A.cur+1)}</details>
    <div class="row" style="margin-top:16px"><span class="hint">Можна зробити перерву — прогрес збережено.</span><span class="sp"></span><button data-act="next">${last?"До підсумкового завдання":"Читати блок "+(A.cur+2)}</button></div></div>`;
  toTop();
}
function renderFinal(){
  S.phase="quiz"; A.phase="final"; S.blur=0; S.qStart=Date.now(); save();
  $("app").innerHTML = bar("Підсумкове завдання") + `<div class="card">
    <h2 style="margin-top:0;font-size:18px">Підсумкове завдання: зв'яжіть тему разом</h2>
    <p class="hint">Тут немає нового матеріалу — поєднайте все прочитане в одну картину.</p>
    <div class="keyq"><b>${esc(T.final)}</b></div>
    <textarea id="finA" placeholder="Опишіть послідовно: 1) … 2) … 3) …" style="margin-top:12px;min-height:180px">${esc(A.finalDraft||"")}</textarea>
    <div class="row" style="margin-top:14px"><span class="sp"></span><button data-act="finish">Завершити тему</button></div></div>`;
  clearInterval(S.did); S.did=setInterval(()=>{ const t=$("finA"); if(t){ A.finalDraft=t.value; save(); } }, CFG.draftEvery);
  toTop();
}
async function finish(){
  clearInterval(S.did);
  A.final=$("finA").value.trim(); delete A.finalDraft; A.finalBlur=(A.finalBlur||0)+S.blur;
  A.done=true; A.phase="done"; A.finishedAt=new Date().toISOString();
  await save(); renderDone(false);
}
function renderDone(already){
  S.phase="done";
  $("app").innerHTML = `<div class="card"><h2 style="margin-top:0">${already?"Цю тему ви вже пройшли":"Тему завершено!"}</h2>
    <p>${esc(A.name)} · ${esc(A.group)}</p>
    <p class="hint">Ваші відповіді збережено. Результат з'явиться після перевірки викладачем.</p>
    ${pending?'<p class="bad">Зв\'язку зараз немає — не закривайте сторінку, поки не зникне повідомлення внизу.</p>':""}
    <div class="row"><span class="sp"></span><a class="mb" href="./">До карти курсу</a></div></div>`;
}
 
 
// ---------- ігри: кросворд і кодове слово
const LAT = {A:"А",B:"В",C:"С",E:"Е",H:"Н",I:"І",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х",Y:"У"};
function norm(s){ return String(s||"").toUpperCase().replace(/[A-Z]/g, c=>LAT[c]||c).replace(/Ґ/g,"Г").replace(/[^А-ЯІЇЄЬ]/g,""); }
async function sha(s){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
let CX = null;
const bukv = n => { const d=n%10, h=n%100; return (d===1&&h!==11)?"буква":(d>=2&&d<=4&&(h<12||h>14))?"букви":"букв"; };
function renderCross(){
  S.phase="game"; A.phase="cross"; const X = T.cross[A.crossV||0]; const C = (A.cross ||= { cells:{}, ok:[], checks:0, sec:0 }); S.gStart=Date.now();
  const cells = {}; X.entries.forEach((e,ei)=>{ for(let i=0;i<e.len;i++){ const r=e.r+(e.d==="V"?i:0), c=e.c+(e.d==="H"?i:0); (cells[r+"_"+c] ||= {ents:[]}).ents.push(ei); if(i===0) cells[r+"_"+c].num=e.n; } });
  CX = { X, cells, dir:"H" };
  let g = `<div class="cw" style="grid-template-columns:repeat(${X.w},var(--cs))">`;
  for (let r=0;r<X.h;r++) for (let c=0;c<X.w;c++){ const k=r+"_"+c, cell=cells[k];
    g += cell ? `<div class="cc">${cell.num?`<span class="cn">${cell.num}</span>`:""}<input maxlength="1" data-k="${k}" value="${esc(C.cells[k]||"")}" autocomplete="off"></div>` : `<div class="ce"></div>`; }
  g += `</div>`;
  const list = d => X.entries.map((e,ei)=>({e,ei})).filter(x=>x.e.d===d).sort((a,b)=>a.e.n-b.e.n).map(({e,ei})=>`<li id="cl${ei}" class="${C.ok.includes(ei)?"ok":""}"><b>${e.n}.</b> ${esc(e.clue)} <span class="hint">(${e.len} ${bukv(e.len)})</span></li>`).join("");
  $("app").innerHTML = bar("Гра: кросворд") + `<div class="card">
    <h2 style="margin-top:0;font-size:18px">Кросворд за темою <span class="badge">гра</span></h2>
    <p class="hint">Згадайте терміни з усієї теми. Натисніть «Перевірити» — правильні слова стануть зеленими. Можна перевіряти кілька разів.</p>
    <div class="cwrap">${g}</div>
    <div class="clues"><div><h4>По горизонталі</h4><ol>${list("H")}</ol></div><div><h4>По вертикалі</h4><ol>${list("V")}</ol></div></div>
    <div class="row" style="margin-top:14px"><span class="hint" id="cxRes">${C.ok.length?`Розгадано ${C.ok.length} з ${X.entries.length}`:""}</span><span class="sp"></span>
      <button class="sec" data-act="crossCheck">Перевірити</button><button data-act="crossNext">Далі</button></div></div>`;
  paintCross();
  document.querySelectorAll(".cw input").forEach(inp=>{
    inp.addEventListener("focus", ()=>{ const ents=CX.cells[inp.dataset.k].ents; if(!ents.some(ei=>CX.X.entries[ei].d===CX.dir)) CX.dir = CX.X.entries[ents[0]].d; });
    inp.addEventListener("input", ()=>{ inp.value = norm(inp.value).slice(-1); C.cells[inp.dataset.k]=inp.value; if(inp.value) move(inp,1); });
    inp.addEventListener("keydown", e=>{ if(e.key==="Backspace" && !inp.value) move(inp,-1); });
    inp.addEventListener("dblclick", ()=>{ CX.dir = CX.dir==="H"?"V":"H"; });
  });
  clearInterval(S.did); S.did=setInterval(()=>save(), CFG.draftEvery);
  toTop();
}
function move(inp, s){ const [r,c]=inp.dataset.k.split("_").map(Number); const k = CX.dir==="H" ? r+"_"+(c+s) : (r+s)+"_"+c; const n=document.querySelector(`.cw input[data-k="${k}"]`); if(n) n.focus(); }
function paintCross(){ const C=A.cross; document.querySelectorAll(".cw input").forEach(i=>{ const ok=CX.cells[i.dataset.k].ents.some(ei=>C.ok.includes(ei)); i.classList.toggle("okc",ok); }); }
async function crossCheck(goNext){
  const C=A.cross, X=CX.X; C.checks++;
  for (const [ei,e] of X.entries.entries()){ let w=""; for(let i=0;i<e.len;i++){ const r=e.r+(e.d==="V"?i:0), c=e.c+(e.d==="H"?i:0); w += C.cells[r+"_"+c]||"?"; }
    if (!w.includes("?") && await sha(T.id+":"+w)===e.h){ if(!C.ok.includes(ei)) C.ok.push(ei); } }
  C.sec += Math.round((Date.now()-S.gStart)/1000); S.gStart=Date.now();
  C.ok.forEach(ei=>{ const l=$("cl"+ei); if(l) l.className="ok"; }); paintCross();
  $("cxRes").textContent = `Розгадано ${C.ok.length} з ${X.entries.length}`;
  if (goNext){ clearInterval(S.did); A.crossDone=true; A.phase = T.game ? "word" : "final"; await save(); route(); } else save();
}
function renderWord(){
  S.phase="game"; A.phase="word"; save(); const W=(A.word ||= { tries:0 });
  const letters = T.blocks.map((_,i)=> (A.blocks[i]&&A.blocks[i].letter) || "?");
  $("app").innerHTML = bar("Гра: кодове слово") + `<div class="card">
    <h2 style="margin-top:0;font-size:18px">Кодове слово <span class="badge">гра</span></h2>
    <p>У кожному блоці ви шукали букву ✦. Ось букви, які ви записали, у порядку блоків:</p>
    <div class="gemrow">${letters.map(l=>`<span class="${l==="?"?"miss":""}">${esc(l)}</span>`).join("")}</div>
    <p class="hint">Букви перемішані. Складіть із них термін із цієї теми (${T.blocks.length} букв). Якщо якоїсь букви бракує — спробуйте здогадатися.</p>
    <div class="row"><input type="text" id="wordA" value="${esc(W.answer||"")}" autocomplete="off" style="max-width:360px;text-transform:uppercase;font-size:20px;letter-spacing:2px"><button class="sec" data-act="wordCheck">Перевірити</button><span id="wRes">${W.ok?'<span class="ok">✓ Правильно!</span>':""}</span></div>
    <label>Що означає це слово і де воно траплялося в темі?</label>
    <textarea id="wordE" placeholder="Поясніть своїми словами…">${esc(W.expl||"")}</textarea>
    <div class="row" style="margin-top:14px"><span class="sp"></span><button data-act="wordNext">До підсумкового завдання</button></div></div>`;
  toTop();
}
async function wordCheck(){
  const W=A.word, a=norm($("wordA").value); W.answer=a; W.tries++;
  W.ok = (await sha(T.id+":word:"+a)) === T.game.hashes[A.wordV||0];
  $("wRes").innerHTML = W.ok ? '<span class="ok">✓ Правильно!</span>' : '<span class="bad">Ні, спробуйте ще</span>'; save();
}
async function wordNext(){
  const W=A.word; W.expl=$("wordE").value.trim(); const a=norm($("wordA").value);
  if (a && a!==W.answer){ W.answer=a; W.tries++; W.ok = (await sha(T.id+":word:"+a)) === T.game.hashes[A.wordV||0]; }
  A.wordDone=true; A.phase="final"; await save(); renderFinal();
}
 
// ---------- дії та захист
const ACT = {
  login, read: renderRead, openModal: ()=>$("modal").classList.add("show"), closeModal: ()=>$("modal").classList.remove("show"),
  toQuiz: renderQuiz, submit: ()=>submit(false), finish,
  next: ()=>{ A.cur++; if (A.cur<T.blocks.length) renderRead(); else { A.phase="cross"; save(); route(); } },
  crossCheck: ()=>crossCheck(false), crossNext: ()=>crossCheck(true), wordCheck, wordNext,
  zoom: el => { $("lbimg").src = el.querySelector("img").src; $("lb").classList.add("show"); }
};
document.addEventListener("click", e => {
  if (e.target.closest("#lb")) { $("lb").classList.remove("show"); return; }
  const b = e.target.closest("[data-act]"); if(!b) return; e.preventDefault(); ACT[b.dataset.act](b);
});
document.addEventListener("keydown", e => {
  if (e.key==="Enter" && e.target.id==="nm") login();
  if (e.key==="Escape") $("lb").classList.remove("show");
  if ((e.ctrlKey||e.metaKey) && ["c","x","p","s","u","a"].includes(e.key.toLowerCase()) && e.target.tagName!=="TEXTAREA") e.preventDefault();
});
let lastAway=0;
function away(){ if(S.phase!=="quiz") return; if(Date.now()-lastAway<1500) return; lastAway=Date.now(); S.blur++;
  warn(`⚠ Ви залишали сторінку під час відповіді (${S.blur} раз). Це фіксується для викладача.`); }
document.addEventListener("visibilitychange", ()=>{ if(document.hidden){ away(); if(S.phase==="read"){ flushRead(); save(); } } });
window.addEventListener("blur", away);
document.addEventListener("contextmenu", e => e.preventDefault());
["copy","cut","dragstart"].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
["paste","drop"].forEach(ev => document.addEventListener(ev, e => { if(S.phase==="quiz") e.preventDefault(); }));
 
// ---------- старт
(async function(){
  if (st.DEMO) $("demo").innerHTML = '<span class="demo">Демо-режим: Firebase ще не підключено, дані зберігаються лише в цьому браузері</span>';
  try {
    [COURSE, SETTINGS, UID] = await Promise.all([ fetch("course.json").then(r=>r.json()), st.getSettings(), st.studentInit() ]);
  } catch(e){ $("app").innerHTML = `<div class="card bad">Не вдалося завантажити сайт. Перевірте інтернет і оновіть сторінку.</div>`; return; }
  const tid = params.get("t");
  if (!tid){ renderHome(); return; }
  const cfg = (SETTINGS.topics||{})[tid];
  if (!cfg || !cfg.open){ $("app").innerHTML = `<div class="card"><h2 style="margin-top:0">Тема зараз закрита</h2><p class="hint">Її відкриє викладач.</p><a class="mb" href="./">До карти курсу</a></div>`; return; }
  if (cfg.deadline && new Date(cfg.deadline) < new Date()){ $("app").innerHTML = `<div class="card"><h2 style="margin-top:0">Термін проходження теми минув</h2><p class="hint">Зверніться до викладача.</p></div>`; return; }
  try { T = await fetch(`topics/${tid}/topic.json`).then(r=>r.json()); } catch(e){ $("app").innerHTML = `<div class="card bad">Тему не знайдено.</div>`; return; }
  renderLogin();
})();
 
