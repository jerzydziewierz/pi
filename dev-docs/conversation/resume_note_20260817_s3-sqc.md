> **To resume:** `/skill:takeover sqc` (pi, has the takeover skill) — or, any agent:
> read this note top-to-bottom, then `AGENTS.md` + the docs it links, then
> `git log`/`git status` for drift since 20260817, re-run the checks named
> below, and continue. Code is truth; this note is a stale map.

# `sideQueryWithCache`: final implementation green; commit, install local Pi, design first plugin

## State

Cache-aware detached side queries are implemented, reviewed, documented, and green but intentionally **uncommitted** on inner branch `sideQueryWithCache`. Grey explicitly said the next session will commit, make this local Pi build the installed `pi`, then begin figuring out the first plugin that uses the API. Do not re-derive architecture. Verify, inspect final diff, commit inner implementation, update outer submodule gitlink, install a reversible local release, then discuss plugin UX before implementing it.

Motto: we search not what masters of old have found; we search for what they searched for.

## Grey decisions (final)

- Cache reuse is the primary invariant: `latest` preserves the dispatched provider message/tool prefix and appends only a converted side-query suffix.
- Two modes remain:
  - `settled`: idle-at-invocation semantic snapshot.
  - `latest`: most recently dispatched provider context; usable while parent works.
- `latest` runs `convertToLlm` only on the suffix (enforces image blocking) and never reruns whole-context transforms.
- Keep provider callbacks. `before_provider_request` handlers must be deterministic/prefix-preserving. Warn user, with offending extension path/effect, when a handler returns a replacement payload on a side query.
- No core recursion guard. A plugin recursively calling `sideQuery()` from its provider hooks may be broken; prefer simpler core.
- Narrow promotion API: `fork({ appendMessages })`, not unrestricted `fork.setup(SessionManager)`.
- Snapshot publication boundary: stream-handle creation = request dispatched.
- Side queries are transcript-detached but tied to Agent/session lifetime. Their result stream remains owned by plugin for status, voice, advice, or condition/failure detection.
- Core primitives/test harness only. First polished UX belongs in a separate plugin-only repository.

## What changed

### Agent core

Files: `packages/agent/src/{agent.ts,agent-loop.ts}`, tests, README.

- Extracted `prepareAgentRequest()` from normal provider boundary.
- It copies top-level message array before `transformContext`; nested objects/tools retain existing immutability contract.
- Added `SideQueryMode`, `SideQueryOptions`, `Agent.sideQuery()`.
- `settled`: idle check, stable context snapshot, normal transform + conversion pipeline, one detached provider stream.
- `latest`: cached shallow provider-context snapshot from most recently dispatched main request; dynamic API-key refresh; suffix-only `convertToLlm`; no second context transform.
- Both preserve tools/session/options; one response only; no Agent loop, tools, transcript/session writes, queues, usage aggregation, or lifecycle events.
- A model may return `toolUse`; stream is returned but no tool executes.
- Added dedicated optional `onSideQueryPayload` hook (falls back to `onPayload`) so coding-agent can attribute cache warnings.
- Side queries have composed caller/lifecycle abort controllers. `abort()`/`reset()` abort them. `waitForSideQueries()` supports safe shutdown.
- `AgentSession.abort()` waits for main run + side queries. Reload, replacement, and quit abort/settle side queries before extension shutdown/runtime replacement.
- `reset()` clears latest snapshot. Invalid runtime modes throw.
- Documented public Agent API.

### Coding-agent extension API

Files: extension types/runner/index, SDK, AgentSession/runtime, interactive bindings, docs/tests.

- Added `ctx.sideQuery(input, options)` to all extension contexts.
- SDK uses side-specific payload callback to run normal `before_provider_request` hooks and issue a conservative warning if a handler returns a replacement during a side query.
- Warning is once per extension runtime and names extension path + `before_provider_request` effect. It is not a provider-confirmed cache miss. In-place mutation followed by `undefined` cannot be detected.
- `ctx.fork()` accepts `appendMessages?: Message[]`; messages append only to new branch before `withSession`, then Agent context is rebuilt.
- Full extension docs cover cache contract, lifecycle, warning, status/voice/detector result routing, and promotion flow.

### Tests

- Agent: transform array isolation; settled no transcript/tool execution; provider callback selection; max tokens/session/tools; latest while active; suffix-only conversion; dispatched-error snapshot semantics; lifecycle abort/result ownership; invalid mode/reset.
- Coding suite: Faux cache reads for settled/latest; context hooks not rerun for latest; reload abort; fork promotion isolation.
- Runtime: quit abort occurs before shutdown handler awaits side result.
- Runner: replacement payload warning names extension and deduplicates.
- Harness now forwards real session ID and side-specific payload hook.

## Review outcomes / footguns

