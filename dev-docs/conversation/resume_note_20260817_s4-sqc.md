> **To resume:** `/skill:takeover sqc` (pi, has the takeover skill) — or, any agent:
> read this note top-to-bottom, then `AGENTS.md` + the docs it links, then
> `git log`/`git status` for drift since 20260817, re-run the checks named
> below, and continue. Code is truth; this note is a stale map.

# `sideQueryWithCache`: fork published, Node harness + `/btw` green; try concise TTS digest

## State

The cache-aware detached side-query core is committed on `sideQueryWithCache`, pushed to Grey's GitHub fork, built into an immutable local Node release, and exercised through the separate `/btw` plugin against a real provider. The ordinary global `pi` remains untouched as fallback. Grey will restart future-me in a new harness that includes the modified core and `/btw`; first verify that harness, then explore a plugin that sends a quick **maximum-10-word** summary to the existing text-to-speech server. The likely home is `pi-voice-command`, which already owns authenticated MQTT publication and echo suppression, but that product decision is not final.

*we search not what masters of old have found; we search for what they searched for*

## What shipped this session

### Core fork

- **Committed/pushed** the provider-independent side-query implementation to `https://github.com/jerzydziewierz/pi.git`, branch `sideQueryWithCache`.
- **Published contract:** `Agent.sideQuery()` and extension `ctx.sideQuery()` support `settled` and cache-prefix-preserving `latest`; no transcript writes, agent loop, or tool execution; cancellation/reload/shutdown are coordinated.
- **Added** `ctx.fork({ appendMessages })` and side-query payload-hook attribution/warnings.
- **Built** a full unpublished local release and retained the official global Pi as fallback.

### `/btw`

- **Added/committed** standalone nested repo `pi-btw` with `/btw <question>` and reopen-latest behavior.
- **Verified** idle `settled` and live `latest` modes against a real provider, including provider cache reads and unchanged main session history.
- **Added** private `/tmp/btw_<timestamp>_<id>.md` output (`0600`) and `zed --existing` with fallback.
- **Rejected** `toolUse` results rather than executing tools or presenting partial output.

### Voice/TTS

- **Hardened/committed** `pi-voice-command`: exact extension entrypoint, optional spoken output, MQTT credentials, Piper voice/language selection, Markdown cleaning/chunking, playback status, and Jabra echo suppression.
- **Kept** output disabled by default. Current `/voice output on` speaks the cleaned full assistant response after `agent_settled`; concise digest is not implemented.

### Operations

- **Created** `/home/mib07150/.pi/agent/skills/update-pi-fork/SKILL.md`; Pi discovers it without diagnostics. `/skill:update-pi-fork` documents weekly upstream merges, tests, immutable deployment, rollback, and required retirement when upstream gains an equivalent API.
- **Removed** the abandoned `context-mode` checkout/gitlink and discarded its local staged report. Treat that alternative approach as failed.
- **Filed** `dev-docs/bug-report-bun-compiled-external-extension-dependencies.md` with a fresh Pi reproduction and a minimal non-Pi Bun reproducer.
- **Cleaned** all strand scratch under `/tmp`: the large patch, minimal repro, capability probe, targeted tsconfig, and five smoke-generated `/tmp/btw_*.md` files.
- **Archived** s3-sqc.

## Canonical locations

```text
Outer repo:
/home/mib07150/git/zfs/git/private/pi-plugins

Pi fork worktree/submodule:
/home/mib07150/git/zfs/git/private/pi-plugins/pi-src
  origin   https://github.com/jerzydziewierz/pi.git
  upstream https://github.com/earendil-works/pi.git
  branch   sideQueryWithCache
  feature/deployment anchor a01f942cb73d78e348c801179d184b684d645b66

BTW plugin:
/home/mib07150/git/zfs/git/private/pi-plugins/pi-btw

Voice/TTS extension:
/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command

Modified release:
/home/mib07150/.local/share/pi-local-release/side-query-cache-a01f942cb

Modified launchers:
.../side-query-cache-a01f942cb/pi-sqc
.../side-query-cache-a01f942cb/pi-sqc-btw

Actual modified Node CLI:
.../side-query-cache-a01f942cb/node/pi

Untouched global fallback:
/home/mib07150/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi
  -> .../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
```

Recommended pre-restart manual command was:

```bash
/home/mib07150/.local/share/pi-local-release/side-query-cache-a01f942cb/pi-sqc-btw
```

Grey says the next harness will have core + `/btw` included. Discover its actual executable/extensions rather than assuming the old launcher remains authoritative.

## What I need to remember

### Side-query invariants and footguns

