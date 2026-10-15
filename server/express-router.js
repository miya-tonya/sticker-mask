/*
 * Optional Express router for the sticker manager (upload / hide / categories / delete).
 * Requires `multer` and `sharp` in your project:
 *
 *   const stickerRouter = require("sticker-mask/server/express-router");
 *   app.use("/api/stickers", requireLogin, stickerRouter({
 *     dir: path.join(__dirname, "public/stickers"),      // images + list.json, served statically
 *     dataDir: path.join(__dirname, "sticker-mask-data"), // trash + archive — keep this OUTSIDE your static root
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
 * Security notes — this router does NOT handle any of these itself:
 *   · authentication: put your own middleware in front (anyone who can reach it can upload,
 *     rename categories and delete stickers);
 *   · CSRF: if you authenticate with cookies, add a CSRF token or SameSite cookies;
 *   · the trash / archive folders must not be reachable over HTTP (default: `dataDir`, which is
 *     resolved next to `dir`'s parent, i.e. outside a conventional `public/` root — check yours).
 *
 * Writes are serialised inside this process and the list is re-read right before every write,
 * so a slow upload cannot overwrite a change made meanwhile. Run a single instance per list.json.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");

module.exports = function stickerRouter(options) {
  const multer = options.multer || require("multer");
  const sharp = options.sharp || require("sharp");
  const dir = options.dir;
  if (!dir) throw new Error("sticker-mask router: options.dir is required");
  const listFile = options.listFile || path.join(dir, "list.json");
  const dataDir = options.dataDir || path.join(path.dirname(path.dirname(path.resolve(dir))), "sticker-mask-data");
  const trashDir = options.trashDir || path.join(dataDir, "trash");
  const archiveDir = options.archiveDir || path.join(dataDir, "archive");
  const publicBase = (options.publicBase || "/" + path.basename(dir)).replace(/\/$/, "");
  const defaultCats = options.defaultCats || [];
  const maxSide = options.maxSide || 800;
  const maxPixels = options.maxPixels || 40e6; // decoded pixel cap per image (sharp refuses bigger ones)
  const upload = multer({ dest: options.tmpDir || os.tmpdir(), limits: { fileSize: options.maxFileSize || 15 * 1024 * 1024, files: 20 } });

  // Missing list = empty list. A list that exists but cannot be parsed is an error: refusing to
  // write is the only way not to overwrite whatever is in there.
  function read() {
    let raw;
    try {
      raw = fs.readFileSync(listFile, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return { cats: defaultCats.slice(), items: [] };
      throw e;
    }
    const d = JSON.parse(raw);
    const arr = Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : null;
    if (!arr) throw new Error("list.json: items is not an array");
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
      if (fs.existsSync(listFile)) fs.copyFileSync(listFile, path.join(archiveDir, "list.json." + Date.now() + "-" + process.pid));
    } catch (e) {
      console.error("[sticker-mask] archive failed:", e.message);
    }
    const items = state.items.map((x) => (x.hidden || x.cat ? x : x.src));
    const tmp = listFile + ".tmp_" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ cats: state.cats, items }) + "\n");
    fs.renameSync(tmp, listFile);
    return state;
  }
  // One mutation at a time per process: read → change → write never interleaves.
  let chain = Promise.resolve();
  function mutate(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }
  const reply = (res, state) => res.json({ ok: true, cats: state.cats, items: state.items });
  const fail = (res, e) => {
    const bad = e && e.status;
    if (!bad) console.error("[sticker-mask]", e && e.message ? e.message : e);
    res.status(bad || 500).json({ error: bad ? e.message : "list.json unreadable or write failed" });
  };
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  const srcOk = (src) => typeof src === "string" && src.startsWith(publicBase + "/") && /^[A-Za-z0-9._-]+\.(webp|png|jpg|jpeg|gif|svg)$/i.test(src.slice(publicBase.length + 1));
  const cleanCat = (c) => (typeof c === "string" ? c.trim().slice(0, 20) : "");

  const router = express.Router();

  // {src, hidden?, cat?} — hidden toggles the palette; cat "" means uncategorized
  router.post("/update", express.json(), (req, res) => {
    const { src, hidden, cat } = req.body || {};
    if (!srcOk(src)) return res.status(400).json({ error: "bad src" });
    mutate(() => {
      const state = read();
      const it = state.items.find((x) => x.src === src);
      if (!it) throw httpError(404, "not in list");
      if (hidden !== undefined) {
        if (hidden) it.hidden = true;
        else delete it.hidden;
      }
      if (cat !== undefined) {
        const c = cleanCat(cat);
        if (c && !state.cats.includes(c)) throw httpError(400, "unknown cat");
        if (c) it.cat = c;
        else delete it.cat;
      }
      return write(state);
    }).then((state) => reply(res, state), (e) => fail(res, e));
  });

  // {src} — removed from the list; the file is moved to trashDir
  router.post("/delete", express.json(), (req, res) => {
    const { src } = req.body || {};
    if (!srcOk(src)) return res.status(400).json({ error: "bad src" });
    mutate(() => {
      const state = read();
      const idx = state.items.findIndex((x) => x.src === src);
      if (idx < 0) throw httpError(404, "not in list");
      state.items.splice(idx, 1);
      try {
        fs.mkdirSync(trashDir, { recursive: true });
        const file = path.join(dir, path.basename(src));
        if (fs.existsSync(file)) fs.renameSync(file, path.join(trashDir, Date.now() + "-" + path.basename(src)));
      } catch (e) {
        console.error("[sticker-mask] trash failed:", e.message);
      }
      return write(state);
    }).then((state) => reply(res, state), (e) => fail(res, e));
  });

  // {add: name} | {remove: name} — removing a category keeps its stickers (they become uncategorized)
  router.post("/cats", express.json(), (req, res) => {
    const body = req.body || {};
    mutate(() => {
      const state = read();
      if (body.remove !== undefined) {
        const name = cleanCat(body.remove);
        const i = state.cats.indexOf(name);
        if (i < 0) throw httpError(404, "no such cat");
        state.cats.splice(i, 1);
        state.items.forEach((x) => { if (x.cat === name) delete x.cat; });
        return write(state);
      }
      const name = cleanCat(body.add);
      if (!name) throw httpError(400, "empty name");
      if (state.cats.includes(name)) throw httpError(409, "exists");
      state.cats.push(name);
      return write(state);
    }).then((state) => reply(res, state), (e) => fail(res, e));
  });

  // multipart: images[] (+ optional text field `cat`, sent before the files).
  // Each image: transparent edges trimmed, longest side ≤ maxSide, saved as webp under a random
  // name. Conversion runs outside the write lock; the list is read fresh when the results are
  // appended, so nothing changed meanwhile gets overwritten.
  router.post("/upload", (req, res) => {
    upload.array("images", 20)(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message || "upload failed" });
      const files = req.files || [];
      const cleanup = () => files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });
      if (!files.length) return res.status(400).json({ error: "no file uploaded" });
      const cat = cleanCat((req.body || {}).cat);
      const converted = [];
      for (const f of files) {
        try {
          const open = () => sharp(f.path, { limitInputPixels: maxPixels });
          const meta = await open().metadata();
          let pipe = open();
          if (meta.hasAlpha) {
            const stats = await open().stats();
            const a = stats.channels[stats.channels.length - 1];
            if (a && a.min < 10) pipe = pipe.trim({ threshold: 10 });
          }
          const buf = await pipe
            .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85, alphaQuality: 90, effort: 5 })
            .toBuffer();
          converted.push(buf);
        } catch (e) {
          console.error("[sticker-mask] convert failed:", f.originalname, e.message);
        }
      }
      cleanup();
      if (!converted.length) return res.status(500).json({ error: "convert failed" });
      mutate(() => {
        const state = read();
        const catOk = cat && state.cats.includes(cat) ? cat : "";
        fs.mkdirSync(dir, { recursive: true });
        const added = [];
        for (const buf of converted) {
          const name = "s-" + crypto.randomUUID() + ".webp";
          fs.writeFileSync(path.join(dir, name), buf, { flag: "wx" }); // exclusive create: never overwrites
          const item = { src: publicBase + "/" + name };
          if (catOk) item.cat = catOk;
          added.push(item);
        }
        state.items = state.items.concat(added);
        return { state: write(state), added: added.length };
      }).then(({ state, added }) => res.json({ ok: true, added, cats: state.cats, items: state.items }), (e) => fail(res, e));
    });
  });

  return router;
};
