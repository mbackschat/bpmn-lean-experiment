/** Type-specific opaque source retention for standard BPMN Rendering subtrees. */
import {
  BpmnAdmissionCapability,
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type { BpmnSourceDiagnostic } from "./contracts.js";
import {
  containedLocus,
  rejectElement,
} from "./admission-diagnostics.js";
import type {
  ElementLocus,
  ElementRejection,
} from "./admission-diagnostics.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

const bpmnNamespace = "http://www.omg.org/spec/BPMN/20100524/MODEL";

export type OpaquePropertyRetention = Readonly<{
  ownerType: string;
  property: string;
  rootType: string;
}>;

export type OpaqueRetentionCapability = Readonly<{
  opaqueProperties: ReadonlyArray<OpaquePropertyRetention>;
}>;

export function opaqueRetainedKeys(
  element: ElementRecord,
  capability: OpaqueRetentionCapability,
): ReadonlyArray<string> {
  return capability.opaqueProperties.flatMap((retention) =>
    element.$type === retention.ownerType &&
      Object.hasOwn(element, retention.property)
      ? [retention.property]
      : []
  );
}

/** Validates only the standard retained roots. Descendants stay opaque and execution-neutral. */
export function opaqueRetentionRejections(
  element: ElementRecord,
  locus: ElementLocus,
  capability: OpaqueRetentionCapability,
): ReadonlyArray<ElementRejection> {
  return capability.opaqueProperties.flatMap((retention) => {
    if (
      element.$type !== retention.ownerType ||
      !Object.hasOwn(element, retention.property)
    ) {
      return [];
    }
    const value = element[retention.property];
    if (!Array.isArray(value)) {
      return [invalidOpaqueRoot(element, locus, retention.property)];
    }
    return value.flatMap((entry, index) => {
      const root = asElement(entry);
      return root?.$type === retention.rootType
        ? []
        : [
            invalidOpaqueRoot(
              root ?? element,
              containedLocus(containedLocus(locus, retention.property), index),
              null,
            ),
          ];
    });
  });
}

/** Whether a located parsed element sits wholly below one selected opaque property root. */
export function isWithinOpaqueRetention(
  target: ElementLocus,
  located: ReadonlyMap<ElementRecord, ElementLocus>,
  capability: OpaqueRetentionCapability | undefined,
): boolean {
  if (capability === undefined) {
    return false;
  }
  return [...located].some(([owner, ownerLocus]) =>
    capability.opaqueProperties.some((retention) =>
      owner.$type === retention.ownerType &&
      isOpaqueDescendant(target, ownerLocus, retention.property)
    )
  );
}

/**
 * Proves an otherwise unlocated parser warning arose lexically inside a selected standard
 * UserTask.renderings subtree. Located warnings use the parsed containment path directly.
 */
export function isWarningWithinOpaqueRendering(
  diagnostic: BpmnSourceDiagnostic,
  xml: string,
  capability: OpaqueRetentionCapability | undefined,
  located?: ReadonlyMap<ElementRecord, ElementLocus>,
): boolean {
  if (capability === undefined || capability.opaqueProperties.length === 0) {
    return false;
  }
  if (!capability.opaqueProperties.some((retention) =>
    retention.ownerType === "bpmn:UserTask" &&
    retention.property === "renderings" &&
    retention.rootType === "bpmn:Rendering"
  )) {
    return false;
  }
  const containmentPath = diagnostic.element?.containmentPath;
  if (containmentPath !== undefined) {
    return located !== undefined && [...located.values()].some((locus) =>
      renderContainmentPath(locus) === containmentPath &&
      isWithinOpaqueRetention(locus, located, capability)
    );
  }
  const position = diagnostic.evidence.match(
    /(?:^|\n)\s*line:\s*(\d+)\s*\n\s*column:\s*(\d+)/u,
  );
  const line = Number(position?.[1]);
  const column = Number(position?.[2]);
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column)) {
    return false;
  }
  const offset = sourceOffset(xml, line, column);
  return offset !== undefined &&
    isSourceOffsetInsideBpmnUserTaskRendering(xml, offset);
}

