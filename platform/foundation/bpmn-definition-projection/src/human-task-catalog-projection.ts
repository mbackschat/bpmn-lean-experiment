import { createHash } from "node:crypto";

import {
  decodeCanonicalHumanTaskCatalogV1,
  decodeStructuredFormDefinitionV1,
  parseStrictJson,
  serializeHumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";
import type {
  HumanTaskCatalogV1,
  HumanTaskDefinitionV1,
  StructuredFormDefinitionV1,
} from "@bpmn-lean/platform-contracts";

import {
  findProcess,
  parsePresentationModel,
} from "./presentation-model.js";
import type { ModdleElement } from "./presentation-model.js";
import { hasChildlessCatalogTextContainers } from "./catalog-xml-shape.js";

const structuredHumanWorkProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const structuredFormSourceVersion =
  "bpmn-lean-structured-human-work-source/v1";
const maximumSourceBytes = 1_048_576;
const maximumIdentityBytes = 256;
const lowercaseSha256 = /^[0-9a-f]{64}$/u;

export type HumanTaskCatalogProjectionBinding = Readonly<{
  processId: string;
  semanticProfile: string;
  sourceSha256: string;
}>;

export type HumanTaskCatalogProjectionProvenance = Readonly<{
  kind: "exactBpmnSource";
  processId: string;
  semanticProfile: string;
  sourceSha256: string;
}>;

export const HumanTaskCatalogProjectionInvalidEvidence = {
  SourceBinding: "sourceBinding",
  SourceDocument: "sourceDocument",
  ProcessSelection: "processSelection",
  UserTaskIdentity: "userTaskIdentity",
  RenderingPlacement: "renderingPlacement",
  Documentation: "documentation",
  CatalogContract: "catalogContract",
} as const;

export type HumanTaskCatalogProjectionInvalidEvidence =
  typeof HumanTaskCatalogProjectionInvalidEvidence[
    keyof typeof HumanTaskCatalogProjectionInvalidEvidence
  ];

export type HumanTaskCatalogProjectionResult =
  | Readonly<{
      kind: "catalog";
      catalog: HumanTaskCatalogV1;
      provenance: HumanTaskCatalogProjectionProvenance;
    }>
  | Readonly<{ kind: "absent" }>
  | Readonly<{
      kind: "invalid";
      evidence: HumanTaskCatalogProjectionInvalidEvidence;
    }>;

/**
 * Projects the M6 Product 2 catalog from the same private parser graph used for DI.
 * The result has no semantic-admission authority and never exposes a moddle value.
 */
export async function projectHumanTaskCatalog(
  sourceXml: string,
  binding: HumanTaskCatalogProjectionBinding,
): Promise<HumanTaskCatalogProjectionResult> {
  if (!validSourceBinding(sourceXml, binding)) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.SourceBinding);
  }
  if (!hasChildlessCatalogTextContainers(sourceXml)) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.SourceDocument);
  }

  let definitions: ModdleElement;
  try {
    const parsed = await parsePresentationModel(sourceXml, "BPMN catalog source");
    definitions = parsed.definitions;
  } catch {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.SourceDocument);
  }
  let process: ModdleElement;
  try {
    process = findProcess(definitions, binding.processId);
  } catch {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.ProcessSelection);
  }
  if (process.id !== binding.processId) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.ProcessSelection);
  }

  const userTasks = (process.flowElements ?? []).filter(
    (element) => element.$type === "bpmn:UserTask",
  );
  const taskIds = userTasks.map(({ id }) => id);
  if (
    taskIds.some((id) => !validIdentity(id)) ||
    new Set(taskIds).size !== taskIds.length
  ) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.UserTaskIdentity);
  }

  const allProjectForms = collectProjectForms(definitions);
  const recognizedProjectForms = new Set<ModdleElement>();
  const tasks: HumanTaskDefinitionV1[] = [];
  for (const userTask of userTasks) {
    const result = projectUserTask(userTask, recognizedProjectForms);
    switch (result.kind) {
      case "absent":
        break;
      case "invalid":
        return invalid(result.evidence);
      case "task":
        tasks.push(result.task);
        break;
    }
  }

  if (
    allProjectForms.size !== recognizedProjectForms.size ||
    [...allProjectForms].some((form) => !recognizedProjectForms.has(form))
  ) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.RenderingPlacement);
  }
  if (tasks.length === 0) return Object.freeze({ kind: "absent" });

  try {
    const canonical = serializeHumanTaskCatalogV1({
      schemaVersion: "bpmn-lean-human-task-catalog/v1",
      processId: binding.processId,
      semanticProfile: binding.semanticProfile,
      sourceSha256: binding.sourceSha256,
      tasks,
    });
    const catalog = decodeCanonicalHumanTaskCatalogV1(canonical);
    const provenance = Object.freeze({
      kind: "exactBpmnSource" as const,
      processId: catalog.processId,
      semanticProfile: catalog.semanticProfile,
      sourceSha256: catalog.sourceSha256,
    });
    return Object.freeze({ kind: "catalog", catalog, provenance });
  } catch {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.CatalogContract);
  }
}

type UserTaskProjection =
  | Readonly<{ kind: "absent" }>
  | Readonly<{
      kind: "invalid";
      evidence: HumanTaskCatalogProjectionInvalidEvidence;
    }>
  | Readonly<{ kind: "task"; task: HumanTaskDefinitionV1 }>;

