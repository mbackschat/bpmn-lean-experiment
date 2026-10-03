import type { ScalarIoSpecification } from "@bpmn-lean/semantic-core";
import { asElement, asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

export type ParsedScalarIoSpecification = Readonly<{
  declaration: ScalarIoSpecification;
  input: ElementRecord;
  output: ElementRecord;
}>;

/** Retains exact parser ownership and singleton membership for CDATA-MATCH-01. */
export function projectScalarIoSpecification(owner: ElementRecord): ParsedScalarIoSpecification | undefined {
  const ownerId = readId(owner);
  const io = asElement(owner.ioSpecification);
  if (ownerId === undefined || io === undefined || io.$parent !== owner ||
      io.$type !== "bpmn:InputOutputSpecification" || readId(io) === undefined ||
      !hasOnlyModelledKeys(io, ["$type", "id", "dataInputs", "dataOutputs", "inputSets", "outputSets"])) return undefined;
  const input = onlyElement(io.dataInputs);
  const output = onlyElement(io.dataOutputs);
  const inputSet = onlyElement(io.inputSets);
  const outputSet = onlyElement(io.outputSets);
  if (input === undefined || output === undefined || inputSet === undefined || outputSet === undefined ||
      !scalarPort(input, io, "bpmn:DataInput") || !scalarPort(output, io, "bpmn:DataOutput") ||
      !requiredSet(inputSet, io, "bpmn:InputSet", "dataInputRefs", input) ||
      !requiredSet(outputSet, io, "bpmn:OutputSet", "dataOutputRefs", output)) return undefined;
  const ids = [ownerId, readId(io), readId(input), readId(output), readId(inputSet), readId(outputSet)];
  if (new Set(ids).size !== ids.length) return undefined;
  const inputId = readId(input);
  const outputId = readId(output);
  const id = readId(io);
  const inputSetId = readId(inputSet);
  const outputSetId = readId(outputSet);
  if (id === undefined || inputId === undefined || outputId === undefined ||
      inputSetId === undefined || outputSetId === undefined) return undefined;
  return {
    input, output,
    declaration: {
      ownerId, id,
      input: { id: inputId, name: optionalName(input) },
      output: { id: outputId, name: optionalName(output) },
      inputSet: { id: inputSetId, name: optionalName(inputSet), dataInputRefs: [inputId] },
      outputSet: { id: outputSetId, name: optionalName(outputSet), dataOutputRefs: [outputId] },
    },
  };
}

function onlyElement(value: unknown): ElementRecord | undefined {
  const elements = asElementArray(value);
  return elements?.length === 1 ? elements[0] : undefined;
}

function scalarPort(port: ElementRecord, io: ElementRecord, type: string): boolean {
  return port.$parent === io && port.$type === type && readId(port) !== undefined &&
    hasOnlyModelledKeys(port, ["$type", "id", "name"]) &&
    (port.name === undefined || typeof port.name === "string") &&
    port.isCollection === false && port.itemSubjectRef === undefined && port.dataState === undefined;
}

function requiredSet(set: ElementRecord, io: ElementRecord, type: string,
  references: "dataInputRefs" | "dataOutputRefs", port: ElementRecord): boolean {
  // moddle references are non-enumerable, so key admission cannot reject these BPMN set relationships.
  const excluded = references === "dataInputRefs"
    ? ["optionalInputRefs", "whileExecutingInputRefs", "outputSetRefs"]
    : ["optionalOutputRefs", "whileExecutingOutputRefs", "inputSetRefs"];
  return set.$parent === io && set.$type === type && readId(set) !== undefined &&
    hasOnlyModelledKeys(set, ["$type", "id", "name", references]) &&
    (set.name === undefined || typeof set.name === "string") && onlyElement(set[references]) === port &&
    excluded.every((reference) => set[reference] === undefined);
}

function optionalName(element: ElementRecord): string | null {
  return typeof element.name === "string" ? element.name : null;
}
