> **To resume:** `/skill:takeover sqc` (pi, has the takeover skill) — or, any agent:
> read this note top-to-bottom, then `AGENTS.md` + the docs/source it links, then
> `git log`/`git status` for drift since 20260817, re-run the checks named
> below, and continue. Code is truth; this note is a stale map.

# `sideQueryWithCache`: research complete, implementation next

## State

We are maintaining a private Pi core fork to support a Claude Code-like `/btw`: ask one detached side question with the current full context and prompt-cache reuse, keep the exchange out of the normal session, then discard it or fork the parent session plus captured Q/A into a real new session. Research is complete; no implementation has started. Work repo is now `~/git/zfs/git/private/pi-plugins/pi-src`, clean on new branch `sideQueryWithCache` at current `upstream/main` (`080932e53`, package 0.84.2). Next session should design the smallest provider-neutral core primitive, test it with the faux provider, expose it to extensions, then build/verify the fork-promotion seam.

Motto: we search not what masters of old have found; we search for what they searched for.

## What shipped this session

### Repository

- Moved full Pi clone from `~/git/zfs/git/from-source/pi` to `~/git/zfs/git/private/pi-plugins/pi-src`.
- Fetched `upstream`, fast-forwarded local `main` to `upstream/main`, and pushed `origin/main` to the same commit.
- Created clean branch `sideQueryWithCache` from updated `main`.
- Preserved old local branch `feat/ask-with-frozen-context` at `f0deb8dd8`; it has zero unique commits and no implementation to recover.

### Researched/decided

- Official Claude Code `/btw` behavior confirmed: separate side panel; dismiss, copy, browse prior side answers, or press `f` to fork parent context + side Q/A into a real session. Official docs: <https://code.claude.com/docs/en/interactive-mode>.
- Pi core has exact semantic request state: agent messages, system prompt, exact active tool definitions, model, thinking, stream function, provider hooks, transport, and `sessionId`.
- Existing extension API cannot guarantee an exact detached request because it exposes incomplete tool metadata and bypasses parts of the normal context/provider hook pipeline when using `modelRegistry.complete()` directly.
- Correct architecture: core owns correctness-sensitive detached request + fork promotion; extension owns `/btw` input and overlay UX.
- Preserve tool schemas in the side request for prompt-prefix/cache stability, but execute no tools: one provider response only, with side-user instruction requiring a direct text answer. Removing tools can invalidate Anthropic's `tools → system → messages` cache hierarchy.
- Reuse the same `sessionId`, model, thinking configuration, transport, cache retention, system prompt, context transform, converter, and provider callbacks. `sessionId` matters for OpenAI prompt cache keys/session affinity even though first-party Anthropic cache identity is prefix-based.
- Provider ultimately decides cache admission/write. Do not promise provider-neutral “read but never write.” Anthropic client breakpoints can influence it; OpenAI is largely automatic.

## Prior attempt / evidence to retain

The old core branch contains no code, but its earlier handover is highly relevant:

- `../context-mode/dev-docs/conversation/resume_note_20260802_s2-piask.md`
- Plugin implementation: `../context-mode/src/adapters/pi/frozen-context.ts`
- Context-mode commits around that file: `f153d03`, `426b671`.

That plugin captured Anthropic's final `before_provider_request` wire payload and replayed it with an appended user block via raw HTTP. Its source comment reports real proxy tests with roughly `cacheRead≈15.1k`, `cacheWrite=0`, 5/5 runs. It includes useful defensive ideas: immutable checkpoint, model mismatch guard, session-bound clearing, max four Anthropic breakpoints, shape diagnostics. Port ideas, not provider-specific raw-fetch code.

The old recon proposed an options-level payload override: call the normal `ModelRuntime.streamSimple()` stack with dummy context and replace the generated payload through `onPayload`. This preserves auth/provider parsing while replaying captured bytes. It is unvalidated and probably less clean than a true detached semantic-context request. Keep it as fallback if provider-hook nondeterminism makes ordinary reserialization fail cache tests.

Important distinction:

- Exact **semantic context** through the same serializer should reproduce the prior cacheable prefix deterministically and is provider-neutral.
- Captured exact **wire payload** is strongest for byte identity but only represents the previous request (before the latest assistant suffix) and complicates provider-neutral suffix serialization.
- Start with semantic detached request. Do not prematurely adopt raw payload replay.

## Current source map

Read these files fully before broad edits (AGENTS.md requirement):

