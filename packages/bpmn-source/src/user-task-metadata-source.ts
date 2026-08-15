/** Exact source projection for the bounded User Task assignment/form metadata profile. */
import {
  CheckedNodeKind,
  SemanticProfileId,
  SemanticOperationKind,
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

export const userTaskMetadataProfile =
  SemanticProfileId.UserTaskAssignmentFormMetadata;

export const parallelUserTaskMetadataProfile =
  SemanticProfileId.ParallelUserTaskAssignmentFormMetadata;

/** Selects the profiles that consume the exact assignment/form source extension. */
export function isUserTaskMetadataProfile(semanticProfile: string): boolean {
  switch (semanticProfile) {
    case userTaskMetadataProfile:
    case parallelUserTaskMetadataProfile:
      return true;
    default:
      return false;
  }
}

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
    const rawUri = declaration[3];
    if (rawUri === undefined) {
      return true;
    }
    const uri = decodeXmlAttributeValue(rawUri);
    if (uri === undefined) {
      return true;
    }
    if (prefix !== undefined && uri === camundaBpmnNamespace) {
      candidatePrefixes.add(prefix);
    }
  }
  for (const openingTag of userTaskOpeningTags(searchableXml)) {
    if (countCandidateGroupsAttributes(openingTag, candidatePrefixes) > 1) {
      return true;
    }
  }
  return false;
}

function decodeXmlAttributeValue(value: string): string | undefined {
  let decoded = "";
  let cursor = 0;
  while (cursor < value.length) {
    const referenceStart = value.indexOf("&", cursor);
    if (referenceStart === -1) {
      return decoded + value.slice(cursor);
    }
    decoded += value.slice(cursor, referenceStart);
    const referenceEnd = value.indexOf(";", referenceStart + 1);
    if (referenceEnd === -1) {
      return undefined;
    }
    const reference = value.slice(referenceStart + 1, referenceEnd);
    const replacement = decodeXmlReference(reference);
    if (replacement === undefined) {
      return undefined;
    }
    decoded += replacement;
    cursor = referenceEnd + 1;
  }
  return decoded;
}

function decodeXmlReference(reference: string): string | undefined {
  switch (reference) {
    case "amp":
      return "&";
    case "apos":
      return "'";
    case "gt":
      return ">";
    case "lt":
      return "<";
    case "quot":
      return "\"";
    default:
      break;
  }
  const hexadecimal = reference.startsWith("#x");
  const digits = reference.slice(hexadecimal ? 2 : 1);
  if (
    (!hexadecimal && !reference.startsWith("#")) ||
    digits.length === 0 ||
    !(hexadecimal ? /^[0-9A-Fa-f]+$/u : /^[0-9]+$/u).test(digits)
  ) {
    return undefined;
  }
  const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
  return isXmlCharacter(codePoint) ? String.fromCodePoint(codePoint) : undefined;
}

function isXmlCharacter(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function userTaskOpeningTags(xml: string): ReadonlyArray<string> {
  const openingTags: string[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start === -1) {
      break;
    }
    const end = findMarkupEnd(xml, start + 1);
    if (end === undefined) {
      break;
    }
    const openingTag = xml.slice(start, end + 1);
    if (/^<(?:[^\s<>/:]+:)?userTask(?=[\s/>])/u.test(openingTag)) {
      openingTags.push(openingTag);
    }
    cursor = end + 1;
  }
  return openingTags;
}

function findMarkupEnd(xml: string, start: number): number | undefined {
  let quote: "\"" | "'" | null = null;
  for (let cursor = start; cursor < xml.length; cursor += 1) {
    const character = xml[cursor];
    if (character === "\"" || character === "'") {
      quote = quote === null
        ? character
        : quote === character
          ? null
          : quote;
    } else if (character === ">" && quote === null) {
      return cursor;
    }
  }
  return undefined;
}

function countCandidateGroupsAttributes(
  openingTag: string,
  candidatePrefixes: ReadonlySet<string>,
): number {
  const elementName = /^<[^\s/>]+/u.exec(openingTag)?.[0];
  if (elementName === undefined) {
    return 0;
  }
  let count = 0;
  let cursor = elementName.length;
  while (cursor < openingTag.length) {
    while (isLexicalWhitespace(openingTag[cursor])) {
      cursor += 1;
    }
    if (openingTag[cursor] === ">" || openingTag[cursor] === undefined) {
      break;
    }
    if (openingTag[cursor] === "/") {
      cursor += 1;
      continue;
    }
    const nameStart = cursor;
    while (
      openingTag[cursor] !== undefined &&
      !isLexicalWhitespace(openingTag[cursor]) &&
      openingTag[cursor] !== "=" &&
      openingTag[cursor] !== "/" &&
      openingTag[cursor] !== ">"
    ) {
      cursor += 1;
    }
    const qualifiedName = openingTag.slice(nameStart, cursor);
    while (isLexicalWhitespace(openingTag[cursor])) {
      cursor += 1;
    }
    if (openingTag[cursor] !== "=") {
      continue;
    }
    cursor += 1;
    while (isLexicalWhitespace(openingTag[cursor])) {
      cursor += 1;
    }
    const quote = openingTag[cursor];
    if (quote !== "\"" && quote !== "'") {
      continue;
    }
    cursor += 1;
    const valueEnd = openingTag.indexOf(quote, cursor);
    if (valueEnd === -1) {
      break;
    }
    const separator = qualifiedName.indexOf(":");
    if (
      separator > 0 &&
      qualifiedName.indexOf(":", separator + 1) === -1 &&
      candidatePrefixes.has(qualifiedName.slice(0, separator)) &&
      qualifiedName.slice(separator + 1) === "candidateGroups"
    ) {
      count += 1;
    }
    cursor = valueEnd + 1;
  }
  return count;
}

function isLexicalWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character);
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
  if (!isUserTaskMetadataProfile(checked.identity.semanticProfile)) {
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
  const requiredTaskCount = checked.identity.semanticProfile ===
      parallelUserTaskMetadataProfile
    ? 2
    : 1;
  if (
    tasks.length !== requiredTaskCount ||
    waits.length !== requiredTaskCount
  ) {
    return false;
  }
  const tasksByElementId = new Map(tasks.map((task) => [task.id, task]));
  const waitsByElementId = new Map(waits.map((wait) => [
    wait.origin.elementId,
    wait,
  ]));
  if (
    tasksByElementId.size !== tasks.length ||
    waitsByElementId.size !== waits.length
  ) {
    return false;
  }
  return tasks.every((task) => {
    const wait = waitsByElementId.get(task.id);
    if (
      wait === undefined ||
      wait.task.elementId !== task.id ||
      wait.task.name !== task.name ||
      Object.hasOwn(task, "metadata") !== Object.hasOwn(wait.task, "metadata")
    ) {
      return false;
    }
    if (task.metadata === undefined || wait.task.metadata === undefined) {
      return checked.identity.semanticProfile === userTaskMetadataProfile &&
        task.metadata === undefined && wait.task.metadata === undefined;
    }
    return isUserTaskMetadata(task.metadata) &&
      isUserTaskMetadata(wait.task.metadata) &&
      sameMetadata(task.metadata, wait.task.metadata);
  });
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
