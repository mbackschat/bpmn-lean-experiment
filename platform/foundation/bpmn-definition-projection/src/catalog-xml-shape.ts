import { Parser } from "saxen";

import { BPMN_MODEL_NAMESPACE } from "./presentation-model.js";

const projectNamespace = "urn:bpmn-lean:bpmn:extensions:v1";

/** Refuses element, comment, or processing-instruction children in catalog text containers. */
export function hasChildlessCatalogTextContainers(sourceXml: string): boolean {
  const parser = new Parser();
  parser.ns({
    [BPMN_MODEL_NAMESPACE]: "bpmn",
    [projectNamespace]: "bpmnLean",
  });
  const stack: string[] = [];
  let valid = true;
  parser.on("openTag", (name: string) => {
    if (isCatalogTextContainer(stack.at(-1))) valid = false;
    stack.push(name);
  });
  parser.on("closeTag", () => {
    stack.pop();
  });
  const refuseNonTextChild = (): void => {
    if (isCatalogTextContainer(stack.at(-1))) valid = false;
  };
  parser.on("comment", refuseNonTextChild);
  parser.on("question", refuseNonTextChild);
  parser.on("attention", refuseNonTextChild);
  parser.on("warn", () => {
    valid = false;
  });
  parser.on("error", () => {
    valid = false;
  });
  const returned = parser.parse(sourceXml);
  return valid && !(returned instanceof Error) && stack.length === 0;
}

function isCatalogTextContainer(name: string | undefined): boolean {
  return name === "bpmn:documentation" || name === "bpmnLean:structuredForm";
}
