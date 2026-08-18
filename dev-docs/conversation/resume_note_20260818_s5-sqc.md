> **To resume:** `/skill:takeover sqc` (pi, has the takeover skill) — or, any agent:
> read this note top-to-bottom, then `AGENTS.md` + the docs it links, then
> `git log`/`git status` for drift since 20260818, re-run the checks named
> below, and continue. Code is truth; this note is a stale map.

# `sideQueryWithCache`: fork promoted to global `pi`; next is the `/voice` interface redesign

## State

The fork is now the **default global `pi`**. Stock upstream is `pi_classic`. Both are
wrappers in `~/.local/share/pi-switch/bin`, which is deliberately outside every npm
prefix so `npm i -g` can never overwrite the fork. All work is committed and the fork
branch is pushed. Nothing is in flight.

The next task is a **`/voice` interface redesign**, described under "Next task" below.
It is a plugin-interface change in `pi-voice-command`, not core work.

*we search not what masters of old have found; we search for what they searched for*

## What shipped this session

### The switcheroo

- **Deployed** `pi` -> forked core, `pi_classic` -> stock upstream, via two wrapper
  scripts in `~/.local/share/pi-switch/bin`, prepended in `~/.bashrc` after the npm
  `pi-node` bin directory.
- **Chose** that location over swapping the npm-managed symlink. Probed both builds
  directly: the fork's `getSelfUpdateCommand` already returns `undefined`
  (`isManagedByGlobalPackageManager` fails), so the fork cannot self-update. The real
  hazard is the reverse — `pi_classic update self` or any `npm i -g` recreates
  `<prefix>/bin/pi` from the package `bin` field, which would silently revert a
  symlink-based switch. The switch directory is immune.
