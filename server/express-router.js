/*
 * Optional Express router for the sticker manager (upload / hide / categories / delete).
 * Requires `multer` and `sharp` in your project:
 *
 *   const stickerRouter = require("sticker-mask/server/express-router");
 *   app.use("/api/stickers", stickerRouter({
 *     dir: path.join(__dirname, "public/stickers"),   // where the images and list.json live
 *     trashDir: path.join(__dirname, "stickers-trash"), // deleted files are moved here, never unlinked
 *   }));
 *
 * Then serve `dir` statically and point the front end at:
 *   listUrl: "/stickers/list.json",
 *   api: { upload: "/api/stickers/upload", update: "/api/stickers/update",
 *          delete: "/api/stickers/delete", cats: "/api/stickers/cats" }
 *
 * list.json format: { cats: ["Tape", "Star"], items: ["/stickers/a.webp", { src, hidden?, cat? }, …] }
 * A plain array of src strings is accepted too (old format).
 *
 * Add your own auth middleware in front of this router — it does none.
 */
const fs = require("fs");
const path = require("path");
const express = require("express");

module.exports = function stickerRouter(options) {
  const multer = options.multer || require("multer");
  const sharp = options.sharp || require("sharp");
  const dir = options.dir;
  if (!dir) throw new Error("sticker-mask router: options.dir is required");
  const listFile = options.listFile || path.join(dir, "list.json");
  const trashDir = options.trashDir || path.join(dir, "..", "stickers-trash");
  const archiveDir = options.archiveDir || path.join(dir, "..", "stickers-archive");
  const publicBase = (options.publicBase || "/" + path.basename(dir)).replace(/\/$/, "");
  const defaultCats = options.defaultCats || [];
  const maxSide = options.maxSide || 800;
  const upload = multer({ dest: options.tmpDir || require("os").tmpdir(), limits: { fileSize: options.maxFileSize || 15 * 1024 * 1024 } });

  function read() {
    let d = [];
    try { d = JSON.parse(fs.readFileSync(listFile, "utf8")); } catch (_) {}
    const arr = Array.isArray(d) ? d : (d && d.items) || [];
    const items = arr
      .map((x) => (typeof x === "string" ? { src: x } : x))
      .filter((x) => x && typeof x.src === "string")
      .map((x) => {
        const o = { src: x.src };
        if (x.hidden) o.hidden = true;
        if (typeof x.cat === "string" && x.cat) o.cat = x.cat;
        return o;
      });
    const cats = Array.isArray(d && d.cats) ? d.cats.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()) : defaultCats.slice();
    return { cats, items };
  }
  function write(state) {
    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      if (fs.existsSync(listFile)) fs.copyFileSync(listFile, path.join(archiveDir, "list.json." + Date.now()));
    } catch (e) {
      console.error("[sticker-mask] archive failed:", e.message);
    }
    const items = state.items.map((x) => (x.hidden || x.cat ? x : x.src));
    const tmp = listFile + ".tmp_" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ cats: state.cats, items }) + "\n");
    fs.renameSync(tmp, listFile);
    return state;
  }
  const reply = (res, state) => res.json({ ok: true, cats: state.cats, items: state.items });
  const srcOk = (src) => typeof src === "string" && src.startsWith(publicBase + "/") && /^[A-Za-z0-9._-]+\.(webp|png|jpg|jpeg|gif|svg)$/i.test(src.slice(publicBase.length + 1));
  const cleanCat = (c) => (typeof c === "string" ? c.trim().slice(0, 20) : "");

  const router = express.Router();

  // {src, hidden?, cat?} — hidden toggles the palette; cat "" means uncategorized
  router.post("/update", express.json(), (req, res) => {
    const { src, hidden, cat } = req.body || {};
    if (!srcOk(src)) return res.status(400).json({ error: "bad src" });
    const state = read();
    const it = state.items.find((x) => x.src === src);
    if (!it) return res.status(404).json({ error: "not in list" });
    if (hidden !== undefined) {
      if (hidden) it.hidden = true;
      else delete it.hidden;
    }
    if (cat !== undefined) {
      const c = cleanCat(cat);
      if (c && !state.cats.includes(c)) return res.status(400).json({ error: "unknown cat" });
      if (c) it.cat = c;
      else delete it.cat;
    }
    reply(res, write(state));
  });

  // {src} — removed from the list; the file is moved to trashDir
  router.post("/delete", express.json(), (req, res) => {
    const { src } = req.body || {};
    if (!srcOk(src)) return res.status(400).json({ error: "bad src" });
    const state = read();
    const idx = state.items.findIndex((x) => x.src === src);
    if (idx < 0) return res.status(404).json({ error: "not in list" });
    state.items.splice(idx, 1);
    try {
      fs.mkdirSync(trashDir, { recursive: true });
      const file = path.join(dir, path.basename(src));
      if (fs.existsSync(file)) fs.renameSync(file, path.join(trashDir, Date.now() + "-" + path.basename(src)));
    } catch (e) {
      console.error("[sticker-mask] trash failed:", e.message);
    }
    reply(res, write(state));
  });

  // {add: name} | {remove: name} — removing a category keeps its stickers (they become uncategorized)
  router.post("/cats", express.json(), (req, res) => {
    const body = req.body || {};
    const state = read();
    if (body.remove !== undefined) {
      const name = cleanCat(body.remove);
      const i = state.cats.indexOf(name);
      if (i < 0) return res.status(404).json({ error: "no such cat" });
      state.cats.splice(i, 1);
      state.items.forEach((x) => { if (x.cat === name) delete x.cat; });
      return reply(res, write(state));
    }
    const name = cleanCat(body.add);
    if (!name) return res.status(400).json({ error: "empty name" });
    if (state.cats.includes(name)) return res.status(409).json({ error: "exists" });
    state.cats.push(name);
    reply(res, write(state));
  });

  // multipart: images[] (+ optional text field `cat`, sent before the files).
  // Each image: transparent edges trimmed, longest side ≤ maxSide, saved as webp under a new name.
  router.post("/upload", (req, res) => {
    upload.array("images", 20)(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message || "upload failed" });
      const files = req.files || [];
      const cleanup = () => files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });
      if (!files.length) return res.status(400).json({ error: "no file uploaded" });
      const state = read();
      const cat = cleanCat((req.body || {}).cat);
      const catOk = cat && state.cats.includes(cat) ? cat : "";
      const added = [];
      const base = Date.now();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const meta = await sharp(f.path, { limitInputPixels: false }).metadata();
          let pipe = sharp(f.path, { limitInputPixels: false });
          if (meta.hasAlpha) {
            const stats = await sharp(f.path, { limitInputPixels: false }).stats();
            const a = stats.channels[stats.channels.length - 1];
            if (a && a.min < 10) pipe = pipe.trim({ threshold: 10 });
          }
          const buf = await pipe
            .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85, alphaQuality: 90, effort: 5 })
            .toBuffer();
          const name = "s" + base + "-" + i + ".webp";
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), buf);
          const item = { src: publicBase + "/" + name };
          if (catOk) item.cat = catOk;
          added.push(item);
        } catch (e) {
          console.error("[sticker-mask] convert failed:", f.originalname, e.message);
        }
      }
      cleanup();
      if (!added.length) return res.status(500).json({ error: "convert failed" });
      state.items = state.items.concat(added);
      res.json({ ok: true, added: added.length, cats: state.cats, items: write(state).items });
    });
  });

  return router;
};
