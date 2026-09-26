import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import {
  HostInteractionResultKind, driveHostInteractions, validateHostEffectHandlers, validateHostInteractionPlan,
} from "@bpmn-lean/temporal-testkit";
import type { HostEffectHandler, HostInteractionPort, HostInteractionResponse } from "@bpmn-lean/temporal-testkit";

import { rcShowcases } from "../../../model-corpus/rc-showcases.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

type RcActorConfig = Readonly<{
  interactions: readonly HostInteractionResponse[];
  effectHandlers: readonly HostEffectHandler[];
}>;

export type RcShowcaseBinding = Readonly<{
  modelId: string;
  mode: "human" | "guided";
  sourceSha256: string;
  semanticProfile: string;
  config: RcActorConfig;
}>;

/** Binds curated neutral plans to the retained exact source, before any host can start. */
export async function loadRcShowcaseBindings(): Promise<readonly RcShowcaseBinding[]> {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "model-corpus/manifest.json"), "utf8")) as {
    models: readonly { id: string; profile: string; source: {
      kind: string; bpmnRelativePath?: string; sha256?: string;
    } }[];
  };
  return Promise.all(rcShowcases.map(async (selection) => {
    const model = manifest.models.find(({ id }) => id === selection.modelId);
    if (model?.source.kind !== "retainedScenario" || model.source.bpmnRelativePath === undefined) {
      throw new Error(`RC showcase ${selection.modelId} requires a retained source`);
    }
    const configDirectory = resolve(repositoryRoot, "examples/temporal-mvp");
    const value: unknown = JSON.parse(await readFile(resolve(configDirectory, selection.configuration), "utf8"));
    if (!isRecord(value) || value.kind !== "runnableTemporalMvp" || !isRecord(value.bpmn)
      || typeof value.bpmn.file !== "string" || typeof value.bpmn.semanticProfile !== "string") {
      throw new TypeError(`RC showcase ${selection.modelId} requires a neutral runnable-MVP config`);
    }
    const { interactions, effectHandlers } = value;
    validateHostInteractionPlan(interactions);
    validateHostEffectHandlers(effectHandlers);
    const sourceFile = resolve(configDirectory, value.bpmn.file);
    const digest = createHash("sha256").update(await readFile(sourceFile)).digest("hex");
    if (sourceFile !== resolve(repositoryRoot, model.source.bpmnRelativePath)
      || digest !== model.source.sha256 || value.bpmn.semanticProfile !== model.profile) {
      throw new Error(`RC showcase ${selection.modelId} source or profile differs from the retained model`);
    }
    return { modelId: selection.modelId, mode: selection.mode, sourceSha256: digest,
      semanticProfile: model.profile, config: { interactions, effectHandlers } };
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeRcEffectHandlers(bindings: readonly RcShowcaseBinding[]): readonly HostEffectHandler[] {
  const handlers = new Map<string, HostEffectHandler>();
  for (const binding of bindings) {
    if (binding.mode !== "guided") continue;
    for (const handler of binding.config.effectHandlers) {
      const key = JSON.stringify([handler.protocol, handler.operation]);
      const previous = handlers.get(key);
      if (previous !== undefined && !isDeepStrictEqual(previous.result, handler.result)) {
        throw new Error(`Conflicting RC effect results for ${key}`);
      }
      handlers.set(key, handler);
    }
  }
  return [...handlers.values()];
}

/** Retains settled attempts because rediscovery must never replay a neutral interaction plan. */
export class RcShowcaseActors {
  readonly #bindings: readonly RcShowcaseBinding[];
  readonly #run: (binding: RcShowcaseBinding, instance: PublicProcessInstanceIdentity) => Promise<void>;
  readonly #attempts = new Map<string, Promise<void>>();
  readonly #failures: unknown[] = [];

  constructor(bindings: readonly RcShowcaseBinding[],
    run: (binding: RcShowcaseBinding, instance: PublicProcessInstanceIdentity) => Promise<void>) {
    this.#bindings = bindings;
    this.#run = run;
  }

  discover(instance: PublicProcessInstanceIdentity): boolean {
    if (this.#attempts.has(instance.processInstanceId)) return false;
    const binding = this.#bindings.find((candidate) => candidate.mode === "guided"
      && candidate.sourceSha256 === instance.definition.source.sha256
      && candidate.semanticProfile === instance.definition.semanticProfile);
    if (binding === undefined) return false;
    const attempt = Promise.resolve().then(() => this.#run(binding, instance)).catch((error: unknown) => {
      this.#failures.push(error);
    });
    this.#attempts.set(instance.processInstanceId, attempt);
    return true;
  }

  check(): void {
    if (this.#failures.length > 0) throw new AggregateError(this.#failures, "RC showcase actor failed");
  }

  async drain(): Promise<void> {
    await Promise.all(this.#attempts.values());
    this.check();
  }
}

export async function driveRcShowcaseActor(
  binding: RcShowcaseBinding, port: HostInteractionPort, signal: AbortSignal,
): Promise<void> {
  if (binding.mode !== "guided") throw new Error("Human RC showcases cannot acquire an actor");
  signal.throwIfAborted();
  const result = await driveHostInteractions(binding.config.interactions, port,
    async (milliseconds) => { await delay(milliseconds, undefined, { signal }); });
  if (result.kind !== HostInteractionResultKind.Driven) {
    throw new Error(`RC ${binding.modelId} actor refused: ${result.code}: ${result.evidence}`);
  }
}
