/*
 * Update source (GitHub releases) for a packaged app. Off unless the app config sets update.enabled: true; the first release ships
 * without auto-update (no native installer, install() always answers unsupported), and the shell hides the control for
 * unconfigured and unsupported states (kit/shell/update-control.js).
 */
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const ASSET_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);
const UPDATE_METHODS = Object.freeze([
  "kit.update.state",
  "kit.update.check",
  "kit.update.download",
  "kit.update.cancel",
  "kit.update.install",
]);

class UpdateError extends Error {
  constructor(code) {
    super(code);
    this.name = "UpdateError";
    this.code = code;
  }
}

class UpdateSession {
  #nativeConfig;
  #blocked;
  #snapshot;
  #selected = null;
  #controller = null;
  #task = null;
  #downloadedFile = null;
  #currentVersion;
  #platform;
  #arch;
  #cacheRoot;
  #request;

  constructor({
    config,
    currentVersion,
    isPackaged,
    platform = process.platform,
    arch = process.arch,
    cacheRoot,
    request = requestGithub,
  }) {
    this.#nativeConfig = config ? copyNativeConfig(config) : null;
    this.#currentVersion = currentVersion;
    this.#platform = platform;
    this.#arch = arch;
    this.#cacheRoot = cacheRoot;
    this.#request = request;
    this.#blocked = configurationBlock({
      config: this.#nativeConfig,
      currentVersion,
      isPackaged,
      platform,
      arch,
    });
    this.#snapshot = {
      state: this.#blocked?.state || "idle",
      currentVersion: isPackaged ? currentVersion : null,
      releaseVersion: null,
      receivedBytes: 0,
      totalBytes: null,
      progress: null,
      error: null,
      reason: this.#blocked?.reason || null,
      canInstall: false,
    };
  }

  state() {
    return { ...this.#snapshot };
  }
  check() {
    if (this.#blocked || this.#task) return this.state();
    if (this.#downloadedFile) return this.state();
    this.#selected = null;
    this.#change({
      state: "checking",
      error: null,
      reason: null,
      releaseVersion: null,
      receivedBytes: 0,
      totalBytes: null,
      progress: null,
    });
    this.#launch(async (signal) => {
      const token = await readToken(this.#nativeConfig, signal);
      signal.throwIfAborted();
      const url = `https://api.github.com/repos/${this.#nativeConfig.repository}/releases/latest`;
      const response = await this.#request({
        url,
        token,
        signal,
        accept: "application/vnd.github+json",
      });
      if (response.statusCode === 404) {
        response.destroy();
        return this.#change({
          state: "unconfigured",
          reason: "release_not_found_or_private",
        });
      }
      requireSuccess(response);
      const release = JSON.parse(
        await readBounded(response, MAX_METADATA_BYTES),
      );
      signal.throwIfAborted();
      this.#selected = selectRelease({
        release,
        config: this.#nativeConfig,
        currentVersion: this.#currentVersion,
        platform: this.#platform,
        arch: this.#arch,
      });
      if (!this.#selected)
        return this.#change({ state: "idle", reason: "up_to_date" });
      return this.#change({
        state: "available",
        releaseVersion: this.#selected.version,
        totalBytes: this.#selected.sizeBytes,
      });
    }, METADATA_TIMEOUT_MS);
    return this.state();
  }
  download() {
    if (this.#blocked || this.#task || this.#downloadedFile)
      return this.state();
    if (!this.#selected)
      return this.#change({
        state: "error",
        error: "check_required",
        reason: "check_required",
      });
    const approval = this.#nativeConfig.approvedDownload;
    const approved =
      approval?.releaseId === this.#selected.releaseId &&
      approval?.assetId === this.#selected.assetId &&
      approval?.sha256 === this.#selected.sha256;
    if (!approved)
      return this.#change({
        state: "available",
        error: null,
        reason: "download_approval_required",
      });
    this.#change({
      state: "downloading",
      receivedBytes: 0,
      progress: 0,
      error: null,
      reason: null,
    });
    this.#launch(async (signal) => {
      this.#downloadedFile = await downloadAsset({
        selected: this.#selected,
        config: this.#nativeConfig,
        cacheRoot: this.#cacheRoot,
        request: this.#request,
        signal,
        onBytes: (receivedBytes) =>
          this.#change({
            receivedBytes,
            progress: receivedBytes / this.#selected.sizeBytes,
          }),
      });
      signal.throwIfAborted();
      return this.#change({
        state: "downloaded",
        reason: "native_installation_not_configured",
      });
    }, DOWNLOAD_TIMEOUT_MS);
    return this.state();
  }
  async cancel() {
    if (!this.#task) return this.state();
    this.#controller.abort(new UpdateError("cancelled"));
    await this.#task;
    return this.state();
  }
  install() {
    if (this.#blocked || this.#task) return this.state();
    // A renderer claim cannot establish native unsaved-state, signing or restart consent (#108).
    return this.#change({
      state: "unsupported",
      reason: "native_installation_not_configured",
      error: null,
    });
  }
  #change(values) {
    this.#snapshot = { ...this.#snapshot, ...values, canInstall: false };
    return this.state();
  }
  #fail(error) {
    const code = error instanceof UpdateError ? error.code : "update_failed";
    return this.#change({ state: "error", error: code, reason: code });
  }
  #launch(operation, timeoutMs) {
    this.#controller = new AbortController();
    const active = this.#controller;
    const timer = setTimeout(
      () => active.abort(new UpdateError("timeout")),
      timeoutMs,
    );
    this.#task = operation(active.signal)
      .catch((error) => {
        if (active.signal.aborted) {
          if (active.signal.reason?.code === "cancelled")
            return this.#change({
              state: this.#selected ? "available" : "idle",
              receivedBytes: 0,
              progress: null,
              error: null,
              reason: "cancelled",
            });
          return this.#fail(new UpdateError("timeout"));
        }
        return this.#fail(error);
      })
      .finally(() => {
        clearTimeout(timer);
        this.#controller = null;
        this.#task = null;
      });
  }
}

