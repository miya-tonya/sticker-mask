// Exercises server/express-router.js against a temp folder. Needs express, multer and sharp installed
// (npm i express multer sharp), Node 18+:   node test/router.cjs
// Checks: corrupt list → 500 and untouched; update/delete/cats; an upload that finishes after a
// concurrent update must not wipe that update; random file names; trash/archive outside public/.
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const stickerRouter = require("../server/express-router");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sm-router-"));
const pub = path.join(root, "public");
const dir = path.join(pub, "stickers");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "list.json"), JSON.stringify({ cats: ["Tape"], items: ["/stickers/a.webp", { src: "/stickers/b.webp", cat: "Tape" }] }));
fs.writeFileSync(path.join(dir, "a.webp"), "x");
fs.writeFileSync(path.join(dir, "b.webp"), "x");

// slow sharp: the first upload's conversion waits until we release it
let release = null;
const slowSharp = Object.assign((input, o) => {
  const inst = sharp(input, o);
  const origMeta = inst.metadata.bind(inst);
  inst.metadata = () => new Promise((r) => { (release ? Promise.resolve() : new Promise((rr) => { release = rr; })).then(() => r(origMeta())); });
  return inst;
}, sharp);

const app = express();
app.use("/api/stickers", stickerRouter({ dir, multer, sharp: slowSharp, defaultCats: [] }));
const server = app.listen(0, "127.0.0.1", async () => {
  const base = "http://127.0.0.1:" + server.address().port + "/api/stickers";
  const errors = [];
  const want = (ok, msg) => { console.log((ok ? "ok  " : "FAIL") + " " + msg); if (!ok) errors.push(msg); };
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const list = () => JSON.parse(fs.readFileSync(path.join(dir, "list.json"), "utf8"));

  let r = await post("/update", { src: "/stickers/a.webp", hidden: true });
  want(r.status === 200 && r.body.items[0].hidden === true, "update hidden → 200");
  r = await post("/update", { src: "/stickers/a.webp", cat: "Nope" });
  want(r.status === 400 && r.body.error === "unknown cat", "unknown cat → 400");
  r = await post("/cats", { add: "Star" });
  want(r.status === 200 && list().cats.join() === "Tape,Star", "add cat");
  r = await post("/cats", { add: "Star" });
  want(r.status === 409, "duplicate cat → 409");
  r = await post("/update", { src: "/stickers/b.webp", cat: "Star" });
  want(r.status === 200 && list().items[1].cat === "Star", "move to Star");
  r = await post("/cats", { remove: "Star" });
  want(r.status === 200 && list().cats.join() === "Tape" && !list().items[1].cat, "remove cat → stickers uncategorized");

  // corrupt list: every write must fail and leave the file alone
  const good = fs.readFileSync(path.join(dir, "list.json"), "utf8");
  fs.writeFileSync(path.join(dir, "list.json"), "{ this is not json");
  r = await post("/cats", { add: "X" });
  want(r.status === 500 && fs.readFileSync(path.join(dir, "list.json"), "utf8") === "{ this is not json", "corrupt list.json → 500, file untouched");
  r = await post("/update", { src: "/stickers/a.webp", hidden: false });
  want(r.status === 500, "corrupt list.json → update 500");
  fs.writeFileSync(path.join(dir, "list.json"), good);

  // concurrent upload: start upload (conversion blocked), hide a sticker meanwhile, release
  const png = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const fd = new FormData();
  fd.append("cat", "Tape");
  fd.append("images", new Blob([png], { type: "image/png" }), "red.png");
  const uploadP = fetch(base + "/upload", { method: "POST", body: fd }).then(async (r) => ({ status: r.status, body: await r.json() }));
  await new Promise((r) => setTimeout(r, 300));
  r = await post("/update", { src: "/stickers/b.webp", hidden: true });
  want(r.status === 200, "update while upload is converting → 200");
  release();
  const up = await uploadP;
  const after = list();
  const b = after.items.find((x) => (x.src || x) === "/stickers/b.webp" || x.src === "/stickers/b.webp");
  want(up.status === 200 && up.body.added === 1 && after.items.length === 3 && b && b.hidden === true, "upload finished after the update: hidden flag survived " + JSON.stringify(after.items));
  const newItem = up.body.items[2];
  want(/^\/stickers\/s-[0-9a-f-]{36}\.webp$/.test(newItem.src) && newItem.cat === "Tape" && fs.existsSync(path.join(dir, path.basename(newItem.src))), "new file has a random name and landed in the category " + newItem.src);

  // delete → trash outside public, archive outside public
  r = await post("/delete", { src: newItem.src });
  const trash = path.join(root, "sticker-mask-data", "trash"), archive = path.join(root, "sticker-mask-data", "archive");
  want(r.status === 200 && fs.existsSync(trash) && fs.readdirSync(trash).length === 1 && !fs.existsSync(path.join(dir, path.basename(newItem.src))), "deleted file moved to trash outside public");
  want(fs.existsSync(archive) && fs.readdirSync(archive).length >= 5 && !fs.existsSync(path.join(pub, "stickers-trash")), "archives in sticker-mask-data/archive, nothing created under public/");

  console.log(errors.length ? "FAILED " + errors.length : "all passed");
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(errors.length ? 1 : 0);
});