- Cache reuse is the primary invariant. `latest` reuses the exact most recently dispatched provider message/tool prefix and runs `convertToLlm` only on the new side-query suffix. Do not merge adjacent user messages or rerun whole-context transforms.
- `settled` requires idle at invocation and runs the normal semantic transform/conversion path. It does not reserve the lifecycle while request setup starts.
- Side queries are transcript-detached but session-owned. Their streams belong to the plugin. `abort()`/reload/quit terminate and await them.
- Side queries do not count toward normal `isIdle()`/`waitForIdle()`. Do not start/await them in `session_shutdown`; that can deadlock plugin cleanup.
- Tools remain in the provider request to preserve the cached prefix, but there is no Agent loop and no tool executes. Consumers must handle `stopReason === "toolUse"` explicitly.
- `before_provider_request` handlers still run. Replacements warn conservatively because they may disturb cache reuse; recursive side queries from provider hooks remain plugin misuse.
- The current API uses the session's current model. It has no per-side-query model override. A proposed dedicated tiny model such as the stale README's `gpt-5.6-luna` cannot be selected through `ctx.sideQuery()` without extending core or bypassing it.

### `/btw`

- Mode choice: `ctx.isIdle() ? "settled" : "latest"`.
- Prompt forbids tools and continuing/changing the main task. Maximum response budget is currently 4096 tokens.
- `/btw` is a nested git repository at commit `70ac70b`, but has **no remote**.
- Outer tracks `pi-btw` as a gitlink without a `.gitmodules` mapping. Consequently `git submodule status` at outer root currently fails with `no submodule mapping found in .gitmodules for path 'pi-btw'`. Do not mistake that for `pi-src` corruption. Publishing `pi-btw` and fixing its gitlink metadata remain undone.

### Bun limitation

- Bun 1.3.14 ordinary runtime resolves/imports `mqtt`, but a `bun build --compile` host dynamically importing an external extension cannot resolve that extension's package dependencies.
- Fresh standalone Pi error:
  `Cannot find module 'string_decoder/' from '.../readable-stream/lib/internal/streams/readable.js'`.
- Fresh minimal compiled-host error:
  `Cannot find package 'mqtt' from '.../pi-voice-command/extensions/voice.ts'`.
- Use the isolated Node release for dependency-bearing extensions. Do not replace the global fallback with the Bun executable. Read the bug report before investigating.

### Concise TTS candidate

- Grey's latest idea supersedes the specificity of `pi-voice-command/README.md`'s old “one or two sentences from the last four messages using a small model” plan: explore a **quick, maximum-10-word summary** sent to the TTS server.
- Existing voice extension already has everything after summarization: `speak()`, cleaning/chunking, `tts/speak`, QoS 1 IDs, TTS status tracking, directional credentials, and STT echo suppression. Avoid duplicating this plumbing in another plugin unless separation has a clear benefit.
- Likely trigger is `agent_settled`; issue a `settled` side query only when voice output/digest mode is enabled, await its one response, reject tool use/error/abort, enforce the word cap locally, then feed plain text to `speak()`.
- Verify that `ctx.sideQuery(..., { mode: "settled" })` is legal inside the `agent_settled` callback in the current runtime. It should be, but this exact path has not been implemented/tested.
- `maxTokens` is not a word cap. Prompt for at most 10 words and add deterministic local validation/truncation or reject/retry policy. Avoid retrying by default: it costs latency and tokens.
- Decide what “summary” summarizes: just the final assistant response, the completed turn, or the current task/result. Side-query full context is available, but a narrow instruction should emphasize the latest completed assistant turn.
- Decide whether digest replaces current full-response speech, becomes a separate `/voice output digest` mode, or lives in a new plugin. Current full output works and must not be silently removed.
- Gate the side query before it starts when output is off or TTS is disconnected. This avoids model cost with nowhere to speak.
- Keep it plain text/no Markdown/no tools. Consider an even smaller `maxTokens` (for example 32–64), but measure provider stop behavior and latency.
- A side query does not emit a normal assistant transcript message, so it should not retrigger `agent_settled`; still add a regression test against recursion/double speech.
- Real end-to-end checks require TTS credentials, broker `orin1:1883`, `tts/speak`/`tts/status`, and physical Jabra behavior. Unit-test summarization result handling separately from MQTT.

### Operations

- Global `pi` staying operational was a hard requirement. Build future updates in a new SHA-named directory and preserve the prior release for rollback.
- Use `/skill:update-pi-fork` for weekly updates. Default workflow merges updated `main` into `sideQueryWithCache` without rewriting published history, runs focused/full tests, pushes the fork branch, builds a new Node release, smoke-tests, then updates the outer gitlink.
- Before carrying the patch weekly, inspect upstream for equivalent semantics. If upstream ships them, adapt `/btw`, deploy upstream, stop custom maintenance, and retire/delete the fork after successful migration and explicit destructive confirmation.
- `sideQueryWithCache` is now synchronized with its GitHub remote. No Codeberg remote exists.
- Outer `pi-plugins` has no configured remote. The global `update-pi-fork` skill is outside these repos and therefore not committed here.

