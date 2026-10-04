import { MappingExpressionKind, compareCanonicalStrings, isSerialBusinessIdentifier, isWellFormedWireString, serialBusinessMappingsAdmitted } from "@bpmn-lean/semantic-core";
import type { VariableMapping } from "@bpmn-lean/semantic-core";
import { asElement, asElementArray, hasOnlyModelledKeys } from "./moddle-graph.js";

export function readBusinessTaskMappings(value: unknown): Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }> | undefined {
  const mappings = readParameters(value, false);
  return mappings !== undefined && serialBusinessMappingsAdmitted(mappings.inputMappings, true) &&
    serialBusinessMappingsAdmitted(mappings.outputMappings, false) ? mappings : undefined;
}

/** CIB 2.2.0 BpmnParseUtil.parseParamValueProvider uses Java String.trim; SMIS excludes its empty-text/null arm. */
export function readSubProcessInputMappings(value: unknown): readonly VariableMapping[] | undefined {
  const mappings = readParameters(value, true);
  return mappings?.outputMappings.length === 0 ? mappings.inputMappings : undefined;
}

function readParameters(value: unknown, normalizeWhitespace: boolean): Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }> | undefined {
  if (value === undefined) return { inputMappings: [], outputMappings: [] };
  const extension = asElement(value);
  const values = asElementArray(extension?.values);
  const io = values?.[0];
  if (extension?.$type !== "bpmn:ExtensionElements" || !hasOnlyModelledKeys(extension, ["$type", "values"]) || values?.length !== 1 ||
      io?.$type !== "camunda:inputOutput" || !hasOnlyModelledKeys(io, ["$type", "$children"])) return undefined;
  const children = io.$children === undefined ? [] : asElementArray(io.$children);
  if (children === undefined) return undefined;
  const inputMappings: VariableMapping[] = [];
  const outputMappings: VariableMapping[] = [];
  for (const parameter of children) {
    if (!hasOnlyModelledKeys(parameter, ["$type", "name", "$body"]) || !isSerialBusinessIdentifier(parameter.name) || typeof parameter.$body !== "string") return undefined;
    const text = normalizeWhitespace ? parameter.$body.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/gu, "") : parameter.$body;
    const name = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(text)?.[1];
    if (name !== undefined && !isSerialBusinessIdentifier(name)) return undefined;
    if (name === undefined && (!isWellFormedWireString(text) || text.length === 0 || /[#$]\{/u.test(text))) return undefined;
    switch (parameter.$type) {
      case "camunda:inputParameter": inputMappings.push({ target: parameter.name, expression: name === undefined ?
        { kind: MappingExpressionKind.StringLiteral, value: text } : { kind: MappingExpressionKind.EnclosingVariable, name } }); break;
      case "camunda:outputParameter":
        if (name === undefined) return undefined;
        outputMappings.push({ target: parameter.name, expression: { kind: MappingExpressionKind.LocalVariable, name } }); break;
      default: return undefined;
    }
  }
  inputMappings.sort((a, b) => compareCanonicalStrings(a.target, b.target));
  outputMappings.sort((a, b) => compareCanonicalStrings(a.target, b.target));
  return new Set(inputMappings.map(mapping => mapping.target)).size === inputMappings.length &&
    new Set(outputMappings.map(mapping => mapping.target)).size === outputMappings.length ? { inputMappings, outputMappings } : undefined;
}
