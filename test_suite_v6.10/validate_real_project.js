// Real-project regression guard: loads "LX Network racks.dlux.json" (the user's actual show file,
// 2 racks / 31 connections) into the app, hydrates the Routing canvas with per-node/per-pin
// getBoundingClientRect mocks (same technique as test_orthogonal_wires.js section 15), runs
// drawWires(), and asserts every rendered wire is structurally clean: axis-aligned, no
// consecutive-segment reversal, no overlapping collinear segments. routingSVG() changes must not
// disturb any of this (canvas code untouched). Also smoke-runs reportHTML()/routingSVG() on the
// real project.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
const project = JSON.parse(fs.readFileSync(path.join(__dirname, "LX Network racks.dlux.json"), "utf-8"));
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

function parseCmds(d) {
  const re = /([MLQC])([^MLQC]*)/g; let m; const out = [];
  while ((m = re.exec(d))) {
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    out.push({ cmd: m[1], pts });
  }
  return out;
}
function waypointsOf(d) {
  const cmds = parseCmds(d); const wp = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.cmd === "M") wp.push(c.pts[0]);
    else if (c.cmd === "Q") wp.push(c.pts[0]);
    else if (c.cmd === "L" && i === cmds.length - 1) wp.push(c.pts[c.pts.length - 1]);
  }
  return wp;
}
function isAxisAligned(wp) {
  for (let i = 0; i + 1 < wp.length; i++) {
    const dx = Math.abs(wp[i][0] - wp[i + 1][0]), dy = Math.abs(wp[i][1] - wp[i + 1][1]);
    if (dx > 0.05 && dy > 0.05) return false;
  }
  return true;
}
function findReversals(wp) {
  let n = 0;
  for (let i = 0; i + 2 < wp.length; i++) {
    const dx1 = wp[i + 1][0] - wp[i][0], dy1 = wp[i + 1][1] - wp[i][1];
    const dx2 = wp[i + 2][0] - wp[i + 1][0], dy2 = wp[i + 2][1] - wp[i + 1][1];
    const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
    if (l1 < 0.05 || l2 < 0.05) continue;
    if ((dx1 / l1) * (dx2 / l2) + (dy1 / l1) * (dy2 / l2) < -0.95) n++;
  }
  return n;
}
function findCollinearOverlaps(wp) {
  const segs = [];
  for (let i = 0; i + 1 < wp.length; i++) {
    const [x1, y1] = wp[i], [x2, y2] = wp[i + 1];
    if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) < 0.05) continue;
    segs.push({ x1, y1, x2, y2 });
  }
  const overlap = (a1, a2, b1, b2) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > 0.05;
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    const aV = Math.abs(A.x1 - A.x2) < 0.05, bV = Math.abs(B.x1 - B.x2) < 0.05;
    const aH = Math.abs(A.y1 - A.y2) < 0.05, bH = Math.abs(B.y1 - B.y2) < 0.05;
    if (aV && bV && Math.abs(A.x1 - B.x1) < 0.05 && overlap(A.y1, A.y2, B.y1, B.y2)) n++;
    else if (aH && bH && Math.abs(A.y1 - B.y1) < 0.05 && overlap(A.x1, A.x2, B.x1, B.x2)) n++;
  }
  return n;
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));

  // hydrate the real project (same path an Import takes: replace S wholesale, then migrate())
  win.__proj = project;
  win.eval("S = __proj; migrate(); ensureRoutingLayout();");
  const S = win.eval("S");
  assert(S.connections.length === 31, `real project has 31 connections (got ${S.connections.length})`);

  // Rig view, all racks expanded, internal runs shown -- the one canvas configuration where every
  // device node from both racks (and therefore every one of the 31 connections' pins) is on screen at
  // once. (The Routing view is single-rack scoped via S.ui.routingRackOnly and only reaches 21 of 31.)
  win.eval(`S.ui.view = "rig"; S.ui.rigHideInternal = false; S.ui.rigCollapsed = {}; S.ui.routeFilter = { rack: "", cat: "", u: "" }; S.ui.connType = ""; S.ui.selConn = null; render();`);

  // hydrate geometry: jsdom has no layout, so mock rects from each device's own rx/ry
  // (technique from test_orthogonal_wires.js section 15)
  const W = 190;
  const devById = {};
  for (const r of S.racks) for (const d of r.devices) devById[d.id] = d;
  const estH = d => Math.max(60, 30 + (d.ports || []).length * 24);
  const inner = doc.querySelector("#routeInner");
  assert(!!inner, "routing canvas rendered (#routeInner present)");
  inner.getBoundingClientRect = () => ({ top: 0, left: 0, right: 8000, bottom: 8000, width: 8000, height: 8000 });
  const wsvg = doc.querySelector("#wires");
  if (wsvg) wsvg.getBoundingClientRect = () => ({ top: 0, left: 0 });
  doc.querySelectorAll(".node").forEach(n => {
    const dv = devById[n.dataset.dev]; if (!dv) return;
    const h = estH(dv);
    n.getBoundingClientRect = () => ({ top: dv.ry, left: dv.rx, right: dv.rx + W, bottom: dv.ry + h, width: W, height: h });
  });
  doc.querySelectorAll(".pin").forEach(p => {
    const dv = devById[p.dataset.dev]; if (!dv) return;
    const h = estH(dv);
    const gi = Math.max(0, (dv.ports || []).findIndex(g => g.id === p.dataset.g));
    const dir = p.dataset.dir;
    const i = +p.dataset.i || 0;
    let x, y;
    if (dir === "bi") { x = dv.rx + 20 + ((gi * 7 + i * 3) % Math.max(1, W - 40)); y = dv.ry + h; }
    else { x = dir === "out" ? dv.rx + W : dv.rx; y = dv.ry + Math.min(h - 6, 24 + gi * 20 + i * 3); }
    p.getBoundingClientRect = () => ({ top: y - 1, left: x - 1, right: x + 1, bottom: y + 1, width: 2, height: 2 });
  });

  win.eval("drawWires();");
  const paths = [...doc.querySelectorAll("path.wire")];
  assert(paths.length === 31, `all 31 connections render wire paths on the canvas (got ${paths.length})`);
  let clean = 0;
  for (const el of paths) {
    const d = el.getAttribute("d");
    const wp = waypointsOf(d);
    const ok = wp.length >= 2 && isAxisAligned(wp) && findReversals(wp) === 0 && findCollinearOverlaps(wp) === 0;
    if (ok) clean++;
    else console.log("DIRTY wire", el.dataset.id, "axis:", isAxisAligned(wp), "rev:", findReversals(wp), "ovl:", findCollinearOverlaps(wp));
  }
  assert(clean === 31, `31/31 canvas wires structurally clean (axis-aligned, no reversal, no overlap; got ${clean}/31)`);

  // smoke: the reworked print export runs on the real project without throwing and stays orthogonal
  let rsvg = "", threw = false;
  try { rsvg = win.eval("routingSVG()"); } catch (e) { threw = true; console.log("routingSVG threw:", e.message); }
  assert(!threw && rsvg.includes("<svg"), "routingSVG() renders the real project");
  const wireDs = [...rsvg.matchAll(/<path d="([^"]+)" fill="none"/g)].map(m => m[1]);
  assert(wireDs.length > 0 && wireDs.every(d => !/ C /.test(d)), `real-project export wires are all orthogonal, no Bezier (${wireDs.length} wires)`);
  let rep = "", repThrew = false;
  try { rep = win.eval("reportHTML()"); } catch (e) { repThrew = true; console.log("reportHTML threw:", e.message); }
  assert(!repThrew && /Signal flow diagram/.test(rep), "reportHTML() (full Rack Guide) renders the real project with the signal-flow section");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
