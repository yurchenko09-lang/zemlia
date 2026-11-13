// Спільне для практичних робіт: генератор випадкових чисел із зерном, перевірка відповідей, оцінювання.
// Цей файл використовують і сторінка студента, і кабінет викладача — тому оцінка в кабінеті
// перераховується з журналу дій студента за тими самими правилами.

// ---- випадкові числа: однакове зерно → однакові задачі (у студента і в кабінеті)
function hash(str){ let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }; }
export function rng(seed){
  let a = hash(String(seed))();
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo, hi, step = 1) => lo + step * Math.floor(next() * (Math.floor((hi - lo) / step) + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)]
  };
}

// ---- числа
export const num = s => {
  const t = String(s ?? "").replace(/\s+/g, "").replace(",", ".").replace(/[^0-9.+−-]/g, "").replace("−", "-");
  if (!/^[-+]?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};
export const fmtN = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("uk-UA", { maximumFractionDigits: d }).replace(/ /g, " ");

// перевірка одного поля: число з допуском або вибір
export function checkField(f, raw){
  if (f.type === "choice") return String(raw) === String(f.answer);
  const v = num(raw);
  return Number.isFinite(v) && Math.abs(v - f.answer) <= (f.tol ?? 0.5) + 1e-9;
}

// ---- оцінювання (однакове на сторінці студента і в кабінеті)
export const AWAY_LIMIT = 5;   // с поза сторінкою під час задачі, після яких задача анулюється
export const ANNUL_MAX = 2;    // скільки разів анулюємо; далі — задача 0 балів
export const RULES = {
  wrong: 0.25,      // за кожну неправильну спробу (враховуються перші 3)
  hint1: 0.25,      // підказка «з чого почати»
  hint2: 0.35,      // підказка «формула з числами» (додатково)
  ai: 0.15,         // кожне запитання до ШІ (враховуються перші 2)
  floor: 0.10,      // якщо зрештою розв'язано самостійно — не менше 10 %
  twin: 0.3         // аналогічна задача після показаного розв'язку — максимум 30 %
};
export function taskStats(t){
  const log = t.log || [];
  const s = { wrong: 0, hint1: false, hint2: false, ai: 0, sol: false, ok: false, zero: false };
  for (const e of log) {
    if (s.ok) break;
    if (e.type === "try") { if (e.ok) s.ok = true; else s.wrong++; }
    else if (e.type === "hint") { if (e.lvl >= 1) s.hint1 = true; if (e.lvl >= 2) s.hint2 = true; }
    else if (e.type === "ai") s.ai++;
    else if (e.type === "sol") s.sol = true;
    else if (e.type === "zero") s.zero = true;          // не зараховано через повторний вихід зі сторінки
  }
  return s;
}
export function creditOf(t){
  const s = taskStats(t), max = t.twin ? Math.min(t.max ?? RULES.twin, RULES.twin) : (t.max ?? 1);
  if (t.annulled || s.zero || !s.ok || s.sol) return 0;
  let c = 1 - RULES.wrong * Math.min(s.wrong, 3) - (s.hint1 ? RULES.hint1 : 0) - (s.hint2 ? RULES.hint2 : 0) - RULES.ai * Math.min(s.ai, 2);
  return max * Math.max(RULES.floor, c);
}
// підсумок: 12 × (сума балів за задачі) / (кількість основних задач)
export function gradeOf(att, nSlots){
  const tasks = att.tasks || [];
  const n = nSlots || tasks.filter(t => !t.twin && !t.annulled).length || 1;
  const sum = tasks.reduce((a, t) => a + creditOf(t), 0);
  return { points: Math.round(12 * sum / n * 10) / 10, grade: Math.round(12 * sum / n), sum, n };
}
export function summaryOf(att){
  const tasks = (att.tasks || []).filter(t => !t.annulled);
  const st = tasks.map(taskStats);
  return {
    solved: st.filter(s => s.ok && !s.sol).length,
    firstTry: st.filter((s, i) => !tasks[i].twin && s.ok && !s.sol && s.wrong === 0 && !s.hint1 && !s.ai).length,
    wrong: st.reduce((a, s) => a + s.wrong, 0),
    hints: st.reduce((a, s) => a + (s.hint1 ? 1 : 0) + (s.hint2 ? 1 : 0), 0),
    ai: st.reduce((a, s) => a + s.ai, 0),
    sol: st.filter(s => s.sol).length,
    annulled: (att.tasks || []).filter(t => t.annulled).length,
    zero: st.filter(s => s.zero).length
  };
}

// задачі студента: з модуля практичної і зерна
export function buildTask(P, key, seed, variant = 0){
  const T = P.tasks.find(x => x.key === key);
  const p = T.gen(rng(`${seed}|${key}|${variant}`));
  return { T, p, fields: T.fields(p) };
}
