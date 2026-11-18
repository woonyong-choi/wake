<p align="center">
  <img src="apps/wake/assets/icon/icon.png" alt="Wake logo" height="80">
</p>

<h1 align="center">Wake</h1>

<p align="center">
  Kubernetes incident workbench for on-call SREs (Electron desktop app)<br>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a><br>
  <a href="README.md">한국어</a> | English
</p>

> [!NOTE]
> In development. There are no releases; run the source directly.

## Quick start

You need Git, Node.js (with `npx`), and a kubeconfig that can read your cluster. The commands below were checked on macOS with Node.js 26.

```sh
git clone https://github.com/woonyong-choi/wake.git
cd wake/apps/wake
KUBECONFIG=/path/to/kubeconfig npx -y electron@44.7.2 .
```

The first run has three steps.

1. The cluster step reads the contexts in the kubeconfig and checks the connection. On the test cluster `wake-lab` it showed `wake-lab connected` and `v1.36 · Node 3`.
2. The AI step connects a subscription CLI or an API key. To use Wake without AI, select `Continue without AI`.
3. The defaults step sets the default AI permission (`Read only`), the language, and the theme. Select `Start`.

Wake then opens the cluster home. The home shows the node count, problem Pods, warning events in the last hour, open incidents, CPU and memory usage, and the Pod state flow, and it leads to the Resources, Network, GitOps, Events, Logs, Alerts, and Incidents screens. Metrics, logs, and alerts fill in only when the cluster has tools such as Prometheus, Loki, and Alertmanager, and a source that Wake cannot reach shows as `Not connected`.

Close the app and run the same command again: Wake skips the first run and opens the saved cluster home.

## Why

When an alert fires, the on-call SRE moves between kubectl, Prometheus, Loki, Alertmanager, and Argo CD and matches the same target and time by hand. Wake reads the APIs of these tools, links their views by the same resource and time range in one desktop app, and records the path from detection through investigation and proposed actions to a person's approval decision in one incident.

kubectl and each tool's web UI show the same data. Wake runs no separate collection server and only reads the existing tools' APIs, so it does not create data the tools do not have. What Wake adds is the round trip between views, the incident and evidence record, and an audit record of what the AI read and what it returned.

## How it works

1. Wake connects to the cluster with your kubeconfig, checks reachability, authentication, and Pod read permission, and then registers the cluster. Raw credentials such as tokens and keys are encrypted with Electron safeStorage, and the settings keep only a reference.
2. Wake queries the Kubernetes API and the connected observability tools (Prometheus, Alertmanager, Loki, Argo CD, OpenCost) with read requests. Wake does not store Secret values and does not pass them to the AI.
3. If you choose, Wake installs wake-agent with Helm into the `wake-system` namespace from inside the app. wake-agent is a DaemonSet that watches Nodes and Pods and leaves a heartbeat per Node as a Lease. The image is `ghcr.io/woonyong-choi/wake-agent:0.1.0` (amd64, arm64), and the chart is in `apps/wake/desktop/agent-install-charts/wake-agent-only`.
4. The hub inside the app keeps incidents, evidence snapshots, audit records, approval decisions, and AI conversations in the app data folder on your computer. The default retention is 90 days for incidents (after resolution), evidence, audit records, and approval decisions, 365 days for conversations, and 7 days for Events.
5. When an AI is connected, it reads only the allowed scope through the same tool layer and only analyzes and proposes actions. A person allows or rejects each proposed change in the approval panel, and neither the AI nor an external client can approve in place of a person.

Wake has no sign-up and no Wake account, contains no code that sends usage statistics, and has update checks turned off. When you connect an AI provider, Wake masks the question and the allowed tool results and then sends them to that provider. The MCP and HTTP server for external AI clients is off by default and, when turned on, listens only on `127.0.0.1`.

The full design is in [Architecture](spec/architecture.md), storage classes and retention are in [Data policy](spec/data-policy.md), and permission boundaries are in [Security and permissions](spec/security.md).

## Status

Available now: the cluster home, Resources, Network, GitOps, Events, Logs, Alerts, Incidents, per-tool views (Prometheus, Alertmanager, Argo CD, Loki), Agents, Costs, the AI panel, the terminal, and reports. AI conversations run with a Claude API key and with the subscription CLIs (`claude`, `codex`, `gemini`). OpenAI and Gemini API keys are only checked and are not used for conversations.

- There is no feature that carries out an approved action or creates a Draft PR. Wake records only the approval decision.
- There is no signed and notarized release. `node kit/tools/package.mjs --app wake --unsigned` builds an unsigned DMG, but Gatekeeper blocks it on other Macs.
- Running from source was checked only on macOS. Windows and Linux were not checked.
- The terminal opens only when the optional `kit` dependency `node-pty` is installed.

The remaining work is in the [task list](spec/tasks.md). Before 1.0, settings and storage formats can change without notice.

## Documentation

The design documents are written in Korean.

- [Spec](spec/README.md)
  - [Product flows](spec/product.md)
  - [Architecture](spec/architecture.md)
  - [Security and permissions](spec/security.md)
  - [Data policy](spec/data-policy.md)
  - [Task list](spec/tasks.md)
- [kit](kit/README.md)

[All documents](spec/README.md#목차)

## Development

```sh
npm --prefix kit ci
node kit/tools/build-native.mjs
node kit/tools/package.mjs --app wake --unsigned
node kit/tools/check-tests.mjs
node kit/tools/check-deps.mjs
node kit/tools/unused-check.mjs
```

The remaining checks and the commit format are in the [contributing guide](.github/CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