- `packages/agent/src/agent.ts`
  - `createContextSnapshot()` around line 437.
  - `createLoopConfig()` around line 445.
  - Holds public runtime callbacks/options (`convertToLlm`, `transformContext`, `streamFunction`, `onPayload`, `onResponse`, `sessionId`, thinking, transport).
- `packages/agent/src/agent-loop.ts`
  - `streamAssistantResponse()` around line 281 applies context transform/conversion and invokes the stream function.
- `packages/coding-agent/src/core/sdk.ts`
  - Agent construction around lines 300–360 wires `modelRuntime.streamSimple`, header transform, `before_provider_request`, `after_provider_response`, and `context` hooks.
- `packages/coding-agent/src/core/agent-session.ts`
  - `_bindExtensionCore()` around line 2370 and `runner.bindCore()` around 2396.
  - Owns session state, exact active tools/system prompt, usage, replacement lifecycle.
- `packages/coding-agent/src/core/extensions/types.ts`
  - `ExtensionContext` around line 307.
  - `ExtensionContextActions` around line 1654.
- `packages/coding-agent/src/core/extensions/runner.ts`
  - `bindCore()` around line 314; `createContext()` around 673.
  - `emitContext()` around 984; `emitBeforeProviderRequest()` around 1016.
- `packages/coding-agent/src/core/agent-session-runtime.ts`
  - Existing `fork(entryId, {position})` clones/replaces active runtime; needs a safe way to append captured Q/A before entering the fork.
- `packages/coding-agent/src/core/session-manager.ts`
  - Can clone active path and append user/assistant messages; assistant message already carries provider/model/usage.
- `packages/ai/src/providers/faux.ts`
  - `serializeContext()` around 206 and cache simulation around 235–253 use common-prefix matching keyed by `sessionId`. Good paid-API-free cache test.
- `packages/ai/src/api/anthropic-messages.ts`
  - `onPayload` replacement around line 565; cache serialization/breakpoints later in file.

Installed Pi package used during research was `@earendil-works/pi-coding-agent` 0.84.2; checkout is now newer than tag `v0.84.2` by 20 upstream commits but still package version 0.84.2.

## Proposed core contract (not final)

Keep names/design open until source and tests establish the clean seam. Conceptually:

```ts
const result = await ctx.sideQuery(question, options);
// result captures base leaf, exact UserMessage, final AssistantMessage, usage
await ctx.forkSideQuery(result);
```

Potential result:

```ts
interface SideQueryResult {
  baseLeafId: string | null;
  userMessage: UserMessage;
  assistantMessage: AssistantMessage;
}
```

Potential implementation layers:

1. Agent/core method performs a single detached provider response from a snapshot without mutating main `Agent.state`, queues, session entries, or ordinary lifecycle events.
2. Coding-agent `AgentSession` captures `baseLeafId`, delegates detached request, and exposes it through extension actions/context.
3. Runtime method clones at captured leaf, appends the exact captured user + assistant messages, then enters that fork. Discard does nothing.
4. Plugin command renders input/stream/answer overlay. UX should remain outside core.

Prefer a streaming primitive (`AssistantMessageEventStream` or callback) if it does not overcomplicate the first patch; `/btw` should ideally stream in the overlay. A Promise of final `AssistantMessage` is acceptable as a first functional slice only if the API can evolve cleanly.

## Design hazards / half-formed questions

