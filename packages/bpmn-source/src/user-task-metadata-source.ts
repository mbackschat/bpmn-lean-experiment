/** Exact source projection for the bounded User Task assignment/form metadata profile. */
import {
  CheckedNodeKind,
  SemanticOperationKind,
  UserTaskMetadataCheckpointProfileId,
  isUserTaskMetadata,
  isUserTaskMetadataIdentity,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
  SemanticProcessProgram,
  UserTaskMetadata,
} from "@bpmn-lean/semantic-core";

import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readNamespaceUriForPrefix,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { removeOpaqueXmlRegions } from "./singleton-containment-admission.js";

export const userTaskMetadataCheckpointProfile =
  UserTaskMetadataCheckpointProfileId;

export const camundaBpmnNamespace =
  "http://camunda.org/schema/1.0/bpmn";

/**
 * Finds a duplicate expanded candidate attribute before structural import can erase it.
 *
 * This is deliberately not a general XML parser. It counts only lexical User Task start-tag
 * attributes whose prefix is declared for the selected URI, then leaves structure and values to
 * `bpmn-moddle`. Namespace rebinding can only make this guard reject earlier than the exact parsed
 * classifier would, never admit discarded content. The selected profile is the only caller.
 */
export function carriesDuplicateCandidateGroupsAttribute(xml: string): boolean {
  const searchableXml = removeOpaqueXmlRegions(xml);
  const candidatePrefixes = new Set<string>();
  for (const declaration of searchableXml.matchAll(
    /\bxmlns:([^\s=]+)\s*=\s*(["'])(.*?)\2/gu,
  )) {
    const prefix = declaration[1];
    const uri = declaration[3];
    if (prefix !== undefined && uri === camundaBpmnNamespace) {
      candidatePrefixes.add(prefix);
    }
  }
  for (const match of searchableXml.matchAll(
    /<(?:[^\s<>/:]+:)?userTask\b[^>]*>/gu,
  )) {
    const openingTag = match[0];
    let count = 0;
    for (const attribute of openingTag.matchAll(
      /\b([^\s=:/]+):candidateGroups\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    )) {
      const prefix = attribute[1];
      if (
        prefix !== undefined &&
        candidatePrefixes.has(prefix)
      ) {
        count += 1;
      }
    }
    if (count > 1) {
      return true;
    }
  }
  return false;
}

export type UserTaskMetadataSourceProjection =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "present"; metadata: UserTaskMetadata }>;

/** Reads either no metadata or the one exact complete extension shape selected by the profile. */
export function readUserTaskMetadataSource(
  element: ElementRecord,
  definitions: ElementRecord,
): UserTaskMetadataSourceProjection | undefined {
  const candidate = readCandidateGroup(element, definitions);
  const extensionElements = asElement(element.extensionElements);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate === null && extensionElements === undefined) {
    return { kind: "absent" };
  }
  if (
    candidate === null ||
    !isUserTaskMetadataIdentity(candidate) ||
    candidate.includes(",") ||
    candidate.includes("${") ||
    candidate.includes("#{") ||
    extensionElements === undefined ||
    !hasOnlyModelledKeys(extensionElements, ["$type", "values"])
  ) {
    return undefined;
  }
  const extensionValues = asElementArray(extensionElements.values);
  const formData = extensionValues?.[0];
  if (
    extensionValues?.length !== 1 ||
    formData === undefined ||
    !hasExpandedName(formData, camundaBpmnNamespace, "formData") ||
    !hasExactOwnKeys(formData, ["$type", "$children"])
  ) {
    return undefined;
  }
  const formChildren = asElementArray(formData.$children);
  const field = formChildren?.[0];
  if (
    formChildren?.length !== 1 ||
    field === undefined ||
    !hasExpandedName(field, camundaBpmnNamespace, "formField") ||
    !hasExactOwnKeys(field, ["$type", "id", "type"]) ||
    typeof field.id !== "string" ||
    !isUserTaskMetadataIdentity(field.id) ||
    (field.type !== "string" && field.type !== "boolean")
  ) {
    return undefined;
  }
  return {
    kind: "present",
    metadata: {
      assignment: {
        candidates: [{ kind: "group", id: candidate }],
      },
      form: {
        fields: [{ key: field.id, type: field.type }],
      },
    },
  };
}

