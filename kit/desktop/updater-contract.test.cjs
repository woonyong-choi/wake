const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createUpdater, UPDATE_METHODS } = require("./updater.cjs");

function serviceBoundary() {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("ipcMain.handle('kit:service:call',");
  const end = source.indexOf("ipcMain.on('kit:settings:load'", start);
  const handlers = new Map();
  const shell = { id: 1, mainFrame: {} },
    page = { id: 2, mainFrame: {} },
    tool = { id: 3, mainFrame: {} };
  const calls = [];
  const updater = createUpdater({ currentVersion: "0.0.0", isPackaged: false });
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    byContents: new Map([
      [2, { W: { tabs: new Map([["page", { tool: false }]]) }, tabId: "page" }],
      [3, { W: { tabs: new Map([["tool", { tool: true }]]) }, tabId: "tool" }],
    ]),
    shellOf: (e) => e.sender === shell,
    updater,
    UPDATE_METHODS,
    serviceOwners: { capture: () => null },
    saveFile: (args) => ({ saved: args }),
    services: {
      "app.read": (args) => {
        calls.push(args);
        return { read: true };
      },
      "kit.update.inject": () => {
        throw new Error("reserved name delegated");
      },
    },
  });
  const call = (sender, name, args, senderFrame = sender.mainFrame) =>
    handlers.get("kit:service:call")({ sender, senderFrame }, name, args);
  return { shell, page, tool, call, calls };
}

test("service_update_builtins_are_shell_main_frame_only", async () => {
  const f = serviceBoundary();
  for (const method of UPDATE_METHODS) {
    assert.equal((await f.call(f.shell, method)).state, "unconfigured");
    for (const sender of [f.page, f.tool, { id: 99, mainFrame: {} }])
      await assert.rejects(f.call(sender, method), /sender not allowed/);
    await assert.rejects(
      f.call(f.shell, method, undefined, {}),
      /sender not allowed/,
    );
  }
});

test("service_update_rejects_renderer_url_path_command_and_consent_claims", async () => {
  const f = serviceBoundary();
  for (const args of [
    { url: "https://evil.example" },
    { path: "/tmp/file" },
    { command: "sudo anything" },
    { confirmRestart: true, unsavedChanges: false },
    [],
    "anything",
  ]) {
    await assert.rejects(
      f.call(f.shell, "kit.update.install", args),
      /update arguments not allowed/,
    );
  }
  await assert.rejects(
    f.call(f.shell, "kit.update.inject"),
    /unknown update service/,
  );
  assert.deepEqual(await f.call(f.page, "app.read", {}), { read: true });
  assert.equal(f.calls.length, 1);
});
