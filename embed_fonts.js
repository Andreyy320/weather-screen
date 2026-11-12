// Встраивает шрифты SF Pro прямо в HTML (base64) -> получается ОДИН файл,
// который работает где угодно: на баннере, в браузере, без папки fonts.
//
// Запуск (Node у тебя уже есть):
//   1) положи этот файл рядом с index.html
//   2) в этой папке:   node embed_fonts.js
//   3) используй получившийся  index.embedded.html
//
// Файлы шрифтов ищутся в: ./fonts, в папке скрипта и (если указать) в своей папке:
//   node embed_fonts.js "C:\Users\ТЫ\Downloads\SF-Pro"

const fs = require("fs");
const path = require("path");

const dir = __dirname;
const src = path.join(dir, "index.html");
const out = path.join(dir, "index.embedded.html");
const extra = process.argv[2];

const roots = [path.join(dir, "fonts"), dir];
if (extra) roots.unshift(extra);

function walk(d, depth) {
  let res = [];
  if (depth < 0 || !fs.existsSync(d)) return res;
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    let st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) res = res.concat(walk(p, depth - 1));
    else res.push(p);
  }
  return res;
}

const all = [].concat(...roots.map(r => walk(r, 3)));

function find(name) {
  const low = name.toLowerCase();
  return all.find(p => path.basename(p).toLowerCase() === low);
}

let html = fs.readFileSync(src, "utf8");
let missing = [];

// убираем local(...) — чтобы гарантированно использовались ТВОИ файлы
html = html.replace(/local\("[^"]*"\),\s*/g, "");

html = html.replace(/url\("fonts\/([^"]+)"\)\s*format\("opentype"\)/g, (m, name) => {
  const f = find(name);
  if (!f) { missing.push(name); return m; }
  const b64 = fs.readFileSync(f).toString("base64");
  console.log("OK  ", name, "(" + Math.round(b64.length / 1024) + " KB)");
  return 'url(data:font/otf;base64,' + b64 + ') format("opentype")';
});

if (missing.length) {
  console.log("\nНЕ НАЙДЕНЫ файлы:\n  " + missing.join("\n  "));
  console.log('\nУкажи папку с ними:  node embed_fonts.js "C:\\путь\\к\\шрифтам"');
  process.exit(1);
}

fs.writeFileSync(out, html);
console.log("\nГотово ->", out);