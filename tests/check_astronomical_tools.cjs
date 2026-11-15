// Verify the real application wiring without fetching a survey or running a GPU.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const badge = { textContent: "" };
  const container = {};
  let mountOptions;
  let syncs = 0;
  const rawRows = [{ id: "9007199254740993123", ra: 10, dec: -20 }];
  const sandbox = {
    assert, console: { warn() {} }, rawRows,
    window: {},
    document: {
      addEventListener() {},
      getElementById: (id) => id === "cds-reference-panel" ? container : badge,
    },
    URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    fetch: async (url) => ({ ok: true, json: async () => url.startsWith("/api/objects")
      ? { objects: [] }
      : { sources: rawRows, truncated: true, service: "Fixture service" } }),
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../static/app.js"), "utf8"), sandbox);
  // Optional component missing or unavailable must not affect the native viewer.
  vm.runInContext("mountAstronomicalReference(); syncAstronomicalReference();", sandbox);
  sandbox.window.PapastronomyAladinReference = {
    mount(target, options) {
      assert.equal(target, container);
      mountOptions = options;
      return { sync() { syncs += 1; } };
    },
  };
  vm.runInContext(`
    mountAstronomicalReference();
    state.ra = 10; state.dec = -20; state.fov = 0.05;
    state.exploreSequence = 5;
    state.exploreData = {};
    state.selectedPixel = { x: 63.5, y: 63.5 };
    state.referenceCatalogs.gaia = { sources: [], sequence: 4 };
  `, sandbox);
  let context = mountOptions.getContext();
  assert.equal(context.gaia, undefined, "A previous field's catalog must be excluded");
  assert.equal(context.selected.ra, 10);
  assert.equal(context.selected.dec, -20);
  await vm.runInContext(`
    mergeNamedObjects = renderNamedObjectsPanel = refreshAIDetectionCatalogLabels = () => {};
    renderContextSkyMap = renderCanvas = updateCatalogSelectionSummary = () => {};
    mergeCatalogSources = () => {};
    state.exploreController = new AbortController();
    loadFieldCatalogs(5);
  `, sandbox);
  context = mountOptions.getContext();
  assert.equal(context.gaia.sources, rawRows, "Keep exact catalog coordinates and identifiers");
  assert.equal(context.gaia.service, "Fixture service");
  assert.equal(context.gaia.truncated, true);
  assert.equal(context.gaia.queryFov, 0.05);
  assert.equal(syncs, 1);
  // Even successful responses must be ignored after a newer exploration starts.
  sandbox.fetch = async () => ({ ok: true, json: async () => {
    vm.runInContext("state.exploreSequence = 6;", sandbox);
    return { sources: rawRows, objects: [] };
  } });
  await vm.runInContext("loadFieldCatalogs(5)", sandbox);
  assert.equal(mountOptions.getContext().gaia, undefined);
  assert.equal(syncs, 1);
  sandbox.window.PapastronomyAladinReference.mount = () => ({ sync() { throw Error("Offline"); } });
  vm.runInContext("mountAstronomicalReference(); syncAstronomicalReference();", sandbox);
  console.log("Application reference wiring: OK (field isolation, raw rows, stale requests, optional failures)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
