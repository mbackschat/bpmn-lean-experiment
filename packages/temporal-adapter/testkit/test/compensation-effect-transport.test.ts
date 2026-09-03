import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectOperation,
  EffectProtocol,
  VariableValueKind,
  type CompensationEffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import {
  canonicalCompensationEffectTransportEncoding,
  compensationEffectTransportKey,
} from "@bpmn-lean/temporal-testkit";

type IdentityMutation = Readonly<{
  field: string;
  mutate: (
    base: CompensationEffectTransportMaterial,
  ) => CompensationEffectTransportMaterial;
}>;

const material = {
  definition: {
    semanticProfile: "compensation-source-checkpoint",
    sourceId: "compensation-source",
    sourceSha256: "1".repeat(64),
    sourceOverlay: {
      id: "compensation-overlay",
      sha256: "2".repeat(64),
    },
    processId: "Process_Compensation",
  },
  triggerId: {
    processInstanceId: "Instance_1",
    elementId: "operation:TriggerCompensation",
    activation: 1,
  },
  handlerId: {
    processInstanceId: "Instance_1",
    elementId: "Undo_B",
    activation: 1,
  },
  effectId: {
    processInstanceId: "Instance_1",
    elementId: "Effect_Undo_B",
    activation: 1,
  },
  descriptor: {
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.CompensationSingleEffect,
  },
  arguments: [{
    name: "archivedContext",
    value: { kind: VariableValueKind.String, value: "frozen" },
  }],
} as const satisfies CompensationEffectTransportMaterial;

test("encodes and digests the complete committed compensation effect intent", () => {
  assert.equal(
    canonicalCompensationEffectTransportEncoding(material),
    '["compensationEffectTransport",["compensation-source-checkpoint","compensation-source","1111111111111111111111111111111111111111111111111111111111111111",["some","compensation-overlay","2222222222222222222222222222222222222222222222222222222222222222"],"Process_Compensation"],["Instance_1","operation:TriggerCompensation",1],["Instance_1","Undo_B",1],["Instance_1","Effect_Undo_B",1],["urn:bpmn-lean:effect-protocol:activity-v1","urn:bpmn-lean:effect-operation:compensation-single-effect-v1"],[["archivedContext",["string","frozen"]]]]',
  );
  assert.equal(
    compensationEffectTransportKey(material),
    "effect-transport-sha256:7c4f290444620b5d6fe1239a46db4c03bc5eea8450d77cbbf578668369df06a7",
  );
});

const identityMutations: ReadonlyArray<IdentityMutation> = [
  {
    field: "definition.semanticProfile",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, semanticProfile: "other-profile" },
    }),
  },
  {
    field: "definition.sourceId",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, sourceId: "other-source" },
    }),
  },
  {
    field: "definition.sourceSha256",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, sourceSha256: "3".repeat(64) },
    }),
  },
  {
    field: "definition.sourceOverlay",
    mutate: (base) => ({
      ...base,
      definition: {
        ...base.definition,
        sourceOverlay: { id: "other-overlay", sha256: "4".repeat(64) },
      },
    }),
  },
  {
    field: "definition.processId",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, processId: "Other_Process" },
    }),
  },
  ...occurrenceMutations("triggerId"),
  ...occurrenceMutations("handlerId"),
  ...occurrenceMutations("effectId"),
  {
    field: "descriptor.protocol",
    mutate: (base) => withDescriptorMutation(
      base,
      "urn:bpmn-lean:effect-protocol:other-v1",
      base.descriptor.operation,
    ),
  },
  {
    field: "descriptor.operation",
    mutate: (base) => withDescriptorMutation(
      base,
      base.descriptor.protocol,
      "urn:bpmn-lean:effect-operation:other-v1",
    ),
  },
  {
    field: "arguments.presence",
    mutate: (base) => ({ ...base, arguments: [] }),
  },
  {
    field: "arguments.name",
    mutate: (base) => {
      const argument = requireArgument(base);
      return {
        ...base,
        arguments: [{ ...argument, name: "otherArgument" }],
      };
    },
  },
  {
    field: "arguments.value.kind",
    mutate: (base) => {
      const argument = requireArgument(base);
      return {
        ...base,
        arguments: [{
          name: argument.name,
          value: { kind: VariableValueKind.Boolean, value: true },
        }],
      };
    },
  },
  {
    field: "arguments.value.value",
    mutate: (base) => {
      const argument = requireArgument(base);
      return {
        ...base,
        arguments: [{
          name: argument.name,
          value: { kind: VariableValueKind.String, value: "other-frozen" },
        }],
      };
    },
  },
];

test("binds every compensation definition, occurrence, descriptor, and typed argument field", () => {
  for (const { field, mutate } of identityMutations) {
    assert.notEqual(
      compensationEffectTransportKey(material),
      compensationEffectTransportKey(mutate(material)),
      `${field} must participate in compensation transport identity`,
    );
  }
});

test("the handler omission mutation collapses a handler-only discriminating pair", () => {
  const otherHandler = {
    ...material,
    handlerId: { ...material.handlerId, elementId: "Undo_C" },
  } satisfies CompensationEffectTransportMaterial;

  assert.notEqual(
    compensationEffectTransportKey(material),
    compensationEffectTransportKey(otherHandler),
  );
  assert.equal(
    compensationEffectTransportKeyWithoutHandler(material),
    compensationEffectTransportKeyWithoutHandler(otherHandler),
  );
});

function occurrenceMutations(
  field: "triggerId" | "handlerId" | "effectId",
): ReadonlyArray<IdentityMutation> {
  return [
    {
      field: `${field}.processInstanceId`,
      mutate: (base) => ({
        ...base,
        [field]: { ...base[field], processInstanceId: "Instance_2" },
      }),
    },
    {
      field: `${field}.elementId`,
      mutate: (base) => ({
        ...base,
        [field]: { ...base[field], elementId: `Other_${field}` },
      }),
    },
    {
      field: `${field}.activation`,
      mutate: (base) => ({
        ...base,
        [field]: { ...base[field], activation: 2 },
      }),
    },
  ];
}

function compensationEffectTransportKeyWithoutHandler(
  value: CompensationEffectTransportMaterial,
): string {
  return JSON.stringify([
    "compensationEffectTransport",
    value.definition,
    value.triggerId,
    value.effectId,
    value.descriptor,
    value.arguments,
  ]);
}

function requireArgument(
  value: CompensationEffectTransportMaterial,
): CompensationEffectTransportMaterial["arguments"][number] {
  const [argument] = value.arguments;
  assert.ok(argument);
  return argument;
}

function withDescriptorMutation(
  value: CompensationEffectTransportMaterial,
  protocol: string,
  operation: string,
): CompensationEffectTransportMaterial {
  // The descriptor is currently admission-closed; this seeded invalid wire mutation proves the transport tuple still binds both atoms.
  return {
    ...value,
    descriptor: { protocol, operation },
  } as unknown as CompensationEffectTransportMaterial;
}
