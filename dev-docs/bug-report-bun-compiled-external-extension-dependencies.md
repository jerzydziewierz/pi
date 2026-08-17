# Bun 1.3.14 compiled Pi cannot resolve dependencies of external extensions

## Status

Open upstream-runtime limitation. It blocks using Pi's standalone Bun executable with dependency-bearing external extensions. It does **not** block the isolated Node release, ordinary Bun execution, or the global upstream Pi fallback.

Observed and reproduced on 2026-08-17.

## Environment

```text
OS: Linux x64
Bun: 1.3.14
Node: v22.23.1
npm: 10.9.8
Pi fork commit: a01f942cb73d78e348c801179d184b684d645b66
Pi package version: 0.84.2
```

Pi's standalone binary is built in `scripts/build-binaries.sh` with:

```bash
bun build --compile --no-compile-autoload-bunfig --target=bun-linux-x64-baseline \
  ./dist/bun/cli.js ./src/utils/image-resize-worker.ts --outfile .../pi
```

The failing extension is:

```text
/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts
```

Its package declares `mqtt` and has a complete local `node_modules` tree. `mqtt` eventually imports `readable-stream`, whose `readable.js` resolves `string_decoder/`.

## Pi reproduction

Start the compiled local release interactively with the external extension:

```bash
BIN=/home/mib07150/.local/share/pi-local-release/side-query-cache-a01f942cb/bun/pi
EXT=/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts
cd /tmp
"$BIN" -e "$EXT"
```

Result:

```text
Error: Failed to load extension "/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts": Failed to load extension: ResolveMessage: Cannot find module 'string_decoder/' from '/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/node_modules/readable-stream/lib/internal/streams/readable.js'
Hint: Start without extensions using "pi -ne".
```

Exit status is 1. This was re-run during handover and reproduced exactly.

`--list-models` is not a useful reproduction: that package command returns before normal extension startup and succeeds.

## Minimal Bun reproduction

No Pi source is needed. Create a tiny compiled host that dynamically imports a runtime path:

```ts
// /tmp/bun-external-extension-repro.ts
const extensionPath = process.argv[2];
if (!extensionPath) throw new Error("pass an extension path");
await import(extensionPath);
console.log("loaded");
```

Compile and run it:

```bash
bun build --compile /tmp/bun-external-extension-repro.ts \
  --outfile /tmp/bun-external-extension-repro

cd /tmp
/tmp/bun-external-extension-repro \
  /home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts
```

Observed output:

```text
error: Cannot find package 'mqtt' from '/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts'

Bun v1.3.14 (Linux x64)
```

This establishes that the first failure is not caused by the side-query patch or Pi's extension loader. The compiled executable cannot resolve a package relative to a dynamically imported external TypeScript module.

## Control cases

Both package paths resolve from the extension package under ordinary Node and Bun resolution:

```text
.../pi-voice-command/node_modules/mqtt/build/index.js
.../pi-voice-command/node_modules/string_decoder/lib/string_decoder.js
```

Ordinary Bun 1.3.14 also imports the full `voice.ts` extension successfully from `/tmp`:

```bash
cd /tmp
bun -e 'await import("/home/mib07150/git/zfs/git/private/pi-plugins/pi-voice-command/extensions/voice.ts"); console.log("loaded")'
# loaded
```

The isolated Node Pi release loads and runs the voice extension because Pi's Node runtime uses its TypeScript extension loader and normal package resolution.

## Impact

Pi advertises external TypeScript extensions and packages. A standalone executable should load an extension's own dependencies from the extension package, but Bun's compiled runtime fails before registration. Dependency-free extensions such as the current `pi-btw` may work, which can hide the issue until another extension imports a package.

This prevents the compiled Bun artifact from being the operational modified Pi launcher. It also means successful standalone startup without dependency-bearing extensions is insufficient release validation.

## Workaround

Use the isolated Node release:

```text
/home/mib07150/.local/share/pi-local-release/side-query-cache-a01f942cb/node/pi
```

The persistent launchers `pi-sqc` and `pi-sqc-btw` deliberately execute that Node install. Keep the ordinary global Pi unchanged as an additional fallback.

Do not vendor or bundle `mqtt` into Pi core merely to bypass this runtime bug. The extension must continue owning its dependencies.

## Suspected ownership and next investigation

The minimal reproducer points to Bun compiled-executable runtime module resolution rather than Pi. Before changing Pi:

1. Re-run the minimal reproducer on the latest Bun release.
2. Search/file a Bun issue with the minimal host and a tiny external package fixture.
3. Determine whether Bun has a supported external-module loading API or compile flag that preserves runtime Node-style package resolution.
4. If Bun documents that compiled binaries cannot load arbitrary external dependencies, Pi should document the limitation and its binary smoke tests should include a dependency-bearing extension.
5. Only consider a Pi loader workaround if it remains provider/runtime-neutral and does not require every external extension dependency to be known at Pi compile time.

## Resolution criteria

Close this report only when a newly compiled standalone Pi can start interactively with `pi-voice-command/extensions/voice.ts`, load `mqtt` and `string_decoder/` from the extension's package, and retain normal extension reload behavior. Re-run both the minimal reproduction and Pi interactive smoke test.
