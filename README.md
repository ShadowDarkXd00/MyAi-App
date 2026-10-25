# ShadowCode

**A pocket-sized AI agent studio for Android.** Bring your own API keys, install skills, and let an agent write files, run real shell commands and preview pages — all on your device. No account, no cloud, no subscription.

<p align="center">
  <b>Chat · Studio (IDE) · Terminal · Skills · Encrypted Vault</b>
</p>

---

## Why it exists

Most mobile "AI" apps are a text box chained to somebody else's backend. ShadowCode is a workspace: the model is a engine you plug in, and the product around it is the thing you actually need on a phone — an editor, a real shell, a preview pane and a library of skills that teach the agent how *you* work.

It was built for live workshops: open the app, add a key, and in under a minute a room full of people is watching an agent build something on-device.

## What's inside

| Screen | What it does |
| --- | --- |
| **Chat** | Streaming agent chat with tool calling, markdown, code blocks, reasoning view, per‑chat skills, model switcher, approval cards for risky actions, searchable chat history |
| **Studio** | File tree, CodeMirror 6 editor (JS/TS/HTML/CSS/JSON/Python/Markdown), save/rename/delete, 4 starter templates (blank, landing, canvas game, workshop slide deck) and a sandboxed live **Preview** that inlines sibling CSS/JS so pages run with no server |
| **Terminal** | Real `/system/bin/sh` in the app workspace (APK) with ANSI colours, history, key bar and quick commands. Emulated shell in the browser preview |
| **Skills** | 14 ready-made skill packs + create your own, import JSON/Markdown, install from a URL, per-chat stacking |
| **Vault** | PIN-encrypted key store (PBKDF2 + AES-256-GCM), 10 provider presets + custom endpoints, connectivity test, auto-lock |
| **Settings** | Theme, accent, radius, text size, haptics, temperature, max agent steps, per-tool auto-approval, system prompt, backup/restore |

### The agent actually does things

The model gets these tools, every one of them hitting the real device:

| Tool | Purpose |
| --- | --- |
| `terminal_run` | Run any shell command in the workspace |
| `file_list` / `file_read` | Inspect the project |
| `file_write` / `file_append` | Create and edit files |
| `file_delete` / `file_mkdir` | Manage the tree |
| `web_fetch` | Pull docs or JSON over HTTPS |
| `preview_html` | Open a built page in the preview pane |
| `skill_install` | Write a reusable skill for later |

Writes, deletes, shell commands and skill installs ask for permission first — unless you mark that tool "always allow" in Settings. The agent loops up to *N* steps (default 4) until the task is finished.

## Install the APK

**Download:** [`apk/ShadowCode-v1.0.2.apk`](apk/ShadowCode-v1.0.2.apk) · ~1.3 MB · signed (APK Signature Scheme v2/v3)
**Checksum:** [`apk/SHA256.txt`](apk/SHA256.txt)

1. Copy the APK to the phone (or download it there).
2. Tap it, allow install from this source, install.
3. Open → set a 6-digit vault PIN → paste an API key → start building.

Requirements: Android 8.0+ (API 26), ~4 MB installed, no Google services needed.

> Every push rebuilds this file from source in GitHub Actions (`Build ShadowCode APK`) and commits it back to the repo, so the APK always matches the code in this branch.

### If it ever refuses to start

v1.0.2 is built to fail loudly instead of silently:

* A **fatal error screen** appears (with a *Copy report* button) if the native shell cannot start.
* A **bootstrap watchdog** built from plain ES5 shows the WebView user-agent if the UI never mounts.
* **Settings → About → Diagnostics** copies device, WebView version, runtime log and the last crash — nothing is uploaded, you paste it wherever you want.

The most common cause on older phones is an out-of-date **Android System WebView**. Update it from the Play Store (or *Settings → Apps → Android System WebView → Update*) and relaunch.

### Supported providers

