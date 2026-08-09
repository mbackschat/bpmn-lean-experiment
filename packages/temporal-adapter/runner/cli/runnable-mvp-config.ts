/** Strict, local-file configuration boundary for the repository runnable MVP command. */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  StimulusKind,
  isWellFormedStimulus,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  validateHostEffectHandlers,
  validateHostInteractionPlan,
} from "@bpmn-lean/temporal-runner";
import type {
  ExternalTemporalRuntimeOptions,
  HostEffectHandler,
  HostInteractionResponse,
} from "@bpmn-lean/temporal-runner";

import { parseStrictJson } from "../../../../scripts/strict-json.ts";

export type RunnableMvpConfig = DeepReadonly<{
  kind: "runnableTemporalMvp";
  bpmn: {
    file: string;
    sourceId: string;
    semanticProfile: string;
    limits: {
      maxBytes: number;
      parserDeadlineMs: number;
    };
  };
  process: {
    instanceId: string;
    initialVariables: VariableBinding[];
  };
  temporal: ExternalTemporalRuntimeOptions;
  interactions: HostInteractionResponse[];
  effectHandlers: HostEffectHandler[];
}>;

export async function loadRunnableMvpConfig(
  configPath: string,
): Promise<RunnableMvpConfig> {
  if (configPath.length === 0) {
    throw new TypeError("MVP config path must be nonempty");
  }
  const absoluteConfigPath = path.resolve(configPath);
  const value = parseStrictJson<unknown>(
    await readFile(absoluteConfigPath, "utf8"),
    absoluteConfigPath,
  );
  validateRunnableMvpConfig(value);
  return {
    ...value,
    bpmn: {
      ...value.bpmn,
      file: path.resolve(path.dirname(absoluteConfigPath), value.bpmn.file),
    },
  };
}

export function validateRunnableMvpConfig(
  value: unknown,
): asserts value is RunnableMvpConfig {
  const root = requireExactObject(
    value,
    ["kind", "bpmn", "process", "temporal", "interactions", "effectHandlers"],
    "MVP config",
  );
  if (root.kind !== "runnableTemporalMvp") {
    throw new TypeError("MVP config kind must be runnableTemporalMvp");
  }

  const bpmn = requireExactObject(
    root.bpmn,
    ["file", "sourceId", "semanticProfile", "limits"],
    "MVP bpmn config",
  );
  requireNonemptyString(bpmn.file, "MVP BPMN file");
  requireNonemptyString(bpmn.sourceId, "MVP BPMN sourceId");
  requireNonemptyString(bpmn.semanticProfile, "MVP semantic profile");
  const limits = requireExactObject(
    bpmn.limits,
    ["maxBytes", "parserDeadlineMs"],
    "MVP BPMN limits",
  );
  requirePositiveSafeInteger(limits.maxBytes, "MVP maxBytes");
  requirePositiveSafeInteger(
    limits.parserDeadlineMs,
    "MVP parserDeadlineMs",
  );

  const process = requireExactObject(
    root.process,
    ["instanceId", "initialVariables"],
    "MVP Process config",
  );
  requireNonemptyString(process.instanceId, "MVP Process instanceId");
  if (!isWellFormedStimulus({
    kind: StimulusKind.StartProcess,
    commandId: "mvp-config-validation",
    processId: "mvp-config-validation",
    instanceId: process.instanceId,
    initialVariables: process.initialVariables,
  })) {
    throw new TypeError(
      "MVP initialVariables must be a canonical string/null binding list",
    );
  }

  const temporal = requireExactObject(
    root.temporal,
    ["address", "namespace", "taskQueue", "identity"],
    "MVP Temporal config",
  );
  requireNonemptyString(temporal.address, "MVP Temporal address");
  requireNonemptyString(temporal.namespace, "MVP Temporal namespace");
  requireNonemptyString(temporal.taskQueue, "MVP Temporal taskQueue");
  requireNonemptyString(temporal.identity, "MVP Temporal identity");

  validateHostInteractionPlan(root.interactions);
  validateHostEffectHandlers(root.effectHandlers);
}

function requireExactObject(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new TypeError(`${label} has unknown field ${key}`);
    }
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${label} is missing field ${key}`);
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonemptyString(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${label} must be a nonempty Unicode scalar string`);
  }
}

function requirePositiveSafeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}
