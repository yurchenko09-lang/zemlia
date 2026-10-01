// Сховище: Firebase (робочий режим) або localStorage (демо-режим)
import { firebaseConfig, TEACHER_EMAIL } from "./firebase-config.js";
export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey === "ВСТАВТЕ";
const V = "10.12.2";
let fb = null;
async function F(){
  if (fb) return fb;
  const app = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const auth = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const a = app.initializeApp(firebaseConfig);
  fb = { auth, fs, A: auth.getAuth(a), D: fs.getFirestore(a) };
  return fb;
}
// ---- демо-сховище
const LS = {
  get(k){ try{ return JSON.parse(localStorage.getItem("demo:"+k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem("demo:"+k, JSON.stringify(v)); }catch(e){} },
  keys(p){ const r=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.startsWith("demo:"+p)) r.push(k.slice(5)); } }catch(e){} return r; },
  del(k){ try{ localStorage.removeItem("demo:"+k); }catch(e){} }
};
const DEMO_SETTINGS = { groups:["Група А (демо)","Група Б (демо)"], topics:{ t09:{ open:true, groups:["Група А (демо)","Група Б (демо)"], deadline:"" } } };

export function attemptId(topic, group, name){
  const norm = s => s.toLowerCase().replace(/[’'`ʼ]/g,"").replace(/\s+/g," ").trim().replace(/[^a-zа-яіїєґ0-9 ]/gi,"").replace(/ /g,"_");
  return `${topic}__${norm(group)}__${norm(name)}`;
}
// ---- студент
export async function studentInit(){
  if (DEMO) return "demo-uid";
  const f = await F();
  await f.A.authStateReady();
  if (!f.A.currentUser) await f.auth.signInAnonymously(f.A);
  return f.A.currentUser.uid;
}
export async function getSettings(){
  if (DEMO) return LS.get("settings") || DEMO_SETTINGS;
  const f = await F(); const s = await f.fs.getDoc(f.fs.doc(f.D,"config","settings"));
  return s.exists() ? s.data() : { groups:[], topics:{} };
}
export async function getAttempt(id){
  if (DEMO) return LS.get("att:"+id);
  const f = await F();
  try { const s = await f.fs.getDoc(f.fs.doc(f.D,"attempts",id)); return s.exists() ? s.data() : null; }
  catch(e){ if (String(e.code||e).includes("permission")) return { __locked:true }; throw e; }
}
export async function saveAttempt(id, data){
  data.updatedAt = new Date().toISOString();
  if (DEMO) { LS.set("att:"+id, data); return; }
  const f = await F(); await f.fs.setDoc(f.fs.doc(f.D,"attempts",id), JSON.parse(JSON.stringify(data)));
}
// ---- викладач
export async function teacherCurrent(){
  if (DEMO) return { email:"demo" };
  const f = await F(); await f.A.authStateReady();
  const u = f.A.currentUser;
  return (u && !u.isAnonymous && u.email === TEACHER_EMAIL) ? u : null;
}
export async function teacherSignIn(){
  if (DEMO) return { email:"demo" };
  const f = await F(); const p = new f.auth.GoogleAuthProvider();
  await f.auth.setPersistence(f.A, f.auth.browserLocalPersistence);
  const r = await f.auth.signInWithPopup(f.A, p);
  if (r.user.email !== TEACHER_EMAIL) throw new Error("Ця пошта не має прав викладача: "+r.user.email);
  return r.user;
}
export async function saveSettings(s){
  if (DEMO) { LS.set("settings", s); return; }
  const f = await F(); await f.fs.setDoc(f.fs.doc(f.D,"config","settings"), s);
}
export async function listAttempts(topic){
  if (DEMO) return LS.keys("att:"+topic+"__").map(k=>({ id:k.slice(4), ...LS.get(k) }));
  const f = await F();
  const q = f.fs.query(f.fs.collection(f.D,"attempts"), f.fs.where("topic","==",topic));
  const s = await f.fs.getDocs(q); return s.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function updateAttempt(id, patch){
  if (DEMO) { const a=LS.get("att:"+id)||{}; LS.set("att:"+id,{...a,...patch}); return; }
  const f = await F(); await f.fs.updateDoc(f.fs.doc(f.D,"attempts",id), patch);
}
export async function deleteAttempt(id){
  if (DEMO) { LS.del("att:"+id); return; }
  const f = await F(); await f.fs.deleteDoc(f.fs.doc(f.D,"attempts",id));
}
export async function getKeys(topic){
  if (DEMO) { const k=LS.get("keys:"+topic); return k? { keys:k.keys, gems:k.gems||null } : null; }
  const f = await F(); const s = await f.fs.getDoc(f.fs.doc(f.D,"keys",topic)); if(!s.exists()) return null; const d=JSON.parse(s.data().keys); return Array.isArray(d)? {keys:d, gems:null} : d;
}
export async function saveKeys(topic, k){
  if (DEMO) { LS.set("keys:"+topic, k); return; }
  const f = await F(); await f.fs.setDoc(f.fs.doc(f.D,"keys",topic), { keys: JSON.stringify({ keys:k.keys, gems:k.gems||null }) });
}

// ---- завантаження теми (основний шлях topics/tXX/, запасний — tXX/ у корені репозиторію)
export async function loadTopic(id){
  for (const base of [`topics/${id}/`, `${id}/`]) {
    try { const r = await fetch(base + "topic.json", { cache: "no-cache" }); if (r.ok) { const t = await r.json(); t.__base = base; return t; } } catch(e){}
  }
  throw new Error("Тему не знайдено: " + id);
}
