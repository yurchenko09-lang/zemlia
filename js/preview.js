import * as st from "./store.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const tid = new URLSearchParams(location.search).get("t");
let T, K = null;

function bar(){
  const s = K ? `<b style="color:#2e6b1f">Правильні відповіді позначено ✓</b>` :
    `<span class="hint">Правильні відповіді не показано. Увійдіть як викладач або відкрийте файл ключів цієї теми:</span>
     <button class="sm" id="gin">Увійти через Google</button> <input type="file" id="kf" accept=".json">`;
  $("bar").innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px">${s}<span class="sp"></span><button class="sm sec" onclick="print()">Друк / PDF</button></div>`;
  if (!K){
    $("gin").onclick = async () => { try { await st.teacherSignIn(); await loadKeys(); } catch(e){ warn(e.message||e); } };
    $("kf").onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); if (d.topic && d.topic!==tid) throw new Error("Це ключі іншої теми: "+d.topic); K = { keys:d.keys, gems:d.gems, words:d.words }; render(); } catch(err){ warn(err.message||err); } };
  }
}
function warn(m){ const a=$("alert"); a.innerHTML=esc(m); a.classList.add("show"); setTimeout(()=>a.classList.remove("show"),6000); }
async function loadKeys(){
  try { if (await st.teacherCurrent()) { const k = await st.getKeys(tid); if (k) K = k; else warn("Ключі цієї теми ще не завантажено в кабінет — можна відкрити файл."); } } catch(e){}
  render();
}
function qs(list, keys){
  return list.map((q,i)=>`<div class="pv-q"><b>${i+1}. ${esc(q.q)}</b><ol type="a">${q.o.map((o,j)=>`<li class="${keys && keys[i]===j?'ok':''}">${esc(o)}</li>`).join("")}</ol></div>`).join("");
}
function render(){
  $("ttl").textContent = `Тема ${T.num}. ${T.title}`;
  bar();
  const toc = T.blocks.map((b,i)=>`<a href="#b${i}">${i+1}. ${esc(b.title)}</a>`).join("");
  const map = (T.map||[]).map(m=>`<li><b>${esc(m.sec)}</b> (${m.n} бл.) — ${esc(m.idea)}</li>`).join("");
  let h = `<div class="card"><p><b>Головне питання:</b> ${esc(T.question)}</p><ul>${map}</ul><div class="toc noprint">${toc}</div></div>`;
  T.blocks.forEach((b,i)=>{
    let html = b.html.replace(/<span class="gem"><\/span>/g, `<span class="gem">[тут загадка для гри]</span>`)
                     .replace(/<img data-src="([^"]+)"([^>]*)><figcaption>/g, (m,src,rest)=>`<img src="${T.__base}${src}"${rest}><figcaption><span class="pv-tag">файл: ${T.__base}${src}</span> `);
    const vars = (b.variants||[]).map((v,vi)=>`<div class="pv-box"><h4 style="margin:0 0 6px">${vi===0?"Основний варіант":"Резервний варіант"}</h4>${qs(v.mcq, K && K.keys[i] && K.keys[i][vi])}<p><b>Відкрите:</b> ${esc(v.open)}</p></div>`).join("");
    const rid = (b.riddles||[]).map((r,wi)=>`<div class="pv-r"><span class="pv-tag">слово ${wi+1}${K&&K.gems?` · ${esc(K.gems[i][wi])}`:""}</span>${esc(r.replace(/^✦ Буква для гри — /,""))}</div>`).join("");
    h += `<div class="card pv-b" id="b${i}"><p class="hint">Блок ${i+1} з ${T.blocks.length} · ≈${esc(b.words)} слів</p><h2 style="margin-top:0">${esc(b.title)}</h2>
      <p><b>Ключове питання:</b> ${esc(b.key)}</p><p class="hint"><i>${esc(b.frm)}</i></p>
      <div class="lec">${html}</div>
      <div class="pv-box" style="margin:12px 0"><b>Підсумок:</b> ${esc(b.sum)}<br><span class="hint">Далі: ${esc(b.nxt)}</span></div>
      <h3>Питання</h3><div class="pv-var">${vars}</div>
      <details style="margin-top:10px"><summary><b>Загадки для гри (10 варіантів слова)</b></summary>${rid}</details></div>`;
  });
  if (T.final) h += `<div class="card pv-b"><h2 style="margin-top:0">Підсумкове завдання</h2><p>${esc(T.final)}</p></div>`;
  if (K && K.words) h += `<div class="card"><h3 style="margin-top:0">Кодові слова</h3><p>${K.words.map((w,i)=>`${i+1}. <b>${esc(Array.isArray(w)?w[0]:w)}</b>`).join(" &nbsp; ")}</p></div>`;
  (T.cross||[]).forEach((c,ci)=>{
    h += `<div class="card"><h3 style="margin-top:0">Кросворд, варіант ${ci+1}</h3><ol>${c.entries.slice().sort((a,b)=>a.n-b.n||a.d.localeCompare(b.d)).map(e=>`<li value="${e.n}">${e.d==="H"?"→":"↓"} ${esc(e.clue)} (${e.len})</li>`).join("")}</ol></div>`;
  });
  $("app").innerHTML = h;
}
(async ()=>{
  if (!tid){ $("app").innerHTML = `<div class="card bad">Не вказано тему (?t=t17).</div>`; return; }
  try { T = await st.loadTopic(tid); } catch(e){ $("app").innerHTML = `<div class="card bad">Тему не знайдено.</div>`; return; }
  render(); loadKeys();
})();
