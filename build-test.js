#!/usr/bin/env node
/**
 * build-test.js — Word Cloud by TCViz
 *
 * Empaqueta una build de PRUEBA: añade "_test" al guid, llama a `pbiviz package` y
 * restaura pbiviz.json al salir, pase lo que pase. Con el guid real, Power BI Desktop
 * serviría la versión instalada desde AppSource y no la tuya.
 *
 * El visual es gratuito: no hay licencia que forzar, solo el guid.
 *
 *   node build-test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PBIVIZ_JSON = path.join(__dirname, "pbiviz.json");
const orig = fs.readFileSync(PBIVIZ_JSON, "utf8");

let restored = false;
const restore = () => {
    if (restored) return;
    fs.writeFileSync(PBIVIZ_JSON, orig, "utf8");
    restored = true;
    console.log("✅ pbiviz.json restaurado.");
};
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(1); });
process.on("SIGTERM", () => { restore(); process.exit(1); });

const json = JSON.parse(orig);
if (json.visual.guid.endsWith("_test")) {
    console.error("❌ El guid ya termina en _test: restaura pbiviz.json antes de seguir.");
    process.exit(1);
}
json.visual.guid += "_test";
json.visual.displayName += " (test)";
fs.writeFileSync(PBIVIZ_JSON, JSON.stringify(json, null, 2) + "\n", "utf8");

try {
    // Opciones extra a pbiviz, p. ej. --verbose para ver las funciones opcionales que faltan.
    const extra = process.argv.slice(2).join(" ");
    execSync(("npx pbiviz package " + extra).trim(), { stdio: "inherit", cwd: __dirname });
    console.log("✅ Build de TEST completada. El .pbiviz está en dist/");
} catch (e) {
    console.error("❌ La build ha fallado.");
    process.exitCode = 1;
} finally {
    restore();
}
