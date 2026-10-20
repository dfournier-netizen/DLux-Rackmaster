const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass=0, fail=0;
function assert(c,l){ if(c){pass++;} else {fail++; console.log("FAIL:",l);} }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 100));

  // structural checks: the theme-aware alias chain exists in the actual served stylesheets
  const mainCss = [...doc.querySelectorAll("style")][0].textContent;
  assert(mainCss.includes("--rm-legx:var(--legx)"), "main stylesheet aliases --rm-legx to the theme-switched --legx");
  assert(/\:root\{[^}]*--legx:#125a9c/.test(mainCss.replace(/\n/g,"")), "light theme (:root) defines a darkened --legx for contrast");
  assert(/\[data-theme="dark"\]\{[^}]*--legx:#4aa3e0/.test(mainCss.replace(/\n/g,"")), "dark theme keeps the original vibrant --legx");

  const rpStyle = doc.getElementById("rpTpl").content.querySelector("style").textContent;
  assert(rpStyle.includes("var(--rm-legx,#4aa3e0)"), "RIGPOWER shadow stylesheet now reads --rm-legx instead of a hardcoded color");
  assert(!/--legX:#4aa3e0;\s*--legY/.test(rpStyle), "old hardcoded leg-color line is gone");

  // theme toggle actually flips document.documentElement's data-theme attribute (verifies the mechanism this depends on)
  win.eval(`S.ui.theme = "light"`); win.render();
  assert(doc.documentElement.dataset.theme === "light", "light theme sets data-theme=light on <html>");
  win.eval(`S.ui.theme = "dark"`); win.render();
  assert(doc.documentElement.dataset.theme === "dark", "dark theme sets data-theme=dark on <html>");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
