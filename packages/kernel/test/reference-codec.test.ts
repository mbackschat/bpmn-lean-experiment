/**
 * The wire forms of references between definitions and of Signal addresses: a program carrying a QName on a Call and on
 * a Signal, a namespaced and deployed identity and definition, a `propagateAll` position and every profile option at its
 * non-default value encodes back to the JSON it decoded from; a stimulus addresses a Signal by exactly one of `name` and
 * `signalRef`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, encodeProgram, signalAddressToJson, stimulusFromJson } from "@bpmn-lean/kernel";

import {
  activity, append, base, callWork, catchEvent, definitionRef, end, qName, start, text, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const namespace = "urn:example:called";

const signalTrigger: Json = { signal: { payload: { signalRef: qName("Sig", namespace), name: text("S") } } };
const signalThrow: Json = {
  signal: {
    payload: {
      signalRef: qName("Sig", namespace), name: null, payload: [], propagateAll: 1, localOnly: false, businessKey: null,
      asynchronous: false,
    },
  },
};

/** The base program with every new field away from its default. */
function referencing(): Json {
  const program = withOptions(base(), {
    signalNames: "addresses", signalPayload: "variables", signalDelivery: "occurrenceTargeted",
    conditionalStart: "submittedContext", calledElementResolution: "cibKey", messageThrowForms: "cibForms",
  });
  const called = append(program, start("CS"), catchEvent("CC", signalTrigger), end("CE", signalThrow),
    activity("CT", callWork({ calledQName: qName("Called", namespace) }), { incoming: [], outgoing: [] }));
  return wired({
    ...called,
    identity: { ...(called.identity as Json), namespace: "urn:example:root", deployment: 3 },
    processes: [{
      definition: definitionRef("Called", { namespace, deployment: 2 }), children: ["CS", "CC", "CE", "CT"], variables: [],
      executable: true,
    }],
  });
}

test("a program's QNames, namespaces, deploy ordinals, propagateAll position and new options encode back unchanged", () => {
  const program = referencing();
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.deepEqual(encodeProgram(decoded.value), program);
});

test("a definition's namespace and deploy ordinal are required members", () => {
  const program = referencing();
  const processes = program.processes as Json[];
  const { deployment: _, ...withoutDeployment } = (processes[0] as Json).definition as Json;
  const decoded = decodeProgram({ ...program, processes: [{ ...processes[0], definition: withoutDeployment }] });
  assert.ok(!decoded.ok);
  assert.match(decoded.refusal, /^codec\.missingField: .*definition\.deployment$/);
});

const startSignal = (address: Json): Json =>
  ({ kind: "start", commandId: "s", instanceId: "I", variables: [], trigger: { kind: "signal", variables: [], ...address } });
const deliverSignal = (address: Json, extra: Json = {}): Json => ({
  kind: "deliver", commandId: "d", occurrence: { processInstanceId: "I", elementId: "C", activation: 1 },
  trigger: { kind: "signal", ...address }, ...extra,
});

function startAddress(stimulus: Json): Json {
  const decoded = stimulusFromJson(stimulus);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const input = decoded.value[1];
  assert.ok(input.tag === "start" && input.payload.trigger.tag === "signal");
  return signalAddressToJson(input.payload.trigger.address) as Json;
}

test("a Signal start addresses its Signal by name or by signalRef, with or without a namespace", () => {
  for (const address of [{ name: "S" }, { signalRef: { id: "Sig" } }, { signalRef: { namespace, id: "Sig" } }]) {
    assert.deepEqual(startAddress(startSignal(address)), address);
  }
});

test("a Signal delivery carries its address and optional variables", () => {
  const decoded = stimulusFromJson(deliverSignal({ signalRef: { namespace, id: "Sig" } }, { variables: [{ name: "x", value: { kind: "string", value: "y" } }] }));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const input = decoded.value[1];
  assert.ok(input.tag === "deliver" && input.payload.trigger.tag === "signal");
  assert.deepEqual(signalAddressToJson(input.payload.trigger.address), { signalRef: { namespace, id: "Sig" } });
  assert.equal(input.payload.variables.length, 1);
});

test("a Signal address with both or neither of name and signalRef is refused", () => {
  const refusal = (json: Json): string => {
    const decoded = stimulusFromJson(json);
    assert.ok(!decoded.ok);
    return decoded.refusal.split(":")[0] ?? decoded.refusal;
  };
  const both = { name: "S", signalRef: { id: "Sig" } };
  assert.equal(refusal(startSignal(both)), "codec.malformed");
  assert.equal(refusal(deliverSignal(both)), "codec.malformed");
  assert.equal(refusal(startSignal({})), "codec.missingField");
  assert.equal(refusal(deliverSignal({})), "codec.missingField");
  assert.equal(refusal(startSignal({ signalRef: { id: "Sig", local: "x" } })), "codec.unknownField");
});
