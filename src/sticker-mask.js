/*!
 * sticker-mask — drop stickers over the parts of a page you want hidden before taking a screenshot.
 * Zero dependencies. Touch-first (iOS Safari / PWA tested), works with a mouse too.
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StickerMask = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TEXTS_ZH = {
    done: "完成",
    manage: "贴纸管理",
    noAssets: "还没有贴纸素材",
    managerTitle: "贴纸管理",
    tabAll: "全部",
    addTab: "加一个分类",
    newCatTitle: "新分类的名字",
    newCatPlaceholder: function (n) { return "默认*" + n; },
    ok: "添加",
    cancel: "取消",
    selectAll: "全选",
    selectNone: "全部取消",
    deleteCat: "删除分类",
    moveCat: "移动分类",
    hide: "移出表示栏",
    show: "移回表示栏",
    remove: "删除",
    addSticker: "添加贴纸",
    count: function (total, shown, tab, inTab, selected) {
      return "共 " + total + " 张 · 表示栏 " + shown + " 张" + (tab ? " · " + tab + " " + inTab + " 张" : "") + (selected ? " · 选中 " + selected + " 张" : "");
    },
    emptyAll: "还没有贴纸，点 + 选图",
    emptyCat: "这个分类还是空的：点 + 选图，或在「全部」里选中贴纸「移动分类」",
    offLabel: "已移出",
    uncategorized: "不分类（只在「全部」）",
    moveTitle: function (n) { return "把 " + n + " 张移到…"; },
    deleteTitle: function (n) { return n > 1 ? "删除这 " + n + " 张贴纸？" : "删除这张贴纸？"; },
    deleteBody: "文件会挪进服务器的回收目录，不会真的消失；表示栏里立刻看不到。",
    deleteCatTitle: function (name) { return "删除分类「" + name + "」？"; },
    deleteCatBody: "贴纸不会删，里面的会回到不分类（只在「全部」里）。",
    confirmDelete: "删除",
    errMixedHidden: "选中的里有已移出的，先把它们取消选中",
    errMixedShown: "选中的里有还在表示栏的，先把它们取消选中",
    failPrefix: "没成功：",
    uploading: "…",
  };
  var TEXTS_EN = {
    done: "Done",
    manage: "Manage stickers",
    noAssets: "No stickers yet",
    managerTitle: "Stickers",
    tabAll: "All",
    addTab: "Add a category",
    newCatTitle: "Category name",
    newCatPlaceholder: function (n) { return "Untitled " + n; },
    ok: "Add",
    cancel: "Cancel",
    selectAll: "Select all",
    selectNone: "Clear",
    deleteCat: "Delete category",
    moveCat: "Move to…",
    hide: "Hide from palette",
    show: "Show in palette",
    remove: "Delete",
    addSticker: "Add sticker",
    count: function (total, shown, tab, inTab, selected) {
      return total + " total · " + shown + " in palette" + (tab ? " · " + tab + ": " + inTab : "") + (selected ? " · " + selected + " selected" : "");
    },
    emptyAll: "No stickers yet — tap + to add",
    emptyCat: "Empty category — tap + to add, or select stickers in All and move them here",
    offLabel: "hidden",
    uncategorized: "Uncategorized (All only)",
    moveTitle: function (n) { return "Move " + n + " to…"; },
    deleteTitle: function (n) { return n > 1 ? "Delete " + n + " stickers?" : "Delete this sticker?"; },
    deleteBody: "The file is moved to the server's trash folder; it disappears from the palette right away.",
    deleteCatTitle: function (name) { return 'Delete category "' + name + '"?'; },
    deleteCatBody: "Stickers are kept; they become uncategorized.",
    confirmDelete: "Delete",
    errMixedHidden: "Some selected stickers are already hidden — unselect them first",
    errMixedShown: "Some selected stickers are still shown — unselect them first",
    failPrefix: "Failed: ",
    uploading: "…",
  };

  var GEAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) for (var k in src) target[k] = src[k];
    }
    return target;
  }
  function closest(node, sel) {
    return node && node.closest ? node.closest(sel) : null;
  }
  function normalizeList(d) {
    var arr = Array.isArray(d) ? d : (d && d.items) || [];
    var items = arr
      .map(function (x) { return typeof x === "string" ? { src: x } : x; })
      .filter(function (x) { return x && typeof x.src === "string"; })
      .map(function (x) {
        var o = { src: x.src };
        if (x.hidden) o.hidden = true;
        if (typeof x.cat === "string" && x.cat) o.cat = x.cat;
        return o;
      });
    var cats = Array.isArray(d && d.cats) ? d.cats.filter(function (c) { return typeof c === "string" && c; }) : null;
    return { items: items, cats: cats };
  }

  /**
   * Create a sticker-mask instance.
   *
   * Required:
   *   scroller   the scrolling content element; stickers dropped on content scroll with it
   *   host       a positioned ancestor that covers the whole UI (top bar included); the floating
   *              layer and the side column are mounted here, so stickers can cover the top bar
   *   listUrl    URL of the sticker list (array of src, or {cats:[], items:[{src,hidden?,cat?}]})
   *              — or pass `assets` (same shape) to skip fetching
   * Optional:
   *   api        {upload, update, delete, cats} endpoint URLs (see server/express-router.js).
   *              Without it the manager (gear) is not shown: the palette is read-only.
   *   defaultCats  categories used when the list has none (default: [])
   *   sideTop / sideBottom   px (number or function) the side column keeps from the host's top /
   *              bottom edge, e.g. your top bar height + 8 and composer height + 8
   *   extraButtons  [{label, title, onClick, pressed}] rendered above "Done" (e.g. a toggle for
   *              hiding a name in the header)
   *   exitOn     selector; tapping a matching control while editing exits edit mode first
   *              (default: "button, a, textarea, input, select, label")
   *   confirm    async ({title, body, okText, cancelText}) => boolean (default: built-in dialog)
   *   texts      overrides for any string (see StickerMask.texts.zh / .en)
   *   onChange(count), onEnter(), onExit()
   */
  function create(opts) {
    if (!opts || !opts.scroller || !opts.host) throw new Error("sticker-mask: scroller and host are required");
    var scroller = opts.scroller;
    var host = opts.host;
    var T = assign({}, TEXTS_ZH, opts.texts || {});
    var api = opts.api || null;
    var exitOn = opts.exitOn || "button, a, textarea, input, select, label";
    var BASE_W = opts.baseWidth || 96;
    var MIN_W = opts.minWidth || BASE_W / 3; // minimum = a third of the initial size (height follows the ratio)
    var MAX_W = opts.maxWidth || 640;
    var STRETCH_MIN_EDGE = 56; // an edge shorter than this hides its stretch handle (it would overlap the corner handles)

    var layerTop = null;
    var layerContent = null;
    var assets = [];
    var cats = null;
    var stickers = [];
    var editing = false;
    var selected = null;
    var nextId = 1;
    var side = null;
    var palette = null;
    var destroyed = false;
    var enterSeq = 0; // enter() is async; a stale completion (after exit()/destroy()) must not reopen the column
    var openModals = new Set(); // dialogs live on document.body; destroy() closes them
    var activeGestures = new Set(); // "end now" callbacks of gestures in progress; destroy() runs them

    scroller.classList.add("sm-scroller");
    if (getComputedStyle(scroller).position === "static") scroller.style.position = "relative";

    function num(v, d) { return typeof v === "function" ? v() : typeof v === "number" ? v : d; }
    function emitChange() { if (opts.onChange) opts.onChange(stickers.length); }

    /* ── layers ─────────────────────────────────────────────────────────── */
    function ensureLayers() {
      if (!layerTop) {
        layerTop = el("div", "sm-layer sm-layer-top");
        layerContent = el("div", "sm-layer sm-layer-content");
        [layerTop, layerContent].forEach(function (l) {
          l.addEventListener("click", function (e) { e.stopPropagation(); });
          l.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        });
      }
      if (layerTop.parentNode !== host) host.appendChild(layerTop);
      if (layerContent.parentNode !== scroller) scroller.appendChild(layerContent);
    }
    // Call after you rebuild the scroller's content (innerHTML = ""): re-attaches the content layer.
    function remount() {
      if (!stickers.length && !editing) return;
      ensureLayers();
    }

    /* ── assets ─────────────────────────────────────────────────────────── */
    function loadAssets(force) {
      if (assets.length && !force) return Promise.resolve(assets);
      if (opts.assets && !opts.listUrl) {
        var n = normalizeList(opts.assets);
        assets = n.items;
        cats = n.cats || (opts.defaultCats || []).slice();
        return Promise.resolve(assets);
      }
      var url = opts.listUrl + (opts.listUrl.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
      return fetch(url, { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var n = normalizeList(d);
          assets = n.items;
          cats = n.cats || (opts.defaultCats || []).slice();
          return assets;
        })
        .catch(function () {
          assets = [];
          cats = (opts.defaultCats || []).slice();
          return assets;
        });
    }
    function renderPalette() {
      if (!palette) return;
      palette.innerHTML = "";
      var any = false;
      assets.forEach(function (a, i) {
        if (a.hidden) return;
        any = true;
        var b = el("button", "sm-pal-item", { type: "button" });
        var im = el("img", null, { alt: "", draggable: "false" });
        im.src = a.src;
        b.appendChild(im);
        b.addEventListener("click", function () { addSticker(i); });
        palette.appendChild(b);
      });
      if (!any) {
        var t = el("span", "sm-empty");
        t.textContent = T.noAssets;
        palette.appendChild(t);
      }
    }

    /* ── geometry ───────────────────────────────────────────────────────── */
    function minSide(st, axis) { return axis === "x" ? MIN_W : MIN_W * (st.ratio || 1); }
    function clampSide(st, axis, v) { return Math.min(MAX_W, Math.max(minSide(st, axis), v)); }
    // Proportional scale: both sides share one factor; whichever side hits a limit stops it.
    function scaleTo(st, w0, h0, s) {
      var hh = h0 || (st.ratio ? w0 * st.ratio : 0);
      if (!hh) { st.w = clampSide(st, "x", w0 * s); return; }
      var kMin = Math.max(minSide(st, "x") / w0, minSide(st, "y") / hh);
      var kMax = Math.min(MAX_W / w0, MAX_W / hh);
      var k = Math.max(kMin, Math.min(kMax, s));
      st.w = w0 * k;
      st.h = hh * k;
    }
    function applyStyle(st) {
      st.el.style.left = st.cx + "px";
      st.el.style.top = st.cy + "px";
      st.el.style.width = st.w + "px";
      st.el.style.height = st.h ? st.h + "px" : "";
      st.el.style.transform = "translate(-50%,-50%) rotate(" + st.r + "rad)";
      var hh = st.h || st.w * (st.ratio || 1);
      st.el.classList.toggle("sm-no-sx", hh < STRETCH_MIN_EDGE);
      st.el.classList.toggle("sm-no-sy", st.w < STRETCH_MIN_EDGE);
    }
    function centerClient(st) {
      var r = st.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    // While dragging, a sticker lives on the top layer (not clipped by the scroller, above everything).
    function liftToTop(st) {
      ensureLayers();
      var c = centerClient(st);
      var a = host.getBoundingClientRect();
      st.cx = c.x - a.left;
      st.cy = c.y - a.top;
      if (st.el.parentNode !== layerTop) layerTop.appendChild(st.el);
      applyStyle(st);
    }
    // On release: center above the scroller = stays pinned on the top layer; otherwise it joins the
    // content layer and scrolls with the content.
    function settle(st) {
      var c = centerClient(st);
      var m = scroller.getBoundingClientRect();
      if (c.y < m.top) return;
      st.cx = c.x - m.left + scroller.scrollLeft;
      st.cy = c.y - m.top + scroller.scrollTop;
      if (st.el.parentNode !== layerContent) layerContent.appendChild(st.el);
      applyStyle(st);
    }
    function select(st) {
      if (selected && selected !== st) selected.el.classList.remove("sm-selected");
      selected = st;
      if (st) st.el.classList.add("sm-selected");
      host.classList.toggle("sm-has-selected", !!st);
    }

    /* ── document-level pointers (outside any sticker) ─────────────────────
     *  · one finger while a sticker is selected: drag it (after 6px), tap = deselect
     *  · two fingers while selected: pinch = scale + rotate + follow the midpoint
     *  · tapping a control (exitOn) exits edit mode first, the control then works normally */
    var freePtrs = new Map();
    var freeStart = null;
    var freeDrag = null;
    function freeSnapshot() {
      var p = Array.from(freePtrs.values());
      var dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
      return { d: Math.hypot(dx, dy), a: Math.atan2(dy, dx), mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 };
    }
    function inDialog(t) { return !!closest(t, ".sm-modal-mask"); }
    function onDocDownExit(e) {
      if (!editing) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (closest(t, ".sm-sticker") || closest(t, ".sm-side") || inDialog(t)) return;
      if (closest(t, exitOn)) exit();
    }
    function onDocDown(e) {
      if (!editing || closest(e.target, ".sm-sticker") || inDialog(e.target)) return;
      if (scroller.classList.contains("sm-holding")) return; // second finger of a sticker gesture
      freePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (freePtrs.size === 1 && selected && !closest(e.target, ".sm-side")) {
        freeDrag = { id: e.pointerId, st: selected, lifted: false };
      }
      if (freePtrs.size === 2 && selected) {
        freeDrag = null;
        var st = selected;
        liftToTop(st);
        freeStart = assign(freeSnapshot(), { w: st.w, h: st.h, r: st.r, cx: st.cx, cy: st.cy, st: st });
        e.preventDefault();
      }
    }
    function onDocMove(e) {
      var p = freePtrs.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (freeStart && freePtrs.size >= 2) {
        e.preventDefault();
        var now = freeSnapshot();
        var st = freeStart.st;
        if (freeStart.d > 0) {
          scaleTo(st, freeStart.w, freeStart.h, now.d / freeStart.d);
          st.r = freeStart.r + (now.a - freeStart.a);
          st.cx = freeStart.cx + (now.mx - freeStart.mx);
          st.cy = freeStart.cy + (now.my - freeStart.my);
          applyStyle(st);
        }
        return;
      }
      if (freeDrag && freeDrag.id === e.pointerId && freePtrs.size === 1) {
        var s2 = freeDrag.st;
        if (!freeDrag.lifted) {
          if (Math.hypot(p.x - p.x0, p.y - p.y0) < 6) return;
          liftToTop(s2);
          assign(freeDrag, { lifted: true, x0: p.x, y0: p.y, cx: s2.cx, cy: s2.cy });
        }
        e.preventDefault();
        s2.cx = freeDrag.cx + (p.x - freeDrag.x0);
        s2.cy = freeDrag.cy + (p.y - freeDrag.y0);
        applyStyle(s2);
      }
    }
    function onDocUp(e) {
      var p = freePtrs.get(e.pointerId);
      if (!p) return;
      freePtrs.delete(e.pointerId);
      if (freeStart) {
        if (freePtrs.size === 0) { settle(freeStart.st); freeStart = null; }
        return;
      }
      if (freeDrag && freeDrag.id === e.pointerId) {
        var d = freeDrag;
        freeDrag = null;
        if (d.lifted) { settle(d.st); return; }
      }
      if (freePtrs.size === 0 && e.type === "pointerup" && selected && Math.hypot(p.x - p.x0, p.y - p.y0) < 8) select(null);
    }
    // The browser takes over a pan-y gesture on the first move and cancels our pointers; blocking
    // the default on touchmove (non-passive) while a free pinch/drag is active keeps them alive.
    function onDocTouchMove(e) {
      if ((freeStart && e.touches && e.touches.length >= 2) || freeDrag) e.preventDefault();
    }
    document.addEventListener("pointerdown", onDocDownExit, true);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("pointermove", onDocMove, true);
    document.addEventListener("pointerup", onDocUp, true);
    document.addEventListener("pointercancel", onDocUp, true);
    document.addEventListener("touchmove", onDocTouchMove, { passive: false, capture: true });

    /* ── stickers ───────────────────────────────────────────────────────── */
    function addSticker(idx) {
      var a = assets[idx];
      if (!a) return;
      ensureLayers();
      var rect = scroller.getBoundingClientRect();
      var n = stickers.length;
      var st = {
        idx: idx,
        // centre of the visible part of the scroller; successive stickers are offset a little
        cx: scroller.scrollLeft + rect.width / 2 + ((n % 3) - 1) * 24,
        cy: scroller.scrollTop + rect.height / 2 + ((((n / 3) | 0) % 3) - 1) * 24,
        w: BASE_W,
        r: 0,
        el: null,
      };
      var node = el("div", "sm-sticker");
      node.dataset.smId = String(nextId++);
      st.el = node;
      var im = el("img", null, { alt: "", draggable: "false" });
      im.src = a.src;
      var gotRatio = function () {
        if (!(im.naturalWidth > 0)) return;
        st.ratio = im.naturalHeight / im.naturalWidth;
        if (!st.h) { st.h = st.w * st.ratio; applyStyle(st); }
      };
      im.addEventListener("load", gotRatio);
      if (im.complete) gotRatio();
      node.appendChild(im);
      var h = el("span", "sm-handle", { "aria-label": "scale / rotate" });
      var del = el("span", "sm-del", { "aria-label": "delete" });
      var sx = el("span", "sm-stretch sm-stretch-x", { "aria-label": "stretch width" });
      var sy = el("span", "sm-stretch sm-stretch-y", { "aria-label": "stretch height" });
      node.appendChild(h);
      node.appendChild(del);
      node.appendChild(sx);
      node.appendChild(sy);
      layerContent.appendChild(node);
      applyStyle(st);
      attachGestures(st, h, del, sx, sy);
      stickers.push(st);
      select(st);
      emitChange();
      return st;
    }
    function removeSticker(st) {
      var i = stickers.indexOf(st);
      if (i >= 0) stickers.splice(i, 1);
      if (selected === st) select(null);
      st.el.remove();
      emitChange();
    }
    function clear() {
      stickers.forEach(function (s) { s.el.remove(); });
      stickers = [];
      select(null);
      emitChange();
    }

    function attachGestures(st, handle, del, stretchX, stretchY) {
      var node = st.el;
      var ptrs = new Map();
      var start = null;
      var moved = false;
      del.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); });
      del.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (editing) removeSticker(st);
      });
      var snapshot = function () {
        var p = Array.from(ptrs.values());
        if (p.length >= 2) {
          var dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
          return { cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
        }
        return { cx: p[0].x, cy: p[0].y, d: 0, a: 0 };
      };
      var rebase = function () { start = { snap: snapshot(), cx: st.cx, cy: st.cy, w: st.w, h: st.h, r: st.r }; };
      var onSecondDown = function (e) {
        if (!start || ptrs.size !== 1 || ptrs.has(e.pointerId)) return;
        e.preventDefault();
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        rebase();
      };
      var onMove = function (e) {
        if (!start || !ptrs.has(e.pointerId)) return;
        e.preventDefault();
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        var now = snapshot();
        var dx = now.cx - start.snap.cx, dy = now.cy - start.snap.cy;
        if (!moved && Math.hypot(dx, dy) > 6) moved = true;
        if (!moved && ptrs.size < 2) return;
        st.cx = start.cx + dx;
        st.cy = start.cy + dy;
        if (ptrs.size >= 2 && start.snap.d > 0) {
          scaleTo(st, start.w, start.h, now.d / start.snap.d);
          st.r = start.r + (now.a - start.snap.a);
        }
        applyStyle(st);
      };
      var teardown = function () {
        document.removeEventListener("pointerdown", onSecondDown, true);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        scroller.classList.remove("sm-holding");
        node.classList.remove("sm-held");
        activeGestures.delete(forceEnd);
      };
      var forceEnd = function () { ptrs.clear(); start = null; teardown(); };
      var onUp = function (e) {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.delete(e.pointerId);
        if (ptrs.size === 0) { start = null; teardown(); settle(st); }
        else { rebase(); moved = true; }
      };
      // An unselected sticker only reacts to a tap (which selects it); a swipe that starts on it
      // scrolls the page as usual (touch-action: pan-y on unselected stickers). Only the selected
      // sticker can be dragged / pinched.
      var tap = null;
      node.addEventListener("pointerup", function (e) {
        if (!tap || e.pointerId !== tap.id) return;
        var isTap = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8;
        tap = null;
        if (isTap && editing) select(st);
      });
      node.addEventListener("pointercancel", function () { tap = null; });
      node.addEventListener("pointerdown", function (e) {
        if (!editing) return;
        if (e.target !== node) return; // handles have their own listeners
        if (ptrs.size > 0) return;
        if (selected !== st) {
          tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        select(st);
        liftToTop(st);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        rebase();
        scroller.classList.add("sm-holding");
        node.classList.add("sm-held");
        activeGestures.add(forceEnd);
        document.addEventListener("pointerdown", onSecondDown, true);
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
      });

      // corner handle: scale + rotate around the centre
      var hStart = null;
      var hMove = function (e) {
        if (!hStart || e.pointerId !== hStart.id) return;
        e.preventDefault();
        var vx = e.clientX - hStart.c.x, vy = e.clientY - hStart.c.y;
        var len = Math.hypot(vx, vy);
        if (hStart.v0.len > 0 && len > 0) {
          scaleTo(st, hStart.w, hStart.h, len / hStart.v0.len);
          st.r = hStart.r + (Math.atan2(vy, vx) - hStart.v0.ang);
          applyStyle(st);
        }
      };
      var hUp = function (e) {
        if (!hStart || (e && e.pointerId !== hStart.id)) return; // called without an event = forced end (destroy)
        hStart = null;
        activeGestures.delete(hUp);
        document.removeEventListener("pointermove", hMove);
        document.removeEventListener("pointerup", hUp);
        document.removeEventListener("pointercancel", hUp);
        scroller.classList.remove("sm-holding");
        settle(st);
      };
      handle.addEventListener("pointerdown", function (e) {
        if (!editing || hStart || sStart || ptrs.size > 0) return;
        e.preventDefault();
        e.stopPropagation();
        select(st);
        liftToTop(st);
        var c = centerClient(st);
        var vx = e.clientX - c.x, vy = e.clientY - c.y;
        hStart = { id: e.pointerId, c: c, v0: { len: Math.hypot(vx, vy), ang: Math.atan2(vy, vx) }, w: st.w, h: st.h, r: st.r };
        scroller.classList.add("sm-holding");
        activeGestures.add(hUp);
        document.addEventListener("pointermove", hMove);
        document.addEventListener("pointerup", hUp);
        document.addEventListener("pointercancel", hUp);
      });

      // edge handles: stretch one side; the opposite edge stays put (centre moves half the delta
      // along the sticker's own, possibly rotated, axis)
      var sStart = null;
      var sMove = function (e) {
        if (!sStart || e.pointerId !== sStart.id) return;
        e.preventDefault();
        var d = (e.clientX - sStart.x0) * sStart.ux + (e.clientY - sStart.y0) * sStart.uy;
        var base = sStart.axis === "x" ? sStart.w : sStart.h;
        var v = clampSide(st, sStart.axis, base + d);
        var shift = (v - base) / 2;
        if (sStart.axis === "x") st.w = v; else st.h = v;
        st.cx = sStart.cx + shift * sStart.ux;
        st.cy = sStart.cy + shift * sStart.uy;
        applyStyle(st);
      };
      var sUp = function (e) {
        if (!sStart || (e && e.pointerId !== sStart.id)) return;
        sStart = null;
        activeGestures.delete(sUp);
        document.removeEventListener("pointermove", sMove);
        document.removeEventListener("pointerup", sUp);
        document.removeEventListener("pointercancel", sUp);
        scroller.classList.remove("sm-holding");
        settle(st);
      };
      var sDown = function (axis) {
        return function (e) {
          if (!editing || sStart || hStart || ptrs.size > 0) return;
          e.preventDefault();
          e.stopPropagation();
          select(st);
          liftToTop(st);
          if (!st.h) st.h = node.offsetHeight || st.w * (st.ratio || 1);
          var ux = axis === "x" ? Math.cos(st.r) : -Math.sin(st.r);
          var uy = axis === "x" ? Math.sin(st.r) : Math.cos(st.r);
          sStart = { id: e.pointerId, axis: axis, ux: ux, uy: uy, x0: e.clientX, y0: e.clientY, w: st.w, h: st.h, cx: st.cx, cy: st.cy };
          scroller.classList.add("sm-holding");
          activeGestures.add(sUp);
          document.addEventListener("pointermove", sMove);
          document.addEventListener("pointerup", sUp);
          document.addEventListener("pointercancel", sUp);
        };
      };
      stretchX.addEventListener("pointerdown", sDown("x"));
      stretchY.addEventListener("pointerdown", sDown("y"));
    }

    /* ── side column ─────────────────────────────────────────────────────── */
    function buildSide() {
      side = el("div", "sm-side", { hidden: "" });
      palette = el("div", "sm-palette");
      side.appendChild(palette);
      var actions = el("div", "sm-side-actions");
      if (api) {
        var gear = el("button", "sm-btn sm-settings", { type: "button", title: T.manage, "aria-label": T.manage });
        gear.innerHTML = GEAR_SVG;
        gear.addEventListener("click", openManager);
        actions.appendChild(gear);
      }
      (opts.extraButtons || []).forEach(function (b) {
        var btn = el("button", "sm-btn sm-extra", { type: "button" });
        if (b.title) btn.title = b.title;
        btn.textContent = b.label;
        if (b.pressed) btn.setAttribute("aria-pressed", String(!!b.pressed()));
        btn.addEventListener("click", function () {
          b.onClick && b.onClick(btn);
          if (b.pressed) btn.setAttribute("aria-pressed", String(!!b.pressed()));
        });
        actions.appendChild(btn);
      });
      var done = el("button", "sm-btn sm-primary", { type: "button" });
      done.textContent = T.done;
      done.addEventListener("click", exit);
      actions.appendChild(done);
      side.appendChild(actions);
      host.appendChild(side);
    }
    function placeSide() {
      var top = num(opts.sideTop, 8);
      var bottom = num(opts.sideBottom, 8);
      side.style.top = top + "px";
      side.style.maxHeight = Math.max(120, host.clientHeight - top - bottom) + "px";
    }

    function enter() {
      if (editing || destroyed) return Promise.resolve();
      editing = true;
      var seq = ++enterSeq;
      ensureLayers();
      if (!side) buildSide();
      host.classList.add("sm-editing");
      if (opts.onEnter) opts.onEnter();
      return loadAssets().then(function () {
        if (!editing || destroyed || seq !== enterSeq) return; // exited (or destroyed) while the list was loading
        renderPalette();
        placeSide();
        side.hidden = false;
        palette.scrollTop = 0;
      });
    }
    function exit() {
      if (!editing) return;
      editing = false;
      host.classList.remove("sm-editing");
      select(null);
      if (side) side.hidden = true;
      if (opts.onExit) opts.onExit();
    }

    /* ── dialogs ─────────────────────────────────────────────────────────── */
    function modal(cls, inner) {
      var m = el("div", "sm-modal-mask " + (cls || ""));
      m.innerHTML = '<div class="sm-modal"><button type="button" class="sm-modal-close" aria-label="close">×</button>' + inner + "</div>";
      var remove = m.remove.bind(m);
      m.remove = function () { openModals.delete(m); remove(); };
      openModals.add(m);
      m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
      m.querySelector(".sm-modal-close").addEventListener("click", function () { m.remove(); });
      document.body.appendChild(m);
      return m;
    }
    function confirmDialog(o) {
      if (opts.confirm) return Promise.resolve(opts.confirm(o));
      return new Promise(function (resolve) {
        var m = modal("sm-confirm", '<div class="sm-modal-title"></div><div class="sm-modal-body"></div><div class="sm-modal-buttons"><button type="button" class="sm-mbtn sm-cancel"></button><button type="button" class="sm-mbtn sm-ok"></button></div>');
        m.querySelector(".sm-modal-title").textContent = o.title || "";
        m.querySelector(".sm-modal-body").textContent = o.body || "";
        m.querySelector(".sm-cancel").textContent = o.cancelText || T.cancel;
        m.querySelector(".sm-ok").textContent = o.okText || "OK";
        var done = function (v) { m.remove(); resolve(v); };
        m.querySelector(".sm-modal-close").addEventListener("click", function () { resolve(false); });
        m.addEventListener("click", function (e) { if (e.target === m) resolve(false); });
        m.querySelector(".sm-cancel").addEventListener("click", function () { done(false); });
        m.querySelector(".sm-ok").addEventListener("click", function () { done(true); });
      });
    }
    function promptDialog(o) {
      return new Promise(function (resolve) {
        var m = modal("sm-prompt", '<div class="sm-modal-title"></div><div class="sm-modal-body"><input type="text" class="sm-input" maxlength="20" autocomplete="off"></div><div class="sm-modal-buttons"><button type="button" class="sm-mbtn sm-cancel"></button><button type="button" class="sm-mbtn sm-ok"></button></div>');
        m.querySelector(".sm-modal-title").textContent = o.title;
        var inp = m.querySelector(".sm-input");
        inp.placeholder = o.placeholder;
        m.querySelector(".sm-cancel").textContent = T.cancel;
        m.querySelector(".sm-ok").textContent = T.ok;
        var done = function (v) { m.remove(); resolve(v); };
        m.querySelector(".sm-modal-close").addEventListener("click", function () { resolve(null); });
        m.addEventListener("click", function (e) { if (e.target === m) resolve(null); });
        m.querySelector(".sm-cancel").addEventListener("click", function () { done(null); });
        m.querySelector(".sm-ok").addEventListener("click", function () { done(inp.value.trim() || o.placeholder); });
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); done(inp.value.trim() || o.placeholder); } });
        try { inp.focus(); } catch (_) {}
      });
    }

    /* ── manager ─────────────────────────────────────────────────────────── */
    function post(url, body) {
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.ok) throw new Error(d.error || "HTTP " + r.status);
          return d;
        });
      });
    }
    function openManager() {
      if (!api) return;
      return loadAssets(true).then(function () {
        var ALL = null; // internal marker for the "all" tab — never the display text, which a category could be named
        var m = modal("sm-manager-mask",
          '<div class="sm-modal-title"></div><div class="sm-count"></div><div class="sm-tabs"></div><div class="sm-grid"></div>' +
          '<div class="sm-actions">' +
            '<div class="sm-row"><button type="button" class="sm-mbtn sm-selall"></button><button type="button" class="sm-mbtn sm-selnone"></button><span class="sm-spacer"></span><button type="button" class="sm-mbtn sm-danger sm-delcat" hidden></button></div>' +
            '<div class="sm-row"><button type="button" class="sm-mbtn sm-move"></button><button type="button" class="sm-mbtn sm-hide"></button><button type="button" class="sm-mbtn sm-show"></button><span class="sm-spacer"></span><button type="button" class="sm-mbtn sm-danger sm-remove"></button></div>' +
            '<div class="sm-toast"></div>' +
          '</div><input type="file" class="sm-file" accept="image/*" multiple hidden>');
        var box = m.querySelector(".sm-modal");
        box.classList.add("sm-manager");
        box.querySelector(".sm-modal-title").textContent = T.managerTitle;
        var grid = box.querySelector(".sm-grid"), tabs = box.querySelector(".sm-tabs"), count = box.querySelector(".sm-count");
        var btn = {};
        ["selall", "selnone", "delcat", "move", "hide", "show", "remove"].forEach(function (k) { btn[k] = box.querySelector(".sm-" + k); });
        btn.selall.textContent = T.selectAll;
        btn.selnone.textContent = T.selectNone;
        btn.delcat.textContent = T.deleteCat;
        btn.move.textContent = T.moveCat;
        btn.hide.textContent = T.hide;
        btn.show.textContent = T.show;
        btn.remove.textContent = T.remove;
        var file = box.querySelector(".sm-file");
        var toastEl = box.querySelector(".sm-toast");
        var toastTimer = null;
        var tab = ALL;
        var sel = new Set();
        var uploading = false;
        var picked = function () { return assets.filter(function (a) { return sel.has(a.src); }); };
        var inTab = function (a) { return tab === ALL || a.cat === tab; };
        var fail = function (e) {
          toastEl.textContent = typeof e === "string" ? e : T.failPrefix + (e && e.message ? e.message : e);
          toastEl.classList.add("sm-show");
          clearTimeout(toastTimer);
          toastTimer = setTimeout(function () { toastEl.classList.remove("sm-show"); }, 2400);
        };
        var applyItems = function (d) {
          if (d) {
            var n = normalizeList(d);
            if (Array.isArray(d.items)) assets = n.items;
            if (n.cats) cats = n.cats;
          }
          Array.from(sel).forEach(function (s) { if (!assets.some(function (a) { return a.src === s; })) sel.delete(s); });
          if (tab !== ALL && cats.indexOf(tab) < 0) tab = ALL;
          render();
          renderPalette();
        };
        var reloadAll = function () { return loadAssets(true).then(function () { applyItems(null); }); };
        var batch = function (list, fn) {
          var last = null;
          return list.reduce(function (p, a) { return p.then(function () { return fn(a).then(function (d) { last = d; }); }); }, Promise.resolve()).then(function () { return last; });
        };
        var lock = function (v) { btn.move.disabled = v; btn.hide.disabled = v; btn.show.disabled = v; btn.remove.disabled = v; };
        var renderTabs = function () {
          tabs.innerHTML = "";
          [ALL].concat(cats).forEach(function (name) {
            var b = el("button", "sm-tab" + (name === tab ? " sm-active" : "") + (name === ALL ? " sm-tab-all" : ""), { type: "button" });
            b.textContent = name === ALL ? T.tabAll : name;
            if (name !== ALL) b.dataset.cat = name;
            b.addEventListener("click", function () { tab = name; sel.clear(); render(); });
            tabs.appendChild(b);
          });
          var plus = el("button", "sm-tab sm-tab-add", { type: "button", "aria-label": T.addTab });
          plus.textContent = "+";
          plus.addEventListener("click", addCat);
          tabs.appendChild(plus);
          var act = tabs.querySelector(".sm-active");
          if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest", inline: "nearest" });
        };
        var render = function () {
          renderTabs();
          grid.innerHTML = "";
          var inThisTab = assets.filter(inTab);
          var shownItems = inThisTab.filter(function (a) { return !a.hidden; }).concat(inThisTab.filter(function (a) { return a.hidden; }));
          var addTile = el("button", "sm-add" + (uploading ? " sm-busy" : ""), { type: "button", "aria-label": T.addSticker });
          addTile.textContent = uploading ? T.uploading : "+";
          addTile.addEventListener("click", function () { if (!uploading) file.click(); });
          grid.appendChild(addTile);
          if (!shownItems.length) {
            var e = el("div", "sm-grid-empty");
            e.textContent = tab === ALL ? T.emptyAll : T.emptyCat;
            grid.appendChild(e);
          }
          shownItems.forEach(function (a) {
            var t = el("button", "sm-item" + (a.hidden ? " sm-off" : "") + (sel.has(a.src) ? " sm-picked" : ""), { type: "button" });
            t.dataset.src = a.src;
            t.dataset.off = T.offLabel;
            var im = el("img", null, { alt: "", draggable: "false" });
            im.src = a.src;
            t.appendChild(im);
            t.addEventListener("click", function () { if (sel.has(a.src)) sel.delete(a.src); else sel.add(a.src); render(); });
            grid.appendChild(t);
          });
          var cur = picked();
          var shown = assets.filter(function (a) { return !a.hidden; }).length;
          count.textContent = T.count(assets.length, shown, tab === ALL ? "" : tab, shownItems.length, cur.length);
          btn.selall.disabled = shownItems.length === 0 || shownItems.every(function (a) { return sel.has(a.src); });
          btn.selnone.disabled = !cur.length;
          btn.delcat.hidden = tab === ALL;
          lock(!cur.length);
        };
        function addCat() {
          var k = 1;
          while (cats.indexOf(T.newCatPlaceholder(k)) >= 0) k++;
          promptDialog({ title: T.newCatTitle, placeholder: T.newCatPlaceholder(k) }).then(function (name) {
            if (name === null) return;
            return post(api.cats, { add: name }).then(function (d) { tab = name; sel.clear(); applyItems(d); });
          }).catch(fail);
        }
        var setHidden = function (toHidden) {
          var cur = picked();
          if (!cur.length) return;
          if (toHidden && cur.some(function (a) { return a.hidden; })) return fail(T.errMixedHidden);
          if (!toHidden && cur.some(function (a) { return !a.hidden; })) return fail(T.errMixedShown);
          lock(true);
          batch(cur, function (a) { return post(api.update, { src: a.src, hidden: toHidden }); })
            .then(function (d) { sel.clear(); if (d) applyItems(d); else render(); })
            .catch(function (e) { fail(e); return reloadAll(); });
        };
        btn.hide.addEventListener("click", function () { setHidden(true); });
        btn.show.addEventListener("click", function () { setHidden(false); });
        btn.selall.addEventListener("click", function () { assets.filter(inTab).forEach(function (a) { sel.add(a.src); }); render(); });
        btn.selnone.addEventListener("click", function () { sel.clear(); render(); });
        btn.delcat.addEventListener("click", function () {
          if (tab === ALL) return;
          var name = tab;
          confirmDialog({ title: T.deleteCatTitle(name), body: T.deleteCatBody, okText: T.confirmDelete }).then(function (ok) {
            if (!ok) return;
            return post(api.cats, { remove: name }).then(function (d) { tab = ALL; sel.clear(); applyItems(d); });
          }).catch(fail);
        });
        btn.move.addEventListener("click", function () {
          var cur = picked();
          if (!cur.length) return;
          var mm = modal("sm-move-mask", '<div class="sm-modal-title"></div><div class="sm-list"></div>');
          mm.querySelector(".sm-modal-title").textContent = T.moveTitle(cur.length);
          var list = mm.querySelector(".sm-list");
          [""].concat(cats).forEach(function (c) {
            var row = el("button", "sm-row-btn", { type: "button" });
            row.dataset.cat = c;
            row.textContent = c || T.uncategorized;
            row.addEventListener("click", function () {
              mm.remove();
              lock(true);
              batch(cur, function (a) { return post(api.update, { src: a.src, cat: c }); })
                .then(function (d) { sel.clear(); if (d) applyItems(d); })
                .catch(function (e) { fail(e); return reloadAll(); });
            });
            list.appendChild(row);
          });
        });
        btn.remove.addEventListener("click", function () {
          var cur = picked();
          if (!cur.length) return;
          confirmDialog({ title: T.deleteTitle(cur.length), body: T.deleteBody, okText: T.confirmDelete }).then(function (ok) {
            if (!ok) return;
            lock(true);
            return batch(cur, function (a) { return post(api.delete, { src: a.src }); })
              .then(function (d) { sel.clear(); if (d) applyItems(d); else render(); });
          }).catch(function (e) { fail(e); return reloadAll(); });
        });
        file.addEventListener("change", function () {
          var fl = Array.from(file.files || []);
          file.value = "";
          if (!fl.length) return;
          uploading = true;
          render();
          var fd = new FormData();
          fd.append("cat", tab === ALL ? "" : tab); // text field first so the server sees it before the files
          fl.forEach(function (f) { fd.append("images", f, f.name); });
          fetch(api.upload, { method: "POST", body: fd })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || "HTTP " + r.status); return d; }); })
            .then(applyItems)
            .catch(fail)
            .then(function () { uploading = false; render(); });
        });
        render();
        return m;
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      Array.from(activeGestures).forEach(function (end) { try { end(); } catch (_) {} });
      Array.from(openModals).forEach(function (m) { m.remove(); });
      freePtrs.clear();
      freeStart = null;
      freeDrag = null;
      exit();
      clear();
      document.removeEventListener("pointerdown", onDocDownExit, true);
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("pointermove", onDocMove, true);
      document.removeEventListener("pointerup", onDocUp, true);
      document.removeEventListener("pointercancel", onDocUp, true);
      document.removeEventListener("touchmove", onDocTouchMove, { capture: true });
      if (side) side.remove();
      if (layerTop) layerTop.remove();
      if (layerContent) layerContent.remove();
      scroller.classList.remove("sm-scroller", "sm-holding");
      host.classList.remove("sm-editing", "sm-has-selected");
    }

    return {
      enter: enter,
      exit: exit,
      toggle: function () { return editing ? exit() : enter(); },
      clear: clear,
      remount: remount,
      openManager: openManager,
      reloadAssets: function () { return loadAssets(true).then(function () { if (editing) renderPalette(); }); },
      destroy: destroy,
      get editing() { return editing; },
      get count() { return stickers.length; },
    };
  }

  return { create: create, texts: { zh: TEXTS_ZH, en: TEXTS_EN } };
});