- Focused review originally found image-policy bypass, provider-hook recursion, lifecycle cleanup, over-broad fork setup, invalid rejected-stream test, missing docs. All except recursion were addressed; recursion was explicitly accepted as plugin responsibility.
- A later reviewer suggested merging adjacent user messages. Do **not** do this casually: mutating/merging the cached final parent message violates the cache-prefix invariant. Current providers are expected to serialize accepted consecutive user messages; real-provider plugin smoke test remains valuable.
- Payload warning is intentionally conservative. A handler returning the original payload reference may warn even if unchanged; avoiding false positives generically would miss in-place mutations.
- Plugins should not start/await new side queries inside `session_shutdown`; that is plugin-side lifecycle misuse and can deadlock cleanup. Existing active queries are aborted before shutdown handlers.
- Side queries do not count toward normal `isIdle`/`waitForIdle`; use returned stream and explicit signal. Session lifecycle uses `waitForSideQueries()` internally.
- First final-review consult timed out; a second review produced the adjacent-role/late-shutdown cautions above. No verified code blocker remained.
- `prepareAgentRequest()` is exported through agent barrel because `agent.ts` imports it across module boundary. This is broader than ideal but currently intentional implementation surface; no issue observed.

## Verification (latest)

```text
packages/agent:
  vitest test/agent.test.ts test/agent-loop.test.ts
  2 files, 51 tests passed

packages/coding-agent:
  vitest test/suite/side-query.test.ts
         test/suite/agent-session-runtime.test.ts
         test/extensions-runner.test.ts
         test/trigger-compact-extension.test.ts
  4 files, 56 tests passed

repo root:
  npm run check
  passed: Biome, pinned deps, imports, shrinkwrap/install lock, tsgo, browser smoke

git diff --check: clean
```

Use AGENTS-prescribed commands, not full raw vitest. `npm run check` does not run tests.

## Next concrete steps

1. Take over, compare code/status to this note, rerun focused tests + `npm run check`.
2. Inspect final diff/public exports. No changelog on non-main branch.
3. Commit inner `pi-src` implementation. Grey explicitly deferred commit to next session. Stage exact paths only; preserve repo rules. Likely message: `feat(coding-agent): add cache-aware side queries` (adjust after final diff review).
4. Outer `pi-plugins`: stage updated `pi-src` gitlink after inner commit. `.gitmodules` + initial gitlink are already staged from `git submodule add`. Preserve unrelated dirt. Ask Grey before outer commit if scope/permission is ambiguous.
5. Make local build the installed `pi`:
   - Current executable: `/home/mib07150/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi`.
   - Current package: `/home/mib07150/.local/share/pi-node/node-v22.23.1-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`.
   - Repo-supported local release: `npm run release:local -- --out <outside-repo-dir> --force`; script regenerates models, checks, builds all publishable packages, runs `./test.sh`, packs local tarballs, and creates isolated Node/Bun installs. Full script: `scripts/local-release.mjs`.
   - User explicitly requested local build/install, so build is authorized. Choose a persistent outside-repo location, preserve a rollback path, then either repoint the managed `pi` command to the isolated Node install or install all local tarballs into the dedicated pi-node prefix. Do not overwrite blindly; inspect symlinks/prefix first.
   - Verify from outside repo: `pi --help`, `pi --version`, interactive startup, and that extension types/runtime expose `ctx.sideQuery`.
6. Begin design discussion for first separate plugin. Candidate goal from Grey: consume side result for status line, voice output, advice, or special/failure-condition detector. Decide trigger cadence, `latest` vs `settled`, prompt, max token budget, cancellation, display/output channel, cache-warning behavior, and promotion UX before coding.
7. Real-provider smoke via first plugin: prove cache read/reuse and consecutive-user request acceptance on intended provider/model without mutating session history.

## Open Q for Grey

None blocking the inner commit. For first plugin, discuss product shape before implementation. If installed-Pi replacement has multiple safe methods, prefer reversible isolated-release symlink and surface the exact plan before replacing the managed executable.

## Pre-amnesia workspace state

### Inner `pi-src`

- Branch `sideQueryWithCache`, tracking `origin/sideQueryWithCache`.
- HEAD `23d0a063b` (s2 handover docs commit). Implementation remains uncommitted by Grey's instruction.
- 18 tracked files modified plus new `packages/coding-agent/test/suite/side-query.test.ts`; this s3 note and s2 archive move add docs changes.
- No scratch files, TODO/FIXME/REMOVE markers, bug reports, or memory files.
- Previous live s2 note moved to `dev-docs/conversation/archive/`; this s3 note is sole live sqc note.
- Handover note/archive intentionally **not committed** because Grey said next session will commit.

### Outer `pi-plugins`

- `.gitmodules` and `pi-src` gitlink staged from `git submodule add`, still uncommitted.
- Staged gitlink still points to old `f7991158f`; working submodule currently `23d0a063b-dirty`. After inner commit, explicitly stage new gitlink.
- Config: URL `https://github.com/jerzydziewierz/pi.git`, branch `sideQueryWithCache`.
- Preserve unrelated existing dirt:
  - modified `context-mode` submodule;
  - modified `pi-voice-command/README.md`, `extensions/voice.ts`, `package.json`;
  - untracked `pi-voice-command/src/speech.ts`, `test/speech.test.ts`.
