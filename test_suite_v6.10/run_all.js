// Runs every test_*.js file in this folder against a build, aggregating pass/fail counts.
// Usage: node run_all.js [path-to-build.html]
//   - With no argument, auto-picks the newest "DLux Rackmaster *.html" file in the parent folder
//     (i.e. wherever this suite lives inside Projects/DLux Rackmaster/) so it stays useful as new
//     builds ship, instead of hardcoding one filename that goes stale.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function newestBuildInParent() {
  const dir = path.join(__dirname, "..");
  const candidates = fs.readdirSync(dir)
    .filter(f => /^DLux[ _]Rackmaster[ _].*\.html$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return candidates.length ? path.join(dir, candidates[0].f) : null;
}

const target = process.argv[2] || newestBuildInParent();
if (!target || !fs.existsSync(target)) {
  console.error("No build found. Pass a path explicitly: node run_all.js <path-to-build.html>");
  process.exit(1);
}
console.log("Testing against:", target);
const files = fs.readdirSync(__dirname)
  .filter(f => f.startsWith("test_") && f.endsWith(".js"))
  .sort();

let anyFail = false;
for (const f of files) {
  console.log(`\n--- ${f} ---`);
  try {
    const out = execFileSync("node", [path.join(__dirname, f), target], { encoding: "utf-8" });
    process.stdout.write(out);
  } catch (e) {
    anyFail = true;
    process.stdout.write(e.stdout || "");
    console.error(`✗ ${f} crashed or had failing assertions`);
  }
}
console.log(anyFail ? "\n=== ONE OR MORE SUITES FAILED ===" : "\n=== ALL SUITES GREEN ===");
process.exit(anyFail ? 1 : 0);
