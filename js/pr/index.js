// Перелік практичних робіт сайту. Щоб додати нову: створіть js/pr/prNN.js за зразком pr05.js і додайте рядок сюди.
export const PRACTICALS = [
  { id: "pr05", num: 5, title: "Зміна атмосферного тиску з висотою. Вимірювання висоти" },
  { id: "pr07", num: 7, title: "Вимірювання вологості та атмосферного тиску повітря" }
];
export const loadPractical = id => import(`./${id}.js`).then(m => m.default);
