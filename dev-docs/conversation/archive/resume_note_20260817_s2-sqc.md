> **To resume:** `/skill:takeover sqc` (pi, has the takeover skill) — or, any agent:
> read this note top-to-bottom, then `AGENTS.md`, then inspect the uncommitted
> diff and `git log`/`git status` for drift since 20260817, re-run the checks
> named below, and continue. Code is truth; this note is a stale map.

# `sideQueryWithCache`: core implementation green, review fixes remain

## State

Core primitives are implemented but intentionally **uncommitted** on `sideQueryWithCache`. `Agent.sideQuery()` now offers two modes: `settled` snapshots current idle semantic context, while `latest` reuses the most recent successfully started provider-request context and can run while the parent agent works. Both make one detached provider call, preserve tools/model/session/provider callbacks, execute no tools, and do not mutate session history. The API is exposed to extensions. Forks gained a `setup(SessionManager)` callback so a plugin can promote captured Q/A into a fork anchored at its invocation leaf. Focused tests and `npm run check` pass. Next session: address the small review items below, rerun tests, inspect the final diff, then ask Grey before committing.

Motto: we search not what masters of old have found; we search for what they searched for.

## Decisions from Grey

- Provide both modes:
  - `settled`: requires idle state; intended when normal user input is required.
  - `latest`: uses the latest available request/cache snapshot at any point, including while the parent works; intended for timers/status reporting.
- Core primitives and test harness only. No `/btw` overlay or polished UX here; that belongs in a separate plugin-only repository.
- `pi-src` is a submodule of the outer private `pi-plugins` repository.

## Implemented, uncommitted

### Agent core

Files: `packages/agent/src/agent.ts`, `agent-loop.ts`, `test/agent.test.ts`.

- Extracted `prepareAgentRequest()` from the existing request boundary. It applies `transformContext`, `convertToLlm`, and dynamic API-key resolution, then builds the exact model/context/options passed to the stream function.
- Added exported `SideQueryMode = "settled" | "latest"` and `SideQueryOptions` (`mode`, `signal`, `maxTokens`, `images`).
- Added `Agent.sideQuery(input, options): Promise<AssistantMessageEventStream>`.
- `settled`:
  - rejects when `activeRun` exists;
  - snapshots system/messages/tools;
  - appends a detached user message;
  - applies the normal semantic context pipeline;
  - starts exactly one provider stream directly.
- `latest`:
  - main provider calls go through `streamAndCapture`;
  - captures model, post-transform/provider-ready semantic `Context`, and stream options without the parent abort signal;
  - publishes the snapshot after `streamFunction` successfully returns its event stream;
  - appends the side user message directly to the already-transformed context, deliberately avoiding a second context-hook pass that could alter the cached prefix;
  - refreshes the provider API key and uses the side query's abort signal.
- Side queries call `streamFunction` directly, so no Agent loop, event persistence, queue mutation, usage aggregation, or tool execution occurs. Tool schemas remain present for cache-prefix fidelity.
- `reset()` clears the latest snapshot. Session replacement creates a new Agent, so snapshots do not cross sessions.

### Extension/core exposure

Files: `packages/coding-agent/src/core/extensions/{types.ts,index.ts,runner.ts}`, `agent-session.ts`, `src/index.ts`, and the interactive shortcut context fixture.

- Added `ctx.sideQuery(input, options)` to `ExtensionContext`, so commands, timers, and event handlers can invoke it.
- Wired through `ExtensionContextActions` → `ExtensionRunner` → `AgentSession.agent.sideQuery()`.
- Re-exported `SideQueryMode` and `SideQueryOptions` from coding-agent public types.
- Added required stubs to existing tests/manual contexts.

### Promotion seam

Files: `packages/coding-agent/src/core/agent-session-runtime.ts`, extension types/runner, runtime suite test.

- `ExtensionCommandContext.fork()` and runtime `fork()` now accept the same `setup(SessionManager)` pattern already supported by `newSession()`.
- Setup runs only after the fork runtime is created and before `withSession`; agent state is rebuilt from the modified fork manager.
- Test proves appended side user/assistant messages appear only in the new branch and the source session stays unchanged.
- Intended plugin flow:
  1. capture `ctx.sessionManager.getLeafId()` before query;
  2. consume `ctx.sideQuery()` stream and retain exact user/assistant messages;
  3. on promotion, `ctx.fork(capturedLeaf, { position: "at", setup })` and append those messages in `setup`.

### Test harness

Files: `packages/coding-agent/test/suite/harness.ts`, new `side-query.test.ts`.

- Faux harness now sets the Agent's real session ID, enabling its common-prefix prompt-cache simulator.
- Settled test proves `cacheRead > 0`, context hook execution, no session entries/messages, and response consumption.
- Latest test primes cache, blocks an active parent response, invokes latest mode concurrently, proves `cacheRead > 0`, no parent mutation, parent remains non-idle, and context hooks are not rerun for the side call.
- Agent tests prove settled transcript/tool safety, latest during an active run, identical context prefix/tools/session ID, settled rejection while active, and latest invalidation on reset.

## Review items to resolve next

Independent focused review identified these relevant points; broad repository review was discarded as unrelated overhead.

