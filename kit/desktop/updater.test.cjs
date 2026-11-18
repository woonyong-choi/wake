const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const syncFs = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable, PassThrough } = require("node:stream");
const { test } = require("node:test");
const vm = require("node:vm");
const { createUpdater } = require("./updater.cjs");

const PAYLOAD = Buffer.from("unit test archive bytes");
const DIGEST = createHash("sha256").update(PAYLOAD).digest("hex");

function release(overrides = {}) {
  return {
    id: 11,
    tag_name: "v1.2.0",
    draft: false,
    prerelease: false,
    assets: [
      {
        id: 22,
        state: "uploaded",
        name: "sample-1.2.0-darwin-arm64.zip",
        size: PAYLOAD.length,
        digest: `sha256:${DIGEST}`,
        url: "https://api.github.com/repos/example/desktop/releases/assets/22",
      },
    ],
    ...overrides,
  };
}

function response(body, statusCode = 200, headers = {}) {
  return Object.assign(
    Readable.from([
      Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)),
    ]),
    { statusCode, headers },
  );
}

async function fixture(t, overrides = {}) {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "updater-test-"));
  const calls = [];
  const options = {
    config: {
      enabled: true,
      repository: "example/desktop",
      assetPrefix: "sample",
      approvedDownload: { releaseId: 11, assetId: 22, sha256: DIGEST },
    },
    currentVersion: "1.1.0",
    isPackaged: true,
    platform: "darwin",
    arch: "arm64",
    cacheRoot,
    request: async (input) => {
      calls.push(input);
      return input.accept === "application/octet-stream"
        ? response(PAYLOAD)
        : response(release());
    },
    ...overrides,
  };
  const updater = createUpdater(options);
  t.after(async () => {
    await updater.close();
    await fs.rm(cacheRoot, { recursive: true, force: true });
  });
  return { methods: updater.methods, calls, cacheRoot, options };
}