OpenAI · Anthropic · Google Gemini · OpenRouter · Groq · DeepSeek · Mistral · Together · Ollama / LM Studio (LAN) · **any** OpenAI-compatible endpoint (vLLM, LiteLLM, self-hosted gateways).

> The APK talks to providers directly over the network — no CORS, no proxy. Point it at `http://192.168.x.x:11434/v1` to use a model running on your laptop.

## Build it yourself

The web layer and the native shell live in one repo.

```bash
# 1. web bundle
cd shadowcode
npm install
npm run dev          # http://localhost:5173 — full UI, emulated shell/files

# 2. Android APK
npm run build:android          # builds and copies dist → android/app/src/main/assets/www
cd ../android
gradle assembleRelease         # needs JDK 17 + Android SDK 35
# → app/build/outputs/apk/release/app-release.apk
```

### Tests

```bash
cd shadowcode
npm run test:ui     # 22 checks: every screen, onboarding, PIN pad, vault
                    # encryption round-trip, agent tool-loop, terminal bridge
```

The harness boots the real production bundle in jsdom against a simulated native
bridge — no device or emulator required.

No local SDK? Push a commit — `.github/workflows/build.yml` provisions JDK 17 + SDK 35, builds the web bundle, compiles the APK and uploads `ShadowCode-APK` as an artifact. It also works from **Actions → Build ShadowCode APK → Run workflow**.

Build tuning: `compileSdk 35`, `minSdk 26`, `targetSdk 34`, Java 17, single WebView, ~1.2 MB web bundle emitted as a **classic IIFE** (no `type="module"`) with ES2019 runtime shims, so a WebView that never updated still runs the app.

## Security model

* **Keys never leave the device.** Requests go straight from the phone to the provider you chose.
* The vault is encrypted with a key derived from your PIN using **PBKDF2-HMAC-SHA256 (210 000 iterations)** and sealed with **AES-256-GCM**; the plaintext key material exists in memory only while unlocked.
* Ciphertext lives in app-private storage (`filesDir/vault.bin`), excluded from Android auto-backup.
* No analytics, no crash reporting, no account, no server of ours.
* Forgetting the PIN means re-entering keys — everything else (chats, skills, files) survives.

## Repository layout

```
shadowcode/                 web app (React 19 + Vite + TypeScript, hand-written CSS)
  src/lib/bridge.ts         native bridge + browser fallbacks (fs, shell, http, vault)
  src/lib/providers.ts      OpenAI-compatible / Anthropic / Gemini streaming adapters
  src/lib/agent.ts          system prompt assembly + tool-calling loop
  src/lib/tools.ts          the eight device tools
  src/lib/skills.ts         built-in skill catalogue + import parsing
  src/screens/              Chat, Studio, Terminal, Skills, Settings, Onboarding
android/                    native shell (Java, no UI framework)
  app/src/main/java/app/shadowcode/
    MainActivity.java       WebView host, asset loader, back handling
    Bridge.java             JS↔Java surface: fs, exec, http, device services
    Vault.java              PBKDF2 + AES-GCM key store
```

### Extending

* **New provider** → add a preset in `src/lib/providers.ts` (most are OpenAI-compatible).
* **New tool** → describe it in `TOOLS` (`src/lib/tools.ts`) and it appears to the model automatically, including its approval switch in Settings.
* **New skill** → drop a seed in `src/lib/skills.ts`, or ship a JSON file users can import from a URL.

### Browser preview vs APK

Everything works in the browser preview, with three differences: the shell is emulated (`help` lists the built-ins), files live in `localStorage`, and remote APIs must send CORS headers. In the APK the shell is `/system/bin/sh`, files sit in the app workspace under `/storage/emulated/0/Android/data/app.shadowcode/files/workspace`, and any static binary you drop in `~/bin` (busybox, node, python, git…) runs — no root required.

---

`antiGem-termux-v1.0.13-release.apk` in this repo is the reference build that inspired the feature set; ShadowCode is an independent implementation with its own UI, encryption model and agent loop.