- **Provider hooks:** side requests should use `context`, header, payload, and response hooks. Add request-purpose metadata such as `source: "sideQuery"` if possible so extensions can avoid capturing/re-entering their own nested side calls. Existing hook event types may need extension.
- **System prompt:** do not run ordinary `before_agent_start` with the side question if that changes the system prefix and harms caching. Use the current effective/base system and append side-only instructions in the new user suffix. Verify behavior of prior per-turn system overrides after a settled turn.
- **Tools:** send identical schemas/order but no tool loop. A model may still return `toolUse`; surface that as an unusable answer or retry once only if retry can preserve safety/cache. Avoid `tool_choice: none` unless tested; Anthropic docs say tool-choice/config changes can invalidate cache.
- **Concurrency:** extension commands execute during streaming. Decide whether v1 requires idle, snapshots only last completed context, or safely supports side query while the main agent runs. Claude supports concurrent side questions. Do not accidentally include an unstable partial assistant message.
- **Compaction:** use current agent messages, not raw session history; current state is already compaction-aware.
- **Usage:** ephemeral result should not enter main session totals. If promoted into a fork, appended assistant usage should count there.
- **Abort:** detached request needs its own abort signal tied to overlay dismissal, not main-agent `ctx.signal` (usually undefined for idle commands).
- **Cache admission:** same context/session ID should make faux `cacheRead > 0`; actual provider may also report suffix cache creation. This is provider policy, not correctness failure.
- **Fork anchoring:** fork from `baseLeafId` captured at invocation, not whatever leaf exists when user presses `f`; main work may advance concurrently.
- **Session replacement API:** current `ctx.fork()` has no setup callback. Options: add a narrowly typed `forkSideQuery(result)` or a general `setup(SessionManager)` callback. Narrow API is safer; general API is more reusable but exposes assistant insertion.
- **Persistence of side-answer browser:** Claude retains earlier `/btw` exchanges. Initial scope can discard after close; optional TUI-only extension state can be added later. Do not put ephemeral side Q/A into normal LLM context.
- **Raw payload fallback:** if before-provider hooks are nondeterministic, ordinary reserialization may not reproduce cached prefix. The old `onPayload` override trick remains an escape hatch.

## Testing plan

Use faux provider; no paid APIs.

1. Add focused agent test for detached one-turn behavior:
   - full current context + same tools/system reach provider;
   - main messages/state unchanged;
   - no tool execution even if response requests one;
   - abort works.
2. Add coding-agent suite test with faux cache:
   - regular parent prompt establishes cache;
   - side query uses same `sessionId` and prefix;
   - assert `assistantMessage.usage.cacheRead > 0`;
   - assert no side entries in parent session.
3. Test context and provider hooks execute exactly once with side-query source metadata.
4. Test fork promotion:
   - clone anchored at captured leaf;
   - parent file unchanged;
   - new fork contains parent path + real user/assistant side turns and can continue with tools.
5. Test stale model/session/leaf and concurrent advancement behavior.
6. Run each modified test directly while iterating.
7. After code changes run `npm run check` with full output. Run `./test.sh` only if requested/appropriate; AGENTS.md says do not run raw full Vitest.

## Next concrete steps

1. Read the listed source files completely, plus relevant current tests and extension docs.
2. Sketch two candidate seams on paper/code comments:
   - `Agent.sideQuery()` factoring the existing request-preparation path;
   - coding-agent-only detached request using Agent's exposed runtime callbacks.
   Choose the one with least duplication and no state mutation.
3. Write the faux-provider failing test first: cache read + parent transcript unchanged.
4. Implement the one-turn detached request and extension exposure.
5. Implement fork promotion using the captured leaf and exact messages.
6. Build a minimal `/btw` example extension/overlay only after core tests pass.
7. Run focused tests and `npm run check`.
8. Commit only when Grey asks; push feature branch to `origin` when ready. This is intentionally maintained in `jerzydziewierz/pi.git`; upstream marked the earlier idea “not planned.”

## Open Q for Grey

- **Q-s1-sqc-1:** Should v1 support `/btw` while the main agent is actively streaming, or may it require idle first? Concurrent support affects snapshot and UI design substantially.
- **Q-s1-sqc-2:** Should the first implementation include the full overlay + `f` promotion UX, or land/test core primitives first and add the plugin immediately afterward?
- **Q-s1-sqc-3:** Should `pi-src/` become a git submodule of the outer private `pi-plugins` repository, or remain an untracked nested repository?

## Pre-amnesia workspace state

### `pi-src`

- Branch: `sideQueryWithCache`.
- HEAD: `080932e53`, same as `main`, `origin/main`, and `upstream/main` at handover.
- Before this note, tree was clean. Only this resume note and its new directories are added by handover.
- No implementation, tests, scratch files, stale TODOs, or bug reports added.
- No memories directory existed.

### Outer `pi-plugins`

Unrelated pre-existing dirty work must not be touched:

- modified submodule/worktree `context-mode`;
- modified `pi-voice-command/README.md`, `extensions/voice.ts`, `package.json`;
- untracked `pi-voice-command/src/speech.ts`, `test/speech.test.ts`;
- `pi-src/` appears as an untracked nested repository.

### `context-mode`

Has unrelated dirty state: staged `dev-docs/bug-report-dario-proxy-strips-pi-tools.md` and branch reported ahead of its configured remote. Do not clean or commit it as part of this strand.