function createUpdater(options) {
  const session = new UpdateSession(options);
  const methods = Object.freeze({
    "kit.update.state": () => session.state(),
    "kit.update.check": () => session.check(),
    "kit.update.download": () => session.download(),
    "kit.update.cancel": () => session.cancel(),
    "kit.update.install": () => session.install(),
  });
  return Object.freeze({ methods, close: () => session.cancel() });
}

function copyNativeConfig(config) {
  return {
    enabled: config.enabled === true,
    repository: config.repository,
    assetPrefix: config.assetPrefix,
    getToken: config.getToken,
    approvedDownload: config.approvedDownload
      ? { ...config.approvedDownload }
      : null,
  };
}

function configurationBlock({
  config,
  currentVersion,
  isPackaged,
  platform,
  arch,
}) {
  if (!config)
    return { state: "unconfigured", reason: "update_source_missing" };
  // First release: no native installer or signed update channel yet, so a source is inert until the app turns updates on.
  if (config.enabled !== true)
    return { state: "unsupported", reason: "auto_update_disabled" };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository || ""))
    return { state: "unconfigured", reason: "invalid_repository" };
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(config.assetPrefix || ""))
    return { state: "unconfigured", reason: "invalid_asset_prefix" };
  if (!isPackaged) return { state: "unsupported", reason: "development_build" };
  if (!parseVersion(currentVersion))
    return { state: "unsupported", reason: "package_version_missing" };
  if (platform !== "darwin" || !["arm64", "x64"].includes(arch))
    return { state: "unsupported", reason: "platform_not_supported" };
  return null;
}

function parseVersion(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  )
    return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function isNewer(version, currentVersion) {
  const next = parseVersion(version),
    current = parseVersion(currentVersion);
  if (!next || !current) throw new UpdateError("invalid_version");
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== current[i]) return next[i] > current[i];
  }
  return false;
}

