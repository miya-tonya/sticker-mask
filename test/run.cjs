// End-to-end checks against demo/index.html in a mobile-sized Chromium (Playwright).
// Serves the repo over HTTP with an in-memory fake of the four manager endpoints.
//   npm i -D playwright && npx playwright install chromium && npm test
// Set PLAYWRIGHT_CHANNEL=msedge (or chrome) to use an installed browser instead.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const shots = path.join(__dirname, "shots");
fs.mkdirSync(shots, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };

// fake manager API: same contract as server/express-router.js
let cats = ["Tape", "Star"];
let items = [
  { src: "stickers/tape-pink.webp", cat: "Tape" },
  { src: "stickers/tape-blue.webp", cat: "Tape" },
  { src: "stickers/star-pink.webp", cat: "Star" },
  { src: "stickers/star-blue.webp", cat: "Star" },
];
const reply = () => ({ ok: true, cats: cats.slice(), items: items.map((x) => ({ ...x })) });
const api = (p, body) => {
  if (p === "/api/stickers/update") { const it = items.find((x) => x.src === body.src); if (!it) return { error: "not in list" }; if (body.hidden !== undefined) { if (body.hidden) it.hidden = true; else delete it.hidden; } if (body.cat !== undefined) { if (body.cat) it.cat = body.cat; else delete it.cat; } return reply(); }
  if (p === "/api/stickers/delete") { items = items.filter((x) => x.src !== body.src); return reply(); }
  if (p === "/api/stickers/cats") { if (body.add) cats.push(body.add); if (body.remove) { cats = cats.filter((c) => c !== body.remove); items.forEach((x) => { if (x.cat === body.remove) delete x.cat; }); } return reply(); }
  return { error: "unknown" };
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.startsWith("/api/")) {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (_) {} res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(api(p, body))); });
    return;
  }
  if (p === "/demo/stickers/list.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(reply())); return; }
  const f = path.join(root, p);
  if (p.includes("..") || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", mime[path.extname(f)] || "application/octet-stream");
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
  const errors = [];
  const want = (ok, msg) => { console.log((ok ? "ok  " : "FAIL") + " " + msg); if (!ok) errors.push(msg); };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { errors.push("pageerror " + e); console.log("pageerror", String(e)); });
  await page.goto(origin + "/demo/index.html?api=1", { waitUntil: "load" });
  await page.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const box = async (id) => { const b = await page.locator('.sm-sticker[data-sm-id="' + id + '"]').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; };
  const dims = (id) => page.evaluate((id) => { const e = document.querySelector('.sm-sticker[data-sm-id="' + id + '"]'); return { w: parseFloat(e.style.width), h: parseFloat(e.style.height), r: parseFloat((e.style.transform.match(/rotate\(([-\d.]+)rad\)/) || [0, "0"])[1]) }; }, id);
  const dragTo = async (id, x, y) => { const b = await box(id); await touch("touchStart", [{ x: b.x, y: b.y }]); for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: b.x + (x - b.x) * i / 10, y: b.y + (y - b.y) * i / 10 }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(120); };
  const st = () => page.evaluate(() => ({ editing: document.getElementById("app").classList.contains("sm-editing"), side: !!document.querySelector(".sm-side") && !document.querySelector(".sm-side").hidden, pal: document.querySelectorAll(".sm-pal-item").length, n: document.querySelectorAll(".sm-sticker").length, selected: document.querySelectorAll(".sm-sticker.sm-selected").length }));

  // enter
  await page.evaluate(() => document.getElementById("maskBtn").click()); await page.waitForTimeout(400);
  let s = await st(); want(s.editing && s.side && s.pal === 4, "enter: side column with 4 stickers " + JSON.stringify(s));
  const sideBox = await page.locator(".sm-side").boundingBox();
  const tb = await page.locator(".topbar").boundingBox(), cb = await page.locator(".composer").boundingBox();
  want(sideBox.y >= tb.y + tb.height && sideBox.y + sideBox.height <= cb.y && sideBox.x > 300, "side column sits between header and composer");
  want(await page.evaluate(() => { const b = document.querySelectorAll(".sm-side-actions .sm-btn"); return b.length === 3 && b[0].classList.contains("sm-settings") && b[1].textContent === "Name" && b[2].textContent === "完成"; }), "actions: gear / extra button / Done");
  await page.screenshot({ path: path.join(shots, "1-enter.png") });

  // place + drag
  await page.evaluate(() => document.querySelectorAll(".sm-pal-item")[2].click()); await page.waitForTimeout(200);
  s = await st(); want(s.n === 1 && s.selected === 1, "placed one sticker, selected");
  await dragTo(1, 150, 300);
  let b = await box(1); want(Math.abs(b.x - 150) < 6 && Math.abs(b.y - 300) < 6, "drag to (150,300): " + [b.x | 0, b.y | 0]);
  // unselected sticker: a swipe that starts on it scrolls the page instead of moving it; a tap selects it
  await page.touchscreen.tap(300, 700); await page.waitForTimeout(150);
  want((await st()).selected === 0 && await page.evaluate(() => getComputedStyle(document.querySelector(".sm-sticker")).touchAction === "pan-y"), "deselected sticker has touch-action pan-y");
  { const sc0 = await page.evaluate(() => document.getElementById("messages").scrollTop); const bb = await box(1);
    await touch("touchStart", [{ x: bb.x, y: bb.y }]); for (let i = 1; i <= 8; i++) { await touch("touchMove", [{ x: bb.x, y: bb.y - 12 * i }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(300);
    const sc1 = await page.evaluate(() => document.getElementById("messages").scrollTop); const bb2 = await box(1);
    // (synthetic touches don't scroll headless Chromium, so: the sticker must not follow the finger, nor get selected / held)
    want(Math.abs((bb2.y + sc1) - (bb.y + sc0)) < 3 && (await st()).selected === 0 && !(await page.evaluate(() => document.querySelector(".sm-sticker.sm-held"))), "swipe on an unselected sticker does not move or select it Δscroll=" + (sc1 - sc0));
    await page.evaluate((v) => { document.getElementById("messages").scrollTop = v; }, sc0); await page.waitForTimeout(100); }
  b = await box(1); await touch("touchStart", [{ x: b.x, y: b.y }]); await page.waitForTimeout(60); await touch("touchEnd", []); await page.waitForTimeout(300);
  want((await st()).selected === 1 && await page.evaluate(() => getComputedStyle(document.querySelector(".sm-sticker")).touchAction === "none"), "tap selects it again (touch-action none while selected)");
  want(await page.evaluate(() => document.querySelector(".sm-sticker").parentNode.classList.contains("sm-layer-content")), "released on content → content layer");
  // scroll follows
  const y0 = (await box(1)).y;
  await page.evaluate(() => { document.getElementById("messages").scrollTop += 60; }); await page.waitForTimeout(100);
  want(Math.abs((await box(1)).y - (y0 - 60)) < 2, "sticker scrolls with content");
  await page.evaluate(() => { document.getElementById("messages").scrollTop -= 60; }); await page.waitForTimeout(100);

  // pinch inside → bigger
  const d0 = await dims(1);
  b = await box(1);
  await touch("touchStart", [{ x: b.x, y: b.y }]); await page.waitForTimeout(30);
  await touch("touchStart", [{ x: b.x, y: b.y }, { x: b.x + 40, y: b.y + 40 }]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: b.x - 4 * i, y: b.y - 4 * i }, { x: b.x + 40 + 8 * i, y: b.y + 40 + 8 * i }]); await page.waitForTimeout(16); }
  await touch("touchEnd", [{ x: b.x - 40, y: b.y - 40 }]); await touch("touchEnd", []); await page.waitForTimeout(150);
  const d1 = await dims(1); want(d1.w > d0.w * 1.4 && Math.abs(d1.w / d1.h - d0.w / d0.h) < 0.01, "pinch inside scales proportionally " + d0.w.toFixed(0) + "→" + d1.w.toFixed(0));

  // handles present and sized
  want(await page.evaluate(() => { const h = document.querySelector(".sm-selected .sm-handle"), d = document.querySelector(".sm-selected .sm-del"), x = document.querySelector(".sm-selected .sm-stretch-x"), y = document.querySelector(".sm-selected .sm-stretch-y"); return h.offsetWidth === 18 && d.offsetWidth === 18 && x.offsetWidth === 5 && x.offsetHeight === 16 && y.offsetWidth === 16 && y.offsetHeight === 5; }), "handles: 18px corner/×, 5×16 edge pills");
  // stretch width only
  await dragTo(1, 120, 420);
  const sx = await page.locator(".sm-selected .sm-stretch-x").boundingBox();
  const d2 = await dims(1);
  const hx = sx.x + sx.width / 2, hy = sx.y + sx.height / 2;
  await touch("touchStart", [{ x: hx, y: hy }]); for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: hx + 5 * i, y: hy }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(150);
  const d3 = await dims(1); want(Math.abs((d3.w - d2.w) - 50 * Math.cos(d2.r)) < 3 && Math.abs(d3.h - d2.h) < 0.5, "edge pill stretches width only " + d2.w.toFixed(0) + "→" + d3.w.toFixed(0));
  // corner handle rotates
  const hb = await page.locator(".sm-selected .sm-handle").boundingBox(); const c = await box(1);
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  const tx = c.x + (cx - c.x) * 1.3 + 30, ty = c.y + (cy - c.y) * 0.6;
  await touch("touchStart", [{ x: cx, y: cy }]); for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: cx + (tx - cx) * i / 10, y: cy + (ty - cy) * i / 10 }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(150);
  const d4 = await dims(1); want(Math.abs(d4.r - d3.r) > 0.05 && Math.abs(d4.w - d3.w) > 5, "corner handle rotates + scales rot=" + d4.r.toFixed(2));

  // free drag (one finger on empty space while selected) + tap deselect
  want(await page.evaluate(() => getComputedStyle(document.getElementById("messages")).touchAction === "none"), "scroller touch-action none while a sticker is selected");
  const before = await box(1);
  const free = await page.evaluate(() => { const e = document.elementFromPoint(40, 700); return !!e && !e.closest(".sm-sticker") && !!e.closest("#messages"); });
  want(free, "free-drag start point is on empty content");
  await touch("touchStart", [{ x: 40, y: 700 }]); for (let i = 1; i <= 8; i++) { await touch("touchMove", [{ x: 40, y: 700 - 10 * i }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(300);
  const after = await box(1); want(Math.abs((after.y - before.y) + 70) < 3 && (await st()).selected === 1, "one-finger drag on empty space moves the selected sticker Δy=" + (after.y - before.y).toFixed(0));
  await page.touchscreen.tap(300, 700); await page.waitForTimeout(150);
  want((await st()).selected === 0, "tap on empty space deselects");
  want(await page.evaluate(() => getComputedStyle(document.getElementById("messages")).touchAction === "pan-y"), "scroller back to pan-y when nothing is selected");
  // reselect, pinch outside shrinks to the minimum (a third of the base width)
  b = await box(1); await touch("touchStart", [{ x: b.x, y: b.y }]); await page.waitForTimeout(60); await touch("touchEnd", []); await page.waitForTimeout(300);
  // the sticker is ~430px wide by now; two hard pinches outside it get it to the floor
  const pinchIn = async () => {
    await touch("touchStart", [{ x: 20, y: 700 }]); await page.waitForTimeout(30);
    await touch("touchStart", [{ x: 20, y: 700 }, { x: 220, y: 760 }]);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: 20 + 9 * i, y: 700 + 2.5 * i }, { x: 220 - 9 * i, y: 760 - 2.5 * i }]); await page.waitForTimeout(16); }
    await touch("touchEnd", [{ x: 110, y: 725 }]); await touch("touchEnd", []); await page.waitForTimeout(300);
  };
  const pinchOut = async () => {
    await touch("touchStart", [{ x: 30, y: 700 }]); await page.waitForTimeout(30);
    await touch("touchStart", [{ x: 30, y: 700 }, { x: 90, y: 730 }]);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: 30 - 2 * i, y: 700 - 2 * i }, { x: 90 + 12 * i, y: 730 + 2 * i }]); await page.waitForTimeout(16); }
    await touch("touchEnd", [{ x: 10, y: 680 }]); await touch("touchEnd", []); await page.waitForTimeout(300);
  };
  await pinchIn(); await pinchIn();
  const d5 = await dims(1); want(Math.abs(d5.w - 32) < 0.5 || Math.abs(d5.h - 32 * (await page.evaluate(() => { const im = document.querySelector(".sm-sticker img"); return im.naturalHeight / im.naturalWidth; }))) < 0.5, "pinch outside shrinks down to the minimum " + JSON.stringify(d5));
  want(await page.evaluate(() => { const e = document.querySelector(".sm-sticker"); return e.classList.contains("sm-no-sy") && getComputedStyle(e.querySelector(".sm-stretch-y")).display === "none"; }), "short edge hides its stretch pill");

  // pin on header
  await dragTo(1, 200, 26);
  want(await page.evaluate(() => { const e = document.querySelector(".sm-sticker"); return e.parentNode.classList.contains("sm-layer-top") && document.elementFromPoint(200, 26).closest(".sm-sticker") === e; }), "released on header → pinned on top layer above it");
  const yPin = (await box(1)).y;
  await page.evaluate(() => { document.getElementById("messages").scrollTop += 80; }); await page.waitForTimeout(100);
  want(Math.abs((await box(1)).y - yPin) < 1, "pinned sticker does not scroll");
  await page.evaluate(() => { document.getElementById("messages").scrollTop -= 80; });

  // × deletes (grow it first — on a 32px sticker the × overlaps the other handles and the tap would be ambiguous)
  await dragTo(1, 120, 500); await page.waitForTimeout(200);
  await pinchOut(); await pinchOut();
  await dragTo(1, 120, 500); await page.waitForTimeout(450);
  const xb = await page.locator(".sm-selected .sm-del").boundingBox();
  await page.touchscreen.tap(xb.x + xb.width / 2, xb.y + xb.height / 2); await page.waitForTimeout(150);
  want((await st()).n === 0, "× deletes the sticker");

  // manager
  await page.evaluate(() => document.querySelector(".sm-settings").click()); await page.waitForTimeout(500);
  const mm = () => page.evaluate(() => { const m = document.querySelector(".sm-manager-mask"); if (!m) return null; const q = (s) => m.querySelector(s); return { tiles: m.querySelectorAll(".sm-item").length, off: m.querySelectorAll(".sm-item.sm-off").length, picked: m.querySelectorAll(".sm-item.sm-picked").length, tabs: Array.from(m.querySelectorAll(".sm-tab")).map((t) => t.textContent), active: (q(".sm-tab.sm-active") || {}).textContent, count: q(".sm-count").textContent, delcatHidden: q(".sm-delcat").hidden, hideDisabled: q(".sm-hide").disabled, selallDisabled: q(".sm-selall").disabled, addFirst: q(".sm-grid").firstElementChild.classList.contains("sm-add"), editing: document.getElementById("app").classList.contains("sm-editing") }; });
  let m = await mm(); want(!!m && m.tiles === 4 && m.tabs.join("|") === "全部|Tape|Star|+" && m.active === "全部" && m.addFirst && m.delcatHidden && m.hideDisabled && !m.selallDisabled && m.editing, "manager: 4 tiles, tabs All/Tape/Star/+, add tile first " + JSON.stringify(m));
  want(await page.evaluate(() => { const r = document.querySelector(".sm-manager").getBoundingClientRect(); return r.top >= 44 && r.top <= 90; }), "manager sits near the top");
  want(await page.evaluate(() => { const g = document.querySelector(".sm-grid"), a = document.querySelector(".sm-add").getBoundingClientRect(), it = document.querySelector(".sm-item").getBoundingClientRect(); return g.scrollWidth <= g.clientWidth && Math.abs(a.width - it.width) < 1 && Math.abs(a.height - it.height) < 1 && Math.abs(it.width - it.height) < 1; }), "no horizontal scroll; add tile = sticker tile = square");
  await page.screenshot({ path: path.join(shots, "2-manager.png") });
  const hAll = await page.evaluate(() => document.querySelector(".sm-manager").getBoundingClientRect().height);
  await page.evaluate(() => document.querySelector('.sm-tab[data-cat="Tape"]').click()); await page.waitForTimeout(100);
  m = await mm(); want(m.tiles === 2 && m.active === "Tape" && !m.delcatHidden && m.count.indexOf("Tape 2") >= 0, "Tape tab: 2 tiles, delete-category visible " + m.count);
  want(Math.abs((await page.evaluate(() => document.querySelector(".sm-manager").getBoundingClientRect().height)) - hAll) < 0.5, "dialog height unchanged across tabs");
  // select all → hide (strict) → shown count drops; hide again errors; show restores
  await page.evaluate(() => document.querySelector(".sm-selall").click()); await page.waitForTimeout(100);
  m = await mm(); want(m.picked === 2 && m.selallDisabled, "select all in Tape");
  await page.evaluate(() => document.querySelector(".sm-hide").click()); await page.waitForTimeout(600);
  m = await mm(); want(m.off === 2 && m.picked === 0, "hide both tapes");
  want(await page.evaluate(() => document.querySelectorAll(".sm-pal-item").length === 2), "palette now shows 2");
  await page.evaluate(() => document.querySelector(".sm-selall").click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-hide").click()); await page.waitForTimeout(300);
  want(await page.evaluate(() => { const t = document.querySelector(".sm-toast"); return t.classList.contains("sm-show") && t.textContent.length > 0 && t.getBoundingClientRect().bottom <= document.querySelector(".sm-row").getBoundingClientRect().top; }), "hiding already-hidden stickers shows the toast above the buttons");
  await page.evaluate(() => document.querySelector(".sm-show").click()); await page.waitForTimeout(600);
  m = await mm(); want(m.off === 0 && (await page.evaluate(() => document.querySelectorAll(".sm-pal-item").length)) === 4, "show restores both");
  // hidden sort to bottom
  await page.evaluate(() => document.querySelector('.sm-item[data-src="stickers/tape-pink.webp"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-hide").click()); await page.waitForTimeout(500);
  want(await page.evaluate(() => { const t = Array.from(document.querySelectorAll(".sm-item")); return t[0].dataset.src === "stickers/tape-blue.webp" && t[1].classList.contains("sm-off"); }), "hidden stickers sort to the bottom");
  await page.evaluate(() => document.querySelector('.sm-item[data-src="stickers/tape-pink.webp"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-show").click()); await page.waitForTimeout(500);
  // move to Star
  await page.evaluate(() => document.querySelector('.sm-item[data-src="stickers/tape-pink.webp"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-move").click()); await page.waitForTimeout(200);
  want(await page.evaluate(() => Array.from(document.querySelectorAll(".sm-move-mask .sm-row-btn")).map((r) => r.dataset.cat).join("|") === "|Tape|Star"), "move dialog lists uncategorized first, then categories");
  await page.evaluate(() => document.querySelector('.sm-move-mask .sm-row-btn[data-cat="Star"]').click()); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.sm-tab[data-cat="Star"]').click()); await page.waitForTimeout(100);
  m = await mm(); want(m.tiles === 3, "pink tape moved into Star (3 tiles)");
  // add category with empty name → placeholder
  await page.evaluate(() => document.querySelector(".sm-tab-add").click()); await page.waitForTimeout(200);
  want(await page.evaluate(() => document.querySelector(".sm-prompt .sm-input").placeholder === "默认*1"), "new category prompt placeholder 默认*1");
  await page.evaluate(() => document.querySelector(".sm-prompt .sm-ok").click()); await page.waitForTimeout(500);
  m = await mm(); want(m.tabs.join("|") === "全部|Tape|Star|默认*1|+" && m.active === "默认*1" && m.tiles === 0 && await page.evaluate(() => !!document.querySelector(".sm-grid-empty")), "category added with the placeholder name, empty state shown");
  // delete that category with confirm
  await page.evaluate(() => document.querySelector(".sm-delcat").click()); await page.waitForTimeout(200);
  want(await page.evaluate(() => { const c = document.querySelector(".sm-confirm"); return !!c && c.querySelector(".sm-modal-title").textContent === "删除分类「默认*1」？"; }), "delete category asks first");
  await page.evaluate(() => document.querySelector(".sm-confirm .sm-ok").click()); await page.waitForTimeout(500);
  m = await mm(); want(m.tabs.join("|") === "全部|Tape|Star|+" && m.active === "全部", "category deleted, back to All");
  // delete a sticker with confirm
  await page.evaluate(() => document.querySelector('.sm-item[data-src="stickers/star-blue.webp"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-remove").click()); await page.waitForTimeout(200);
  want(await page.evaluate(() => !!document.querySelector(".sm-confirm")), "delete sticker asks first");
  await page.evaluate(() => document.querySelector(".sm-confirm .sm-ok").click()); await page.waitForTimeout(500);
  m = await mm(); want(m.tiles === 3 && (await page.evaluate(() => document.querySelectorAll(".sm-pal-item").length)) === 3, "sticker deleted from grid and palette");
  await page.evaluate(() => document.querySelector(".sm-manager-mask .sm-modal-close").click()); await page.waitForTimeout(200);
  want(!(await mm()) && (await st()).editing, "manager closed, still editing");

  // done + exit via control
  await page.evaluate(() => document.querySelectorAll(".sm-pal-item")[0].click()); await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector(".sm-side .sm-primary").click()); await page.waitForTimeout(200);
  s = await st(); want(!s.editing && !s.side && s.n === 1 && await page.evaluate(() => getComputedStyle(document.querySelector(".sm-sticker .sm-handle")).display === "none"), "Done: column hidden, sticker stays, no handles");
  want(await page.evaluate(() => { const e = document.querySelector(".sm-sticker"); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return getComputedStyle(e).pointerEvents === "none" && !!hit && !hit.closest(".sm-sticker"); }), "after Done the sticker does not catch touches (page scrolls through it)");
  { const sid = await page.evaluate(() => document.querySelector(".sm-sticker").dataset.smId); // the first sticker was deleted earlier
    const sc0 = await page.evaluate(() => document.getElementById("messages").scrollTop); const bb = await box(sid);
    await touch("touchStart", [{ x: bb.x, y: bb.y }]); for (let i = 1; i <= 8; i++) { await touch("touchMove", [{ x: bb.x, y: bb.y - 12 * i }]); await page.waitForTimeout(16); } await touch("touchEnd", []); await page.waitForTimeout(300);
    const bbA = await box(sid);
    want(Math.abs((bbA.y + (await page.evaluate(() => document.getElementById("messages").scrollTop))) - (bb.y + sc0)) < 3 && (await st()).selected === 0, "swipe over a sticker after Done does not move it (page would scroll on a device)"); }
  await page.screenshot({ path: path.join(shots, "3-done.png") });
  await page.evaluate(() => document.getElementById("maskBtn").click()); await page.waitForTimeout(300);
  const ib = await page.locator("#input").boundingBox();
  await page.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await page.waitForTimeout(300);
  want(!(await st()).editing && await page.evaluate(() => document.activeElement && document.activeElement.id === "input"), "tapping a control exits mask mode and the control still works");
  await page.evaluate(() => document.getElementById("clearBtn").click()); await page.waitForTimeout(100);
  want((await st()).n === 0, "clear() removes everything");

  // review follow-ups: a category literally named like the All tab, exit() during enter(), destroy() with the manager open
  await page.evaluate(() => document.getElementById("maskBtn").click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector(".sm-settings").click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector(".sm-tab-add").click()); await page.waitForTimeout(200);
  await page.evaluate(() => { const i = document.querySelector(".sm-prompt .sm-input"); i.value = "全部"; document.querySelector(".sm-prompt .sm-ok").click(); }); await page.waitForTimeout(400);
  m = await mm(); want(m.active === "全部" && m.tiles === 0 && !m.delcatHidden && await page.evaluate(() => document.querySelectorAll(".sm-tab.sm-active").length === 1 && document.querySelector(".sm-tab.sm-active").dataset.cat === "全部"), "a category named 全部 is its own tab (empty, deletable), not the All tab " + JSON.stringify(m));
  await page.evaluate(() => document.querySelector(".sm-tab-all").click()); await page.waitForTimeout(100);
  m = await mm(); want(m.tiles === 3 && m.delcatHidden && m.active === "全部", "the real All tab still shows everything and hides delete-category");
  await page.evaluate(() => document.querySelector('.sm-tab[data-cat="全部"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector(".sm-delcat").click()); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector(".sm-confirm .sm-ok").click()); await page.waitForTimeout(400);
  m = await mm(); want(m.tabs.join("|") === "全部|Tape|Star|+", "that category deleted again");
  // destroy() while the manager is open: dialog gone, column gone, no stray sticker layers
  await page.evaluate(() => { window.mask.destroy(); }); await page.waitForTimeout(200);
  want(await page.evaluate(() => !document.querySelector(".sm-modal-mask") && !document.querySelector(".sm-side") && !document.querySelector(".sm-layer") && !document.getElementById("app").classList.contains("sm-editing")), "destroy() closes the manager and removes the column and layers");
  // exit() right after enter(): the column must not reappear once the (async) list load completes
  await page.evaluate(() => {
    window.mask2 = StickerMask.create({ scroller: document.getElementById("messages"), host: document.getElementById("app"), listUrl: "stickers/list.json?slow=1" });
    window.mask2.enter(); window.mask2.exit();
  });
  await page.waitForTimeout(800);
  want(await page.evaluate(() => { const s = document.querySelector(".sm-side"); return !window.mask2.editing && (!s || s.hidden); }), "exit() during enter(): column stays hidden after the load finishes");
  await page.evaluate(() => window.mask2.destroy());

  console.log(errors.length ? "FAILED: " + errors.length : "all passed");
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
