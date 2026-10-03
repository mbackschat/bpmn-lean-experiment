import { CallDataKind, callDataInterfaceValid, compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import type { ScalarCallData } from "@bpmn-lean/semantic-core";
import { hasExactInputAssociation, hasExactOutputAssociation, scalarProcessProperties } from "./activity-data-input-output-projection.js";
import { asElement, asElementArray, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { projectScalarIoSpecification } from "./scalar-io-specification.js";

/** Projects data for an already QName-resolved Call; control/topology admission remains separate. */
export function projectCallDataInterfaces(
  call: ElementRecord,
  caller: ElementRecord,
  called: ElementRecord,
): ScalarCallData | undefined {
  const callId = readId(call);
  const calledId = readId(called);
  if (call.$type !== "bpmn:CallActivity" || caller.$type !== "bpmn:Process" ||
      called.$type !== "bpmn:Process" || callId === undefined || calledId === undefined || call.$parent !== caller ||
      !asElementArray(caller.flowElements)?.includes(call) ||
      scalarProcessProperties(called)?.length !== 0) return undefined;
  const properties = scalarProcessProperties(caller);
  const wrapper = projectScalarIoSpecification(call);
  const callable = projectScalarIoSpecification(called);
  const inputAssociation = asElementArray(call.dataInputAssociations)?.[0];
  const outputAssociation = asElementArray(call.dataOutputAssociations)?.[0];
  const source = asElementArray(inputAssociation?.sourceRef)?.[0];
  const target = asElement(outputAssociation?.targetRef);
  if (properties === undefined || properties.some((property) => property.$parent !== caller) ||
      wrapper === undefined || callable === undefined ||
      inputAssociation === undefined || outputAssociation === undefined ||
      source === undefined || target === undefined || !properties.includes(source) || !properties.includes(target) ||
      !hasExactInputAssociation(asElementArray(call.dataInputAssociations), source, wrapper.input, call) ||
      !hasExactOutputAssociation(asElementArray(call.dataOutputAssociations), wrapper.output, target, call)) return undefined;
  const sourceId = readId(source);
  const targetId = readId(target);
  const inputAssociationId = readId(inputAssociation);
  const outputAssociationId = readId(outputAssociation);
  const propertyIds = properties.map(readId);
  if (sourceId === undefined || targetId === undefined || inputAssociationId === undefined ||
      outputAssociationId === undefined || !propertyIds.every((id): id is string => id !== undefined)) return undefined;
  const data: ScalarCallData = {
    kind: CallDataKind.Scalar, call: wrapper.declaration, called: callable.declaration,
    callerProperties: [...propertyIds].sort(compareCanonicalStrings),
    directInput: {
      associationId: inputAssociationId, source: { kind: "property", propertyId: sourceId },
      targetDataInputId: wrapper.declaration.input.id, targetDataInputName: wrapper.declaration.input.name,
    },
    directOutput: {
      associationId: outputAssociationId, sourceDataOutputId: wrapper.declaration.output.id,
      sourceDataOutputName: wrapper.declaration.output.name, target: { kind: "property", propertyId: targetId },
    },
  };
  return callDataInterfaceValid(data, callId, calledId)
    ? data : undefined;
}