async function settled(methods) {
  for (let i = 0; i < 200; i++) {
    const value = methods["kit.update.state"]();
    if (!["checking", "downloading"].includes(value.state)) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail("update operation did not settle");
}

test("update_unconfigured_or_development_build_performs_no_network", async (t) => {
  for (const [options, expected] of [
    [{ config: null }, "unconfigured"],
    [{ isPackaged: false }, "unsupported"],
    [{ platform: "linux" }, "unsupported"],
    [{ currentVersion: "44.7.2-beta" }, "unsupported"],
  ]) {
    const f = await fixture(t, options);
    assert.equal(f.methods["kit.update.check"]().state, expected);
    assert.equal(f.methods["kit.update.download"]().state, expected);
    assert.equal(f.calls.length, 0);
    assert.equal(f.methods["kit.update.install"]().canInstall, false);
  }
});

/* first release: no native installer and no signed update channel, so a configured source still checks and downloads nothing
   until the app turns updates on explicitly (config.enabled === true); the state says why and the shell shows no update control */
test("update_is_disabled_for_the_first_release_unless_explicitly_enabled", async (t) => {
  const f = await fixture(t, {});
  const disabled = await fixture(t, { config: { ...f.options.config, enabled: undefined } });
  for (const name of ["kit.update.state", "kit.update.check", "kit.update.download", "kit.update.install"]) {
    const s = disabled.methods[name]();
    assert.equal(s.state, "unsupported", name);
    assert.equal(s.reason, "auto_update_disabled", name);
    assert.equal(s.canInstall, false);
  }
  assert.equal(disabled.calls.length, 0, "no network");
});

test("update_verified_download_writes_exact_bytes_without_exposing_path_or_token", async (t) => {
  const f = await fixture(t);
  assert.equal(f.methods["kit.update.check"]().state, "checking");
  const available = await settled(f.methods);
  assert.equal(available.state, "available");
  assert.equal(available.releaseVersion, "1.2.0");
  assert.equal(available.totalBytes, PAYLOAD.length);
  assert.equal(f.methods["kit.update.download"]().state, "downloading");
  const done = await settled(f.methods);
  assert.equal(done.state, "downloaded");
  assert.equal(done.receivedBytes, PAYLOAD.length);
  assert.equal(done.progress, 1);
  assert.equal(done.canInstall, false);
  const [directory] = await fs.readdir(f.cacheRoot);
  assert.deepEqual(
    await fs.readFile(path.join(f.cacheRoot, directory, "asset.zip")),
    PAYLOAD,
  );
  assert.deepEqual(await fs.readdir(path.join(f.cacheRoot, directory)), [
    "asset.zip",
  ]);
  assert.deepEqual(Object.keys(done).sort(), [
    "canInstall",
    "currentVersion",
    "error",
    "progress",
    "reason",
    "receivedBytes",
    "releaseVersion",
    "state",
    "totalBytes",
  ]);
  assert.equal(
    f.methods["kit.update.install"]({
      confirmRestart: true,
      unsavedChanges: false,
    }).state,
    "unsupported",
  );
});

test("update_download_requires_native_exact_release_asset_and_hash_approval", async (t) => {
  for (const approvedDownload of [
    null,
    { releaseId: 12, assetId: 22, sha256: DIGEST },
    { releaseId: 11, assetId: 23, sha256: DIGEST },
    { releaseId: 11, assetId: 22, sha256: "0".repeat(64) },
  ]) {
    const f = await fixture(t, {
      config: { enabled: true,
        repository: "example/desktop",
        assetPrefix: "sample",
        approvedDownload,
      },
    });
    f.methods["kit.update.check"]();
    await settled(f.methods);
    assert.equal(
      f.methods["kit.update.download"]().reason,
      "download_approval_required",
    );
    assert.equal(f.calls.length, 1);
    assert.deepEqual(await fs.readdir(f.cacheRoot), []);
  }
});

test("update_metadata_rejects_wrong_platform_version_hash_source_and_size", async (t) => {
  const cases = [
    [
      (r) => {
        r.assets[0].name = "sample-1.2.0-darwin-x64.zip";
      },
      "platform_asset_missing",
    ],
    [
      (r) => {
        r.tag_name = "v1.2.0-rc.1";
      },
      "invalid_version",
    ],
    [
      (r) => {
        r.assets[0].digest = null;
      },
      "asset_hash_missing",
    ],
    [
      (r) => {
        r.assets[0].url = "https://evil.example/archive.zip";
      },
      "invalid_asset_source",
    ],
    [
      (r) => {
        r.assets[0].size = 2 ** 31 + 1;
      },
      "invalid_asset_size",
    ],
    [
      (r) => {
        r.draft = true;
      },
      "invalid_release",
    ],
    [
      (r) => {
        r.prerelease = true;
      },
      "invalid_release",
    ],
  ];
  for (const [mutate, expected] of cases) {
    const r = release();
    mutate(r);
    const f = await fixture(t, { request: async () => response(r) });
    f.methods["kit.update.check"]();
    assert.equal((await settled(f.methods)).error, expected);
  }
});

test("update_equal_or_older_version_is_not_available", async (t) => {
  for (const version of ["v1.1.0", "v1.0.9"]) {
    const f = await fixture(t, {
      request: async () => response(release({ tag_name: version })),
    });
    f.methods["kit.update.check"]();
    const value = await settled(f.methods);
    assert.equal(value.state, "idle");
    assert.equal(value.releaseVersion, null);
    assert.equal(value.reason, "up_to_date");
  }
});

test("update_failed_download_cleans_partial_and_allows_retry", async (t) => {
  for (const [body, headers, expected] of [
    [Buffer.alloc(PAYLOAD.length), {}, "hash_mismatch"],
    [PAYLOAD.subarray(1), {}, "size_mismatch"],
    [Buffer.alloc(PAYLOAD.length + 1), {}, "size_exceeded"],
    [PAYLOAD, { "content-length": "9999" }, "size_mismatch"],
  ]) {
    let corrupt = true;
    const f = await fixture(t, {
      request: async (input) =>
        input.accept !== "application/octet-stream"
          ? response(release())
          : response(corrupt ? body : PAYLOAD, 200, corrupt ? headers : {}),
    });
    f.methods["kit.update.check"]();
    await settled(f.methods);
    f.methods["kit.update.download"]();
    assert.equal((await settled(f.methods)).error, expected);
    assert.deepEqual(await fs.readdir(f.cacheRoot), []);
    corrupt = false;
    f.methods["kit.update.download"]();
    assert.equal((await settled(f.methods)).state, "downloaded");
  }
});

test("update_stream_progress_is_real_and_cancellation_releases_lock_and_partial", async (t) => {
  let stream;
  let downloadCalls = 0;
  const f = await fixture(t, {
    request: async (input) => {
      if (input.accept !== "application/octet-stream")
        return response(release());
      downloadCalls++;
      stream = Object.assign(new PassThrough(), {
        statusCode: 200,
        headers: {},
      });
      return stream;
    },
  });
  f.methods["kit.update.check"]();
  await settled(f.methods);
  f.methods["kit.update.download"]();
  for (let i = 0; !stream && i < 100; i++)
    await new Promise((resolve) => setImmediate(resolve));
  stream.write(PAYLOAD.subarray(0, 5));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.methods["kit.update.state"]().receivedBytes, 5);
  assert.equal(f.methods["kit.update.state"]().progress, 5 / PAYLOAD.length);
  assert.equal(f.methods["kit.update.check"]().state, "downloading");
  assert.equal(f.methods["kit.update.download"]().state, "downloading");
  assert.equal(downloadCalls, 1);
  const cancelled = await f.methods["kit.update.cancel"]();
  assert.equal(cancelled.state, "available");
  assert.equal(cancelled.reason, "cancelled");
  assert.equal(cancelled.receivedBytes, 0);
  assert.deepEqual(await fs.readdir(f.cacheRoot), []);
  assert.equal(f.methods["kit.update.download"]().state, "downloading");
  await f.methods["kit.update.cancel"]();
  assert.deepEqual(await fs.readdir(f.cacheRoot), []);
});

