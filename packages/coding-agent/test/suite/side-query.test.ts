import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../src/core/extensions/index.ts";
import { createHarness, type Harness } from "./harness.ts";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = () => {};
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("side query", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("reuses the parent prompt cache and context hooks without adding session entries", async () => {
		let contextHookCount = 0;
		const harness = await createHarness({
			systemPrompt: "stable system prefix",
			extensionFactories: [
				(pi: ExtensionAPI) => {
					pi.on("context", (event) => {
						contextHookCount++;
						return { messages: event.messages };
					});
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});
		harness.setResponses([fauxAssistantMessage("parent answer"), fauxAssistantMessage("side answer")]);

		await harness.session.prompt("establish a cacheable parent request");
		const entriesBefore = harness.sessionManager.getEntries();
		const messagesBefore = harness.session.messages.slice();

		const stream = await harness.session.extensionRunner
			.createContext()
			.sideQuery("report without changing the transcript", { mode: "settled" });
		const result = await stream.result();

		expect(result.usage.cacheRead).toBeGreaterThan(0);
		expect(harness.sessionManager.getEntries()).toEqual(entriesBefore);
		expect(harness.session.messages).toEqual(messagesBefore);
		expect(contextHookCount).toBe(2);
		expect(harness.getPendingResponseCount()).toBe(0);
	});

	it("aborts an active side query before reloading extensions", async () => {
		const sideStarted = createDeferred();
		const harness = await createHarness();
		harnesses.push(harness);
		await harness.session.bindExtensions({});
		harness.setResponses([
			(_context, options) =>
				new Promise((resolve) => {
					sideStarted.resolve();
					const finish = () =>
						resolve(fauxAssistantMessage("", { stopReason: "aborted", errorMessage: "aborted" }));
					if (options?.signal?.aborted) {
						finish();
					} else {
						options?.signal?.addEventListener("abort", finish, { once: true });
					}
				}),
		]);

		const stream = await harness.session.extensionRunner
			.createContext()
			.sideQuery("watch for reload", { mode: "settled" });
		await sideStarted.promise;
		await harness.session.reload();
		const result = await stream.result();

		expect(result.stopReason).toBe("aborted");
	});

	it("uses the latest dispatched context while the parent agent is working", async () => {
		const activeRequestStarted = createDeferred();
		const releaseActiveRequest = createDeferred();
		let contextHookCount = 0;
		const harness = await createHarness({
			systemPrompt: "stable system prefix",
			extensionFactories: [
				(pi: ExtensionAPI) => {
					pi.on("context", (event) => {
						contextHookCount++;
						return { messages: event.messages };
					});
				},
			],
		});
		await harness.session.bindExtensions({});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage("primed"),
			async () => {
				activeRequestStarted.resolve();
				await releaseActiveRequest.promise;
				return fauxAssistantMessage("main answer");
			},
			fauxAssistantMessage("side status"),
		]);

		await harness.session.prompt("prime cache");
		const activePrompt = harness.session.prompt("continue working");
		await activeRequestStarted.promise;
		const messagesBefore = harness.session.messages.slice();

		const stream = await harness.session.extensionRunner
			.createContext()
			.sideQuery("report current status", { mode: "latest" });
		const result = await stream.result();

		expect(result.usage.cacheRead).toBeGreaterThan(0);
		expect(harness.session.messages).toEqual(messagesBefore);
		expect(harness.session.isIdle).toBe(false);
		// The latest mode reuses the already transformed snapshot instead of
		// running context hooks again and risking a different cache prefix.
		expect(contextHookCount).toBe(2);

		releaseActiveRequest.resolve();
		await activePrompt;
	});
});
