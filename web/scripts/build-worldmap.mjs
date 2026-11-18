// Generates lib/worldDots.json: a dot-grid world map (land only), equirectangular, from Natural Earth 110m land.
// Needs (not saved in package.json):  npm i --no-save world-atlas@2 topojson-client@3 d3-geo@3
//   node scripts/build-worldmap.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
const require = createRequire(import.meta.url);
const land = feature(JSON.parse(readFileSync(require.resolve("world-atlas/land-110m.json"), "utf8")), "land");
const STEP = 2.5, LAT_TOP = 78, LAT_BOTTOM = -57;
const rows = [];
for (let lat = LAT_TOP; lat >= LAT_BOTTOM; lat -= STEP) {
  let row = "";
  for (let lon = -180; lon < 180; lon += STEP) row += geoContains(land, [lon + STEP / 2, lat - STEP / 2]) ? "1" : "0";
  rows.push(row);
}
writeFileSync(new URL("../lib/worldDots.json", import.meta.url), JSON.stringify({ step: STEP, latTop: LAT_TOP, latBottom: LAT_BOTTOM, rows }));
console.log(rows.length, "rows x", rows[0].length, "cols,", rows.join("").replace(/0/g, "").length, "land dots");
