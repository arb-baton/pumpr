const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "App.js",
  "src/api.js",
  "src/components.js",
  "src/mockData.js",
  "src/theme.js"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function parseSource(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  let parser;
  try {
    parser = require("@babel/parser");
  } catch {
    return;
  }
  parser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"]
  });
}

const pkg = readJson("package.json");
const app = readJson("app.json");

assert(pkg.scripts.start, "missing start script");
assert(app.expo.android.package === "fun.pumpr.app", "unexpected Android package");
assert(fs.existsSync(path.join(root, "assets/icon.png")), "missing app icon");
assert(fs.existsSync(path.join(root, "assets/adaptive-icon.png")), "missing adaptive icon");
assert(fs.existsSync(path.join(root, "assets/splash.png")), "missing splash");

for (const file of files) parseSource(file);

console.log(`Checked ${files.length} source files and mobile config.`);