test("update_errors_are_sanitized_and_private_release_is_not_up_to_date", async (t) => {
  for (const [status, state, reason] of [
    [401, "error", "forbidden"],
    [403, "error", "forbidden"],
    [404, "unconfigured", "release_not_found_or_private"],
  ]) {
    const f = await fixture(t, {
      request: async () => response("secret response body", status),
    });
    f.methods["kit.update.check"]();
    const value = await settled(f.methods);
    assert.equal(value.state, state);
    assert.equal(value.reason, reason);
    assert.doesNotMatch(JSON.stringify(value), /secret response/);
  }
  const f = await fixture(t, {
    request: async () => {
      throw new Error("secret token and local path");
    },
  });
  f.methods["kit.update.check"]();
  assert.equal((await settled(f.methods)).error, "update_failed");
  assert.doesNotMatch(
    JSON.stringify(f.methods["kit.update.state"]()),
    /secret token/,
  );
});

test("update_oversized_metadata_is_bounded", async (t) => {
  const f = await fixture(t, {
    request: async () => response(Buffer.alloc(2 * 1024 * 1024 + 1)),
  });
  f.methods["kit.update.check"]();
  assert.equal((await settled(f.methods)).error, "metadata_too_large");
});

function transportUpdater({ respond, timeoutMs }) {
  const calls = [];
  const transport = {
    get(url, options, receive) {
      calls.push({ url: url.href, headers: { ...options.headers } });
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.destroy = (error) => req.emit("error", error);
      queueMicrotask(() => receive(respond(calls.length, options)));
      return req;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    syncFs.readFileSync(path.join(__dirname, "updater.cjs"), "utf8"),
    {
      module,
      require: (name) => (name === "node:https" ? transport : require(name)),
      process,
      Buffer,
      URL,
      AbortController,
      setTimeout: (callback, ms) => setTimeout(callback, timeoutMs || ms),
      clearTimeout,
    },
  );
  return { create: module.exports.createUpdater, calls };
}

test("update_official_redirect_strips_authorization_and_nonofficial_redirect_is_rejected", async (t) => {
  for (const host of [
    "release-assets.githubusercontent.com",
    "evil.example",
    "api.github.com.evil.example",
    "api.github.com:8443",
    "user:password@api.github.com",
  ]) {
    const transport = transportUpdater({
      respond: (count) =>
        count === 1
          ? response(null, 302, { location: `https://${host}/file` })
          : response(release()),
    });
    const f = await fixture(t);
    const u = transport.create({
      ...f.options,
      request: undefined,
      config: { ...f.options.config, getToken: () => "synthetic-unit-token" },
    });
    t.after(() => u.close());
    u.methods["kit.update.check"]();
    const value = await settled(u.methods);
    assert.equal(
      transport.calls[0].headers.Authorization,
      "Bearer synthetic-unit-token",
    );
    if (host === "release-assets.githubusercontent.com") {
      assert.equal(transport.calls.length, 2);
      assert.equal(transport.calls[1].headers.Authorization, undefined);
      assert.equal(value.state, "available");
    } else {
      assert.equal(transport.calls.length, 1);
      assert.equal(value.error, "invalid_redirect");
    }
  }
});

test("update_stalled_download_times_out_and_cleans_partial", async (t) => {
  const transport = transportUpdater({
    timeoutMs: 25,
    respond: (count) =>
      count === 1
        ? response(release())
        : Object.assign(new PassThrough(), { statusCode: 200, headers: {} }),
  });
  const f = await fixture(t);
  const u = transport.create({ ...f.options, request: undefined });
  t.after(() => u.close());
  u.methods["kit.update.check"]();
  await settled(u.methods);
  u.methods["kit.update.download"]();
  const value = await settled(u.methods);
  assert.equal(value.error, "timeout");
  assert.equal(value.canInstall, false);
  assert.deepEqual(await fs.readdir(f.cacheRoot), []);
});

test("update_cancel_pending_native_credential_prevents_late_network_and_allows_retry", async (t) => {
  let resolveToken;
  const f = await fixture(t, {
    config: { enabled: true,
      repository: "example/desktop",
      assetPrefix: "sample",
      getToken: () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    },
  });
  f.methods["kit.update.check"]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await f.methods["kit.update.cancel"]()).reason, "cancelled");
  resolveToken("synthetic-unit-token");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.length, 0);
  assert.equal(f.methods["kit.update.check"]().state, "checking");
  await f.methods["kit.update.cancel"]();
});

test("update_network_stream_failure_cleans_partial_and_hides_transport_secrets", async (t) => {
  const f = await fixture(t, {
    request: async (input) => {
      if (input.accept !== "application/octet-stream")
        return response(release());
      return Object.assign(
        new Readable({
          read() {
            this.destroy(new Error("synthetic transport secret"));
          },
        }),
        { statusCode: 200, headers: {} },
      );
    },
  });
  f.methods["kit.update.check"]();
  await settled(f.methods);
  f.methods["kit.update.download"]();
  const value = await settled(f.methods);
  assert.equal(value.error, "update_failed");
  assert.doesNotMatch(JSON.stringify(value), /synthetic transport secret/);
  assert.deepEqual(await fs.readdir(f.cacheRoot), []);
});
