// La app de Ciegos (r5c2w8/) pide sus scripts con «?v=…» y el service worker guarda esa versión.
// Si no coinciden, con mala cobertura se podrían mezclar scripts viejos y nuevos. Esta prueba lo vigila.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "r5c2w8");

test("Ciegos: la versión de los scripts es la misma en index.html, tv.html y sw.js", () => {
  const sw = fs.readFileSync(path.join(dir, "sw.js"), "utf8");
  const v = (sw.match(/const V = "([^"]+)"/) || [])[1];
  assert.ok(v, "sw.js no tiene const V");
  for (const f of ["index.html", "tv.html"]) {
    const h = fs.readFileSync(path.join(dir, f), "utf8");
    const usos = [...h.matchAll(/(?:src|href)="\.\.\/(?:zt4k9m\/[a-z\-]+\.(?:js|css)|fx\.(?:js|css))([^"]*)"/g)];
    assert.ok(usos.length, f + ": no carga scripts compartidos");
    usos.forEach(u => assert.equal(u[1], "?v=" + v, `${f}: ${u[0]} no lleva ?v=${v}`));
  }
  // todo lo que la página carga de fuera de r5c2w8/ tiene que estar en la lista que guarda el service worker
  const lista = sw.match(/\[("\.\.\/zt4k9m[\s\S]*?)\]\.map/)[1];
  for (const f of ["index.html", "tv.html"]) {
    const h = fs.readFileSync(path.join(dir, f), "utf8");
    [...h.matchAll(/(?:src|href)="(\.\.\/[^"?]+)\?v=/g)].forEach(u => assert.ok(lista.includes('"' + u[1] + '"'), `${f}: ${u[1]} no está en la lista de sw.js`));
  }
});