function renderContainmentPath(locus: ElementLocus): string {
  return locus.segments.reduce<string>(
    (path, segment) =>
      typeof segment === "number"
        ? `${path}[${segment}]`
        : path.length === 0
          ? segment
          : `${path}/${segment}`,
    "",
  );
}

function invalidOpaqueRoot(
  element: ElementRecord,
  locus: ElementLocus,
  subject: string | null,
): ElementRejection {
  return rejectElement(
    element,
    locus,
    subject === null
      ? BpmnSourceDiagnosticCode.UnsupportedElementType
      : BpmnSourceDiagnosticCode.UnsupportedProperty,
    subject,
    subject === null
      ? BpmnAdmissionCapability.PreserveElementType
      : BpmnAdmissionCapability.PreserveProperty,
  );
}

function isOpaqueDescendant(
  target: ElementLocus,
  owner: ElementLocus,
  property: string,
): boolean {
  const prefix = [...owner.segments, property];
  return target.segments.length > prefix.length &&
    prefix.every((segment, index) => target.segments[index] === segment) &&
    typeof target.segments[prefix.length] === "number";
}

function sourceOffset(
  xml: string,
  oneBasedLine: number,
  column: number,
): number | undefined {
  let offset = 0;
  for (let line = 1; line < oneBasedLine; line += 1) {
    const newline = xml.indexOf("\n", offset);
    if (newline < 0) {
      return undefined;
    }
    offset = newline + 1;
  }
  return Math.min(offset + column, xml.length);
}

type OpenElement = Readonly<{
  localName: string;
  namespaceUri: string | undefined;
  namespaces: ReadonlyMap<string, string>;
  insideRendering: boolean;
}>;

export function isSourceOffsetInsideBpmnUserTaskRendering(
  xml: string,
  offset: number,
): boolean {
  const stack: OpenElement[] = [];
  let cursor = 0;
  while (cursor < offset) {
    const start = xml.indexOf("<", cursor);
    if (start < 0 || start >= offset) {
      break;
    }
    if (xml.startsWith("<!--", start)) {
      cursor = skipMarkup(xml, start, "-->");
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      cursor = skipMarkup(xml, start, "]]>");
      continue;
    }
    if (xml.startsWith("<?", start)) {
      cursor = skipMarkup(xml, start, "?>");
      continue;
    }
    const end = findTagEnd(xml, start + 1);
    if (end === undefined) {
      return false;
    }
    const tag = xml.slice(start, end + 1);
    if (/^<\s*\//u.test(tag)) {
      stack.pop();
      cursor = end + 1;
      continue;
    }
    if (/^<\s*!/u.test(tag)) {
      cursor = end + 1;
      continue;
    }
    const qualifiedName = /^<\s*([^\s/>]+)/u.exec(tag)?.[1];
    if (qualifiedName === undefined) {
      return false;
    }
    const parent = stack[stack.length - 1];
    const namespaces = new Map(parent?.namespaces ?? []);
    for (const declaration of tag.matchAll(
      /\sxmlns(?::([^\s=]+))?\s*=\s*(["'])(.*?)\2/gu,
    )) {
      namespaces.set(declaration[1] ?? "", declaration[3] ?? "");
    }
    const separator = qualifiedName.indexOf(":");
    const prefix = separator < 0 ? "" : qualifiedName.slice(0, separator);
    const localName = separator < 0
      ? qualifiedName
      : qualifiedName.slice(separator + 1);
    const namespaceUri = namespaces.get(prefix);
    const insideRendering = parent?.insideRendering === true ||
      namespaceUri === bpmnNamespace &&
        localName === "rendering" &&
        parent?.namespaceUri === bpmnNamespace &&
        parent.localName === "userTask";
    if (!/\/\s*>$/u.test(tag)) {
      stack.push({ localName, namespaceUri, namespaces, insideRendering });
    }
    cursor = end + 1;
  }
  return stack.some(({ insideRendering }) => insideRendering);
}

function skipMarkup(xml: string, start: number, close: string): number {
  const end = xml.indexOf(close, start);
  return end < 0 ? xml.length : end + close.length;
}

function findTagEnd(xml: string, start: number): number | undefined {
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
