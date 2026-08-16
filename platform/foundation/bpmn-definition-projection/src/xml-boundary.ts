import { Parser } from "saxen";

import {
  BPMN_DI_NAMESPACE,
  BPMN_MODEL_NAMESPACE,
  DC_NAMESPACE,
  DI_NAMESPACE,
} from "./presentation-model.js";

const DIAGRAM_OPEN = "<bpmndi:BPMNDiagram";
const DIAGRAM_CLOSE = "</bpmndi:BPMNDiagram>";

export function extractSelfContainedDiagram(generatedXml: string): string {
  const start = generatedXml.indexOf(DIAGRAM_OPEN);
  const nextStart = generatedXml.indexOf(DIAGRAM_OPEN, start + DIAGRAM_OPEN.length);
  const close = generatedXml.indexOf(DIAGRAM_CLOSE, start);
  if (start < 0 || nextStart >= 0 || close < 0) {
    throw new Error("generated output must contain exactly one BPMNDiagram subtree");
  }
  const subtree = generatedXml.slice(start, close + DIAGRAM_CLOSE.length);
  const localized = subtree.replace(
    DIAGRAM_OPEN,
    `${DIAGRAM_OPEN} xmlns:bpmndi="${BPMN_DI_NAMESPACE}" xmlns:dc="${DC_NAMESPACE}" xmlns:di="${DI_NAMESPACE}"`,
  );
  assertNamespaceStrictXml(localized, "generated BPMN DI");
  return localized;
}

export function composePresentationXml(
  sourceXml: string,
  diagramInterchangeXml: string,
): string {
  assertNamespaceStrictXml(diagramInterchangeXml, "generated BPMN DI");
  const closingTag = findDefinitionsClosingTag(sourceXml);
  const presentationXml =
    sourceXml.slice(0, closingTag.index) +
    diagramInterchangeXml +
    sourceXml.slice(closingTag.index);
  parseNamespaceStrictXml(presentationXml, "composed BPMN presentation");
  return presentationXml;
}

export function sourceContainsBpmnDiagram(sourceXml: string): boolean {
  const parser = new Parser();
  parser.ns({ [BPMN_DI_NAMESPACE]: "bpmndi" });
  let present = false;
  parser.on("openTag", (name: string) => {
    if (name === "bpmndi:BPMNDiagram") {
      present = true;
    }
  });
  const errors: Error[] = [];
  const warnings: string[] = [];
  parser.on("error", (error: Error) => errors.push(error));
  parser.on("warn", (warning: Error) => warnings.push(warning.message));
  const returned = parser.parse(sourceXml);
  if (errors.length > 0 || returned instanceof Error || warnings.length > 0) {
    const evidence = errors[0]?.message ?? returned?.message ?? warnings[0] ?? "unknown warning";
    throw new Error(`BPMN source failed namespace-strict XML parsing: ${evidence}`);
  }
  return present;
}

export function assertNamespaceStrictXml(xml: string, boundary: string): void {
  const root = xml.match(/^\s*<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\b([^>]*)>/u);
  if (root === null) {
    throw new Error(`${boundary} has no namespace-qualified document root`);
  }
  const requiredBindings = [
    ["bpmndi", BPMN_DI_NAMESPACE],
    ["dc", DC_NAMESPACE],
    ["di", DI_NAMESPACE],
  ] as const;
  const attributes = root[3] ?? "";
  for (const [prefix, namespace] of requiredBindings) {
    if (!attributes.includes(`xmlns:${prefix}="${namespace}"`)) {
      throw new Error(`${boundary} is missing the ${prefix} namespace binding`);
    }
  }
  parseNamespaceStrictXml(xml, boundary);
}

function parseNamespaceStrictXml(xml: string, boundary: string): void {
  const parser = new Parser();
  parser.ns({
    [BPMN_MODEL_NAMESPACE]: "bpmn",
    [BPMN_DI_NAMESPACE]: "bpmndi",
    [DC_NAMESPACE]: "dc",
    [DI_NAMESPACE]: "di",
  });
  const warnings: string[] = [];
  parser.on("warn", (warning: Error) => warnings.push(warning.message));
  const errors: Error[] = [];
  parser.on("error", (failure: Error) => {
    errors.push(failure);
  });
  const returned = parser.parse(xml);
  if (errors.length > 0 || returned instanceof Error || warnings.length > 0) {
    const evidence = errors[0]?.message ?? returned?.message ?? warnings[0] ?? "unknown warning";
    throw new Error(`${boundary} failed namespace-strict XML parsing: ${evidence}`);
  }
}

function findDefinitionsClosingTag(
  sourceXml: string,
): Readonly<{ index: number; tag: string }> {
  const matches = [
    ...sourceXml.matchAll(/<\/([A-Za-z_][\w.-]*:)?definitions\s*>/gu),
  ];
  if (matches.length !== 1 || matches[0]?.index === undefined) {
    throw new Error("source must contain exactly one closing definitions tag");
  }
  const match = matches[0];
  return { index: match.index, tag: match[0] };
}