function readCandidateGroup(
  element: ElementRecord,
  definitions: ElementRecord,
): string | null | undefined {
  const rawAttributes = asElement(element.$attrs);
  if (rawAttributes === undefined) {
    return undefined;
  }
  const matches = Object.entries(rawAttributes).flatMap(
    ([qualifiedName, value]) => {
      const separator = qualifiedName.indexOf(":");
      if (
        separator <= 0 ||
        separator === qualifiedName.length - 1 ||
        typeof value !== "string"
      ) {
        return [];
      }
      const prefix = qualifiedName.slice(0, separator);
      const localName = qualifiedName.slice(separator + 1);
      return readNamespaceUriForPrefix(element, definitions, prefix) ===
          camundaBpmnNamespace && localName === "candidateGroups"
        ? [value]
        : [];
    },
  );
  return matches.length === 0
    ? null
    : matches.length === 1
      ? matches[0]
      : undefined;
}

/** Exact expanded-name allowance paired with the selected dispatch entry. */
export function admitsUserTaskMetadataForeignAttribute(
  elementType: unknown,
  namespaceUri: string,
  localName: string,
): boolean {
  return elementType === "bpmn:UserTask" &&
    namespaceUri === camundaBpmnNamespace &&
    localName === "candidateGroups";
}

/** Checks the selected profile's exact checked-to-IL metadata identity binding. */
export function userTaskMetadataBindingValid(
  checked: CheckedProcess,
  program: SemanticProcessProgram,
): boolean {
  if (
    checked.identity.semanticProfile !== program.identity.semanticProfile
  ) {
    return false;
  }
  if (checked.identity.semanticProfile !== userTaskMetadataCheckpointProfile) {
    return true;
  }
  const tasks = checked.nodes.filter(
    (node): node is Extract<
      CheckedProcess["nodes"][number],
      { kind: CheckedNodeKind.UserTask }
    > => node.kind === CheckedNodeKind.UserTask,
  );
  const waits = program.operations.filter(
    (operation): operation is Extract<
      SemanticProcessProgram["operations"][number],
      { kind: SemanticOperationKind.AwaitUserTask }
    > => operation.kind === SemanticOperationKind.AwaitUserTask,
  );
  const task = tasks[0];
  const wait = waits[0];
  if (
    tasks.length !== 1 ||
    waits.length !== 1 ||
    task === undefined ||
    wait === undefined ||
    wait.origin.elementId !== task.id ||
    Object.hasOwn(task, "metadata") !== Object.hasOwn(wait.task, "metadata")
  ) {
    return false;
  }
  if (task.metadata === undefined || wait.task.metadata === undefined) {
    return task.metadata === undefined && wait.task.metadata === undefined;
  }
  return isUserTaskMetadata(task.metadata) &&
    isUserTaskMetadata(wait.task.metadata) &&
    sameMetadata(task.metadata, wait.task.metadata);
}

function hasExpandedName(
  element: ElementRecord,
  namespaceUri: string,
  localName: string,
): boolean {
  const descriptor = asElement(element.$descriptor);
  const namespace = asElement(descriptor?.ns);
  return namespace?.uri === namespaceUri && namespace.localName === localName;
}

function hasExactOwnKeys(
  element: ElementRecord,
  expected: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(element);
  return actual.length === expected.length &&
    expected.every((key) => actual.includes(key));
}

function sameMetadata(
  left: UserTaskMetadata,
  right: UserTaskMetadata,
): boolean {
  return left.assignment.candidates[0].id ===
      right.assignment.candidates[0].id &&
    left.form.fields[0].key === right.form.fields[0].key &&
    left.form.fields[0].type === right.form.fields[0].type;
}