- **Verified** `pi-acp` (Zed's agent server) still resolves and inherits the switch.

### Core (`pi-src`, commit `3868f9a80`, pushed)

- **Added** `DISPLAY_VERSION` = `0.84.2+fork.sideQueryWithCache.upstream.080932e53`,
  shown in the startup banner (`interactive-mode.ts:931`) and `--version`
  (`main.ts:629`).
- **Kept** `VERSION` bare semver. It drives `isNewerPackageVersion` and
  `checkForNewPiVersion`; `this.version` in interactive mode stays bare for the
  update check and changelog matching. Verified `pi update self` still reports
  `already up to date (v0.84.2)`.
- **Used** semver build metadata rather than free text because `pi-acp` shells out to
  `pi --version` and validates against `/^\d+\.\d+\.\d+(?:[-+].+)?$/`. Free text would
  have silently broken its startup banner.
- **Added** `getSelfUpdateUnavailableReason` so `pi update self` distinguishes an
  unowned install (normal deployment: stdout, exit 0) from a genuine fault
  (non-writable owned install or unsupported method: `error:`, exit 1).

### `/btw` (`pi-btw`, commit `27d1d3b`, no remote)

- **Added** `hostSupportsSideQuery()` + `UNSUPPORTED_HOST_MESSAGE` in `src/btw.ts`,
  guarding the handler. Under `pi_classic` the extension loads clean, the command
  still registers, and invoking it warns once instead of throwing a `TypeError`.
- **Placed** the guard *after* the no-argument reopen path, so reopening the latest
  answer still works on any host.

### Operations

- **Updated** `~/.pi/agent/skills/update-pi-fork/SKILL.md`: new deployment section,
  safety rule 0 for `FORK_UPSTREAM_BASE`, and a "Known upstream breakage" section.
- **Committed** outer gitlinks for both `pi-src` and `pi-btw` (`40dfc21`).

## Canonical locations

```text
Outer repo:        /home/mib07150/git/zfs/git/private/pi-plugins        (no remote)
Fork:              .../pi-plugins/pi-src    branch sideQueryWithCache
                     origin   https://github.com/jerzydziewierz/pi.git
                     upstream https://github.com/earendil-works/pi.git
BTW plugin:        .../pi-plugins/pi-btw    (no remote)
Voice plugin:      .../pi-plugins/pi-voice-command

Global switch:     ~/.local/share/pi-switch/bin/{pi,pi_classic}
Current release:   ~/.local/share/pi-local-release/side-query-cache-forkver
Rollback releases: side-query-cache-a01f942cb (original), -gracefulupd (redundant)
Shell backup:      ~/.bashrc.bak-pi-switch-20260818
```

Rollback is one `exec` line in `pi-switch/bin/pi`.

## What I need to remember

### Deployment invariants

- Never repoint the npm-managed `pi-node/.../bin/pi` at the fork. That reintroduces
  exactly the clobber this design avoids.
- `pi_classic` invokes upstream `dist/cli.js` directly so it self-updates normally.
  Keep it working; it is the fallback.
- `FORK_UPSTREAM_BASE` in `config.ts` must be updated to the new
  `git merge-base HEAD upstream/main` whenever a new upstream base is merged.
  `test/config.test.ts` asserts it appears in `DISPLAY_VERSION`.
- `settings.json` is shared by both hosts. That is intended. Plugins needing the
  extended core must load and refuse gracefully, not fail to load.

### `release:local` is currently unreliable upstream

`generate:models` refetches gitignored catalogs into
`packages/ai/src/providers/data/`, so tests hardcoding model ids break on a tree
identical to `HEAD`. Pre-existing failures confirmed by stashing my changes:
`stream.test.ts:707` (cloudflare-ai-gateway `claude-sonnet-4-5`), model-resolver
(cerebras `zai-glm-4.7`), baseten GLM 5.2, plus flaky `auth-storage` (~1 in 3,
passes in isolation). Reverting to an upstream tag does **not** help; the refetch
happens on any checkout. I built with `--skip-check --skip-test` only after
`npm run check` and the focused suites passed on the same tree. Re-run
`git status` afterwards: the skipped `check` leaves
`packages/ai/src/image-models.generated.ts` unformatted. Revert it; do not commit.

### Side-query invariants (unchanged, still load-bearing)

- `latest` reuses the exact most recently dispatched provider prefix; `settled`
  requires idle. Do not merge adjacent user messages or rerun whole-context
  transforms.
- Side queries are transcript-detached, run no tools, and do not count toward
  `isIdle()`/`waitForIdle()`. Never start or await one in `session_shutdown`.
- Consumers must handle `stopReason === "toolUse"` explicitly.
- There is still **no per-side-query model override**. A dedicated small model
  cannot be selected through `ctx.sideQuery()` without extending core.

## Verification

```text
pi-src config.test.ts             17/17
pi-src focused coding-agent        72/72 (config, side-query, session-runtime, extensions-runner)
pi-src focused agent               51/51
pi-btw                             5/5 (typecheck clean)
pi-voice-command                   29/29
npm run check                      passes except known packages/ai catalog error
pi --version                       0.84.2+fork.sideQueryWithCache.upstream.080932e53, parses as semver
pi_classic --version               0.84.2
pi update self --force             declines, exit 0
pi_classic update self             npm-owned, works
/btw on fork                       real provider answer, settled mode, 0600 file
/btw on pi_classic                 loads clean, one warning, no crash
```

## Next task: `/voice` interface redesign

Grey's requirement, verbatim in intent: the interface should be **aware that there
are `voice input` and `voice output` main options**, and then **additional `voice
output` options: `full`, `shortened`, or `none`**.

Today's surface (`extensions/voice.ts:300-378`) is flat and inconsistent: input verbs
sit at the top level (`/voice on|off`, `/voice mode …`) while output is nested under
`/voice output …`. Output is a boolean `outputEnabled` (line 102), so "off" and "how
much to speak" are conflated.

Shape to build:

```text
/voice                          status for both
/voice input on|off             (today: /voice on|off)
/voice input mode utterance|commit-word
/voice output full|shortened|none
/voice output language|voice|cooldown …   (unchanged)
```

Design decisions to settle with Grey before coding:

- **Back-compat:** keep `/voice on|off` as an alias for `/voice input on|off`? Grey
  uses these by voice, so silently breaking muscle memory is worse than a little
  duplication. Recommend keeping aliases.
- **`none` vs `off`:** is `none` the same as today's output off, or a third state?
  Recommend `none` *is* off — one enum `OutputMode = "full" | "shortened" | "none"`
  replacing the `outputEnabled` boolean, default `none`.
- **`shortened` is the long-deferred phase 2.** `README.md` still describes an older
  plan (last four messages, two sentences, `gpt-5.6-luna`). The s4 note supersedes it
  with Grey's **maximum-10-word** digest. Confirm which, and update the README.

Implementation notes carried forward from s4, still valid:

- Trigger on `agent_settled`; issue `ctx.sideQuery(..., { mode: "settled" })` only
  when mode is `shortened` **and** TTS is connected — gate before starting, to avoid
  model cost with nowhere to speak.
- Verify `ctx.sideQuery` is legal inside the `agent_settled` callback. Expected to be,
  but never tested on this path.
- `maxTokens` is not a word cap. Enforce the cap locally; do not retry by default.
- Reuse the existing `speak()`, cleaning/chunking, QoS 1 IDs, and echo suppression.
  Do not duplicate that plumbing.
- A side query emits no assistant transcript message, so it should not retrigger
  `agent_settled` — still add a regression test against recursion/double speech.
- `full` must keep working exactly as now. It is the proven path.
- Add the same `hostSupportsSideQuery`-style guard as `/btw`: under `pi_classic`,
  `shortened` must refuse gracefully and ideally fall back to `full` or `none`
  rather than break voice output entirely.

Pure helpers (mode parsing, digest word-cap, result policy) should be unit-tested in
`src/` first, then wired into the extension. `test/filter.test.ts` and
`test/speech.test.ts` are the pattern; `test/live-mqtt.mjs` needs real credentials.

## Open Q for Grey

- **Q-s5-1:** Should `/voice on|off` remain an alias for `/voice input on|off`?
- **Q-s5-2:** Is `none` simply today's output-off, or a distinct third state?
- **Q-s5-3:** Confirm `shortened` = max-10-word digest (s4), superseding the README's
  two-sentence plan. Which model, given `ctx.sideQuery()` still has no override and
  will use the session model (currently `claude-opus-5`, expensive for a digest)?
- **Q-s5-4:** Under `pi_classic`, should `shortened` degrade to `full` or to `none`?
- **Q-s5-5:** Delete the redundant `side-query-cache-gracefulupd` release?
- **Q-s5-6:** `upstream/main` has moved (`080932e53..cff1cf52c`). Run the weekly
  merge before or after the voice work?

## Pre-amnesia workspace state

- `pi-src`: clean on `sideQueryWithCache`, tip `3868f9a80`, matches
  `origin/sideQueryWithCache`.
- `pi-btw`: clean on `main`, tip `27d1d3b`, no remote. Outer gitlink recorded; still
  no `.gitmodules` mapping, so `git submodule status` at outer root fails for
  `pi-btw`. Not corruption.
- `pi-voice-command`: clean on `main`, 29/29 tests, untouched this session.
- Outer `pi-plugins`: clean at `40dfc21` except untracked `ccusage/`, which predates
  this work and is not mine.
- Global: `pi` and `pi_classic` both live and verified. All three releases retained.
- `/tmp`: all `btw_*.md` smoke files and probe scripts removed. No tmux sessions left.