function selectRelease({ release, config, currentVersion, platform, arch }) {
  if (!release || release.draft !== false || release.prerelease !== false)
    throw new UpdateError("invalid_release");
  if (!Number.isSafeInteger(release.id) || release.id <= 0)
    throw new UpdateError("invalid_release");
  const version =
    typeof release.tag_name === "string"
      ? release.tag_name.replace(/^v/, "")
      : "";
  if (!isNewer(version, currentVersion)) return null;
  if (!Array.isArray(release.assets)) throw new UpdateError("invalid_assets");
  const name = `${config.assetPrefix}-${version}-${platform}-${arch}.zip`;
  const matches = release.assets.filter((asset) => asset.name === name);
  if (matches.length !== 1) throw new UpdateError("platform_asset_missing");
  const asset = matches[0];
  if (
    !Number.isSafeInteger(asset.id) ||
    asset.id <= 0 ||
    asset.state !== "uploaded"
  )
    throw new UpdateError("invalid_asset");
  if (
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > MAX_ASSET_BYTES
  )
    throw new UpdateError("invalid_asset_size");
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || ""))
    throw new UpdateError("asset_hash_missing");
  const expectedUrl = `https://api.github.com/repos/${config.repository}/releases/assets/${asset.id}`;
  if (asset.url !== expectedUrl) throw new UpdateError("invalid_asset_source");
  return Object.freeze({
    version,
    releaseId: release.id,
    assetId: asset.id,
    sizeBytes: asset.size,
    sha256: asset.digest.slice(7),
    url: expectedUrl,
  });
}

function requireSuccess(response) {
  if (response.statusCode === 200) return;
  response.destroy();
  if ([401, 403].includes(response.statusCode))
    throw new UpdateError("forbidden");
  if (response.statusCode === 404)
    throw new UpdateError("asset_not_found_or_private");
  throw new UpdateError("http_error");
}

async function readBounded(response, limitBytes) {
  const chunks = [];
  let sizeBytes = 0;
  for await (const chunk of response) {
    sizeBytes += chunk.length;
    if (sizeBytes > limitBytes) {
      response.destroy();
      throw new UpdateError("metadata_too_large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function downloadAsset({
  selected,
  config,
  cacheRoot,
  request,
  signal,
  onBytes,
}) {
  let directory = null;
  try {
    await fs.promises.mkdir(cacheRoot, { recursive: true, mode: 0o700 });
    directory = await fs.promises.mkdtemp(path.join(cacheRoot, "update-"));
    await fs.promises.chmod(directory, 0o700);
    const partial = path.join(directory, "asset.partial");
    const complete = path.join(directory, "asset.zip");
    const token = await readToken(config, signal);
    signal.throwIfAborted();
    const response = await request({
      url: selected.url,
      token,
      signal,
      accept: "application/octet-stream",
    });
    requireSuccess(response);
    const declared = response.headers["content-length"];
    if (declared !== undefined && String(selected.sizeBytes) !== declared) {
      response.destroy();
      throw new UpdateError("size_mismatch");
    }
    const hash = createHash("sha256");
    let receivedBytes = 0;
    const meter = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > selected.sizeBytes)
          return callback(new UpdateError("size_exceeded"));
        hash.update(chunk);
        onBytes(receivedBytes);
        callback(null, chunk);
      },
    });
    await pipeline(
      response,
      meter,
      fs.createWriteStream(partial, { flags: "wx", mode: 0o600 }),
      { signal },
    );
    signal.throwIfAborted();
    if (receivedBytes !== selected.sizeBytes)
      throw new UpdateError("size_mismatch");
    if (hash.digest("hex") !== selected.sha256)
      throw new UpdateError("hash_mismatch");
    await fs.promises.rename(partial, complete);
    signal.throwIfAborted();
    return complete;
  } catch (error) {
    if (directory)
      await fs.promises.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function readToken(config, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => config.getToken?.())
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function requestGithub({ url, token, signal, accept, redirects = 0 }) {
  const target = new URL(url);
  const valid =
    target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    !target.port &&
    ASSET_HOSTS.has(target.hostname);
  if (!valid || redirects > 3)
    return Promise.reject(new UpdateError("invalid_redirect"));
  const headers = {
    Accept: accept,
    "User-Agent": "desktop-updater",
    "Accept-Encoding": "identity",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  if (token && target.hostname === "api.github.com")
    headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = https.get(target, { headers, signal }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) return reject(new UpdateError("invalid_redirect"));
        let next;
        try {
          next = new URL(location, target).href;
        } catch {
          return reject(new UpdateError("invalid_redirect"));
        }
        resolve(
          requestGithub({
            url: next,
            token: null,
            signal,
            accept,
            redirects: redirects + 1,
          }),
        );
      } else resolve(response);
    });
    req.setTimeout(METADATA_TIMEOUT_MS, () =>
      req.destroy(new UpdateError("timeout")),
    );
    req.on("error", reject);
  });
}

module.exports = { createUpdater, UPDATE_METHODS };