1. **`prepareAgentRequest()` mutation wording/array alias:** its comment says it does not mutate supplied context, but `transformContext` receives `context.messages` directly and could mutate it. This was existing loop behavior moved into a helper, but the new contract is too strong. Preferred fix: initialize `messages = context.messages.slice()` before calling the transform, then adjust wording to state nested message objects follow existing immutability expectations. Do not deep-clone arbitrary custom AgentMessages without assessing compatibility/performance.
2. **Latest snapshot semantics:** current publication after `await streamFunction(...)` means “latest successfully started provider stream.” During stream setup the previous successful snapshot remains; if setup rejects, it remains. This likely matches “latest available cache state.” Document this precisely and add a rejected-stream test rather than moving publication earlier without thought.
3. **Shallow snapshots:** arrays are copied, message/tool objects are shared. Pi/provider code treats request objects as immutable; deep-cloning a full context every main request would be expensive and tools contain functions. Keep shallow copies unless source inspection finds actual mutation; add a comment/test if useful.
4. **Tool-use result:** a side model can still return `stopReason: "toolUse"`; no tool executes by design. Do not remove schemas (cache break) or run tools (violates requirement). Add an explicit test returning a tool call and asserting zero executions; plugin-side prompt instructions should request direct text.
5. **Settled race semantics:** idle is checked at invocation, and a stable top-level snapshot is taken before async preparation. Another main prompt could begin during preparation because side queries do not lock Agent lifecycle. Decide whether “requires idle” means only invocation-time snapshot (probably sufficient) or exclusive provider-call serialization. Do not add locking casually.
6. **Provider hooks test gap:** production side calls retain `onPayload`/`onResponse` in options, but Faux does not invoke `onPayload`. Existing harness test covers context hooks only. A focused Agent mock can explicitly invoke `options.onPayload` to verify propagation if desired.

One reviewer flagged “tools can dead-end”; this is intentional: preserve schemas, make one response, never execute. A tool-use side answer is a result the plugin can reject/display, not permission to run tools.

## Verification already run

After current implementation:

```text
packages/agent:
  vitest test/agent.test.ts test/agent-loop.test.ts
  2 files, 48 tests passed

packages/coding-agent:
  vitest test/suite/side-query.test.ts
         test/suite/agent-session-runtime.test.ts
         test/extensions-runner.test.ts
         test/trigger-compact-extension.test.ts
  4 files, 53 tests passed

repo root:
  npm run check
  passed: Biome, pinned deps, imports, shrinkwrap/install lock, tsgo, browser smoke
```

Initial focused tests failed only because the moved checkout's ignored generated model data and dependencies were stale. Fixed environment with:

```bash
cd packages/ai && npm run hydrate-model-data
cd ../.. && npm install --ignore-scripts
```

Generated provider data is ignored; lockfiles stayed unchanged. Node 22 emitted the existing gondolin Node >=23 engine warning during install, but checks/tests passed.

## Next concrete steps

1. Read the current uncommitted diff; do not re-derive the architecture.
2. Change `prepareAgentRequest()` to pass a copied top-level messages array to `transformContext`, and correct its contract comment.
3. Add tests for:
   - side response returning tool calls without execution;
   - failed provider stream setup retaining the prior latest snapshot;
   - optionally provider callback propagation.
4. Decide/document invocation-only idle semantics; do not introduce lifecycle locking unless Grey changes the requirement.
5. Rerun the focused commands above and `npm run check`.
6. Inspect `git diff --check` and final public exports.
7. Ask Grey before committing the core implementation. After the inner commit, update the outer submodule gitlink and ask before committing the outer submodule registration.

## Open Q for Grey

None currently. The implementation follows A1–A3. Escalate only if exclusive locking for settled mode becomes necessary or the generic `fork.setup` surface is considered too broad.

## Pre-amnesia workspace state

### Inner `pi-src`

- Branch `sideQueryWithCache`, tracking `origin/sideQueryWithCache`.
- HEAD remains handover commit `f7991158f`; all implementation listed above is uncommitted.
- Changed source/tests: 14 tracked files plus new `packages/coding-agent/test/suite/side-query.test.ts` (see `git status`).
- `npm run check` may have formatted files; current tree is check-clean.
- No scratch files, added TODO/FIXME markers, bug reports, memories, or legacy bootstrap files.
- Previous sqc note moved to `dev-docs/conversation/archive/`; this s2 note is the sole live note.

### Outer `pi-plugins`

- `.gitmodules` and `pi-src` gitlink are staged by `git submodule add`; not committed.
- Config:
  - URL `https://github.com/jerzydziewierz/pi.git`
  - branch `sideQueryWithCache`
- Submodule gitdir was properly absorbed into outer `.git/modules/pi-src`; `pi-src/.git` is now a gitfile.
- A stale temporary `/tmp/pi-base-check` linked worktree (only ignored node_modules) was removed because it blocked absorption.
- Gitlink currently points at `f7991158f`; after committing inner implementation, stage the new gitlink explicitly.
- Preserve unrelated existing dirt:
  - modified `context-mode` submodule;
  - modified `pi-voice-command/README.md`, `extensions/voice.ts`, `package.json`;
  - untracked `pi-voice-command/src/speech.ts`, `test/speech.test.ts`.