function projectUserTask(
  userTask: ModdleElement,
  recognizedProjectForms: Set<ModdleElement>,
): UserTaskProjection {
  if (!validIdentity(userTask.id)) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.UserTaskIdentity);
  }
  const renderings = userTask.renderings ?? [];
  const carriers = renderings.flatMap((rendering) => {
    const values = rendering.extensionElements?.values ?? [];
    return values
      .filter((value) => value.$type === "bpmnLean:StructuredForm")
      .map((form) => ({ rendering, form }));
  });
  if (carriers.length === 0) return Object.freeze({ kind: "absent" });
  if (carriers.length !== 1 || renderings.length !== 1) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.RenderingPlacement);
  }

  const carrier = carriers[0];
  if (carrier === undefined || !hasExactCarrierShape(carrier.rendering, carrier.form)) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.RenderingPlacement);
  }
  recognizedProjectForms.add(carrier.form);

  const description = projectDescription(userTask);
  if (description === undefined) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.Documentation);
  }
  const source = decodeStructuredFormSource(carrier.form.body);
  if (source === undefined) {
    return invalid(HumanTaskCatalogProjectionInvalidEvidence.CatalogContract);
  }
  return Object.freeze({
    kind: "task",
    task: Object.freeze({
      elementId: userTask.id,
      description,
      worklistPriority: source.worklistPriority,
      form: source.form,
    }),
  });
}

function projectDescription(userTask: ModdleElement): string | undefined {
  const documentation = userTask.documentation ?? [];
  const entry = documentation[0];
  if (
    documentation.length !== 1 ||
    entry === undefined ||
    entry.$type !== "bpmn:Documentation" ||
    (entry.textFormat !== undefined && entry.textFormat !== "text/plain") ||
    typeof entry.text !== "string" ||
    !hasOnlyOwnKeys(entry, ["$type", "id", "text", "textFormat"])
  ) {
    return undefined;
  }
  return entry.text;
}

function hasExactCarrierShape(
  rendering: ModdleElement,
  form: ModdleElement,
): boolean {
  const extensionElements = rendering.extensionElements;
  return (
    rendering.$type === "bpmn:Rendering" &&
    extensionElements?.$type === "bpmn:ExtensionElements" &&
    extensionElements.values?.length === 1 &&
    extensionElements.values[0] === form &&
    form.$type === "bpmnLean:StructuredForm" &&
    typeof form.body === "string" &&
    hasOnlyOwnKeys(rendering, ["$type", "id", "extensionElements"]) &&
    hasOnlyOwnKeys(extensionElements, ["$type", "values"]) &&
    hasOnlyOwnKeys(form, ["$type", "body"])
  );
}

function decodeStructuredFormSource(
  body: string | undefined,
): Readonly<{
  worklistPriority: number;
  form: StructuredFormDefinitionV1;
}> | undefined {
  if (body === undefined || !body.isWellFormed()) return undefined;
  try {
    const value = parseStrictJson(new TextEncoder().encode(body));
    if (!plainObject(value)) return undefined;
    const keys = Object.keys(value).toSorted();
    if (
      !sameKeys(keys, ["form", "schemaVersion"]) &&
      !sameKeys(keys, ["form", "schemaVersion", "worklistPriority"])
    ) {
      return undefined;
    }
    if (value.schemaVersion !== structuredFormSourceVersion) return undefined;
    const priority = value.worklistPriority ?? 50;
    if (
      typeof priority !== "number" ||
      !Number.isSafeInteger(priority) ||
      priority < 0 ||
      priority > 100 ||
      Object.is(priority, -0)
    ) {
      return undefined;
    }
    return Object.freeze({
      worklistPriority: priority,
      form: decodeStructuredFormDefinitionV1(value.form),
    });
  } catch {
    return undefined;
  }
}

function collectProjectForms(root: ModdleElement): ReadonlySet<ModdleElement> {
  const forms = new Set<ModdleElement>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isModdleElement(value) && value.$type === "bpmnLean:StructuredForm") {
      forms.add(value);
    }
    for (const key of Object.keys(value)) {
      if (key !== "$parent" && key !== "$attrs" && key !== "$model" && key !== "$descriptor") {
        visit(Reflect.get(value, key));
      }
    }
  };
  visit(root);
  return forms;
}

function isModdleElement(value: object): value is ModdleElement {
  return "$type" in value && typeof value.$type === "string";
}

function validSourceBinding(
  sourceXml: string,
  binding: HumanTaskCatalogProjectionBinding,
): boolean {
  return (
    typeof sourceXml === "string" &&
    Buffer.byteLength(sourceXml, "utf8") <= maximumSourceBytes &&
    plainObject(binding) &&
    sameKeys(Object.keys(binding).toSorted(), ["processId", "semanticProfile", "sourceSha256"]) &&
    validIdentity(binding.processId) &&
    binding.semanticProfile === structuredHumanWorkProfile &&
    lowercaseSha256.test(binding.sourceSha256) &&
    createHash("sha256").update(sourceXml, "utf8").digest("hex") === binding.sourceSha256
  );
}

function validIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.isWellFormed() &&
    Buffer.byteLength(value, "utf8") <= maximumIdentityBytes
  );
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyOwnKeys(value: object, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function invalid(
  evidence: HumanTaskCatalogProjectionInvalidEvidence,
): Extract<HumanTaskCatalogProjectionResult, Readonly<{ kind: "invalid" }>> {
  return Object.freeze({ kind: "invalid", evidence });
}