### Parallel strands

- Live handover notes remain in `pi-fable-tools` (`ft`), `pi-staan-search` (`ss`), and `stt-challenge-2` (`stt2`). They were read and left untouched; none interferes with `sqc`.
- `pi-src/dev-docs/conversation/memories/` does not currently exist, so there were no sqc memories to prune.

## Verification

Core verification already completed after final implementation:

```text
packages/agent focused suite: 51/51 passed
packages/coding-agent focused suite: 56/56 passed
npm run check: passed
./test.sh: passed
full local release build: passed
Node CLI help/version/list-models/interactive startup: passed
real-provider /btw settled + latest smoke: passed
```

Handover re-verification:

```text
pi-btw: npm run typecheck passed; npm test 4/4 passed
pi-voice-command: npm run typecheck passed; npm test 29/29 passed
update-pi-fork skill: discovered by Pi loader; zero diagnostics
Bun compiled Pi + voice extension: failure reproduced as documented
git diff --check: clean before note creation
```

Next-session core commands, following current `AGENTS.md`:

```bash
cd /home/mib07150/git/zfs/git/private/pi-plugins/pi-src/packages/agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/agent.test.ts test/agent-loop.test.ts

cd ../coding-agent
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/suite/side-query.test.ts \
  test/suite/agent-session-runtime.test.ts \
  test/extensions-runner.test.ts \
  test/trigger-compact-extension.test.ts

cd ../..
npm run check
./test.sh
```

Do not run raw full Vitest; credentials can activate e2e tests. `npm run check` does not run tests.

## Next concrete steps

1. Start with `/skill:takeover sqc`; verify inner/outer status and read the Bun report plus current `pi-src/AGENTS.md`.
2. Discover the new harness Grey supplies: executable, loaded extension paths, actual `pi` symlink, version, and rollback. Confirm global fallback remains usable.
3. Smoke `/btw` in the new harness with a cheap idle question. If Grey wants, also test `latest` during a parent turn and inspect cache usage/session history.
4. Discuss the 10-word TTS product shape before coding: integrate into `pi-voice-command` vs separate plugin; replace/full/digest modes; exact trigger; summary target; local cap behavior; model/cost expectations.
5. If approved, add pure summarizer/result-policy helpers and tests first, then wire `ctx.sideQuery()` at `agent_settled` behind an explicit output mode. Reuse `speak()` and existing MQTT/echo handling.
6. Run voice typecheck/unit tests and modified core focused tests. Then perform a real TTS smoke while checking one summary, at most 10 words, no duplicate speech, no transcript mutation, correct echo suppression, and clean quit/reload.
7. Decide where to publish `pi-btw`; add a remote and repair outer gitlink metadata once a remote exists.
8. Future weekly maintenance must use `/skill:update-pi-fork` and check upstream equivalence before preserving the custom delta.

## Open Q for Grey

- **Q-s4-sqc-1:** Should the 10-word digest be a new mode inside `pi-voice-command` (recommended because it owns TTS/echo state), or a separate plugin?
- **Q-s4-sqc-2:** Should digest mode replace full-response speech, or coexist as `/voice output full|digest` while preserving current behavior?
- **Q-s4-sqc-3:** Is using the current session model through cache-aware `ctx.sideQuery()` acceptable, or is selecting a cheaper/faster dedicated model a requirement even though the current side-query API has no model override?
- **Q-s4-sqc-4:** Where should `pi-btw` be hosted so its unconfigured nested gitlink can become a proper reproducible submodule: GitHub fork account, Codeberg, or elsewhere?

## Pre-amnesia workspace state

### `pi-src`

- Branch `sideQueryWithCache`; feature tip was pushed and matched `origin/sideQueryWithCache` before handover docs.
- Handover changes are: s3 moved to `archive/`, new Bun bug report, and this s4 note. Commit/push these together as `resume note + memos for sqc`.
- No source changes, scratch files, TODO/FIXME/REMOVE markers, or memory files.

### Outer `pi-plugins`

- Clean at handover start after committed removal of `context-mode`.
- After the inner handover commit, its `pi-src` gitlink will show modified and must be explicitly updated/committed without staging anything else.
- Outer has no remote.

### `pi-btw`

- Clean on `main`; no remote. Outer gitlink records its current commit, but `.gitmodules` has no mapping for it.

### Global state

- `update-pi-fork/SKILL.md` is loadable and unversioned under `~/.pi/agent/skills/`.
- Modified release and both launchers remain intact; global upstream `pi` remains unchanged.
- All known sqc/BTW scratch files and smoke answer files were removed from `/tmp`.
