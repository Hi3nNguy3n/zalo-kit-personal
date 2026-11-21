// Copy các file tĩnh (icon .svg) sang thư mục dist/ sau khi tsc build,
// vì tsc chỉ compile .ts, không copy các file khác.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "nodes", "zalo.svg");
const DEST = path.join(__dirname, "..", "dist", "nodes", "zalo.svg");

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(`Copied icon: ${SRC} -> ${DEST}`);
