/**
 * Settles the pre-start capacity envelope of the portable handoff against the real Workflow encoders.
 *
 * The oracle is the encoders themselves: the maximal journey (a full-allowance Start order and two full-allowance
 * completions) is driven through the actual candidate preflight, publication, successor, Query, terminal-envelope,
 * recovery-ledger and retention owners, and for every hosted budget the measured bytes must stay within the
 * envelope's estimate (soundness of the bookkeeping allowances) and within the production limit. The envelope never
 * sees these encoders, so an allowance that an encoder outgrows fails here rather than in production.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  StimulusKind,
  isSingletonBusinessItem,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CompleteUserTaskInstanceStimulus,
  StartProcessStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  runStartCapacityJourney,
  startCapacityEnvelopeBudgets,
} from "@bpmn-lean/temporal-protocol";

import {
  escapeHeavyAllowanceValue,
  measureWithWorkflowEncoders,
  nodeHeavyValue,
} from "./start-capacity-encoder-measurement.ts";
import {
  portableHandoffProgram,
  portableHandoffStart,
} from "../../protocol/test/portable-handoff-capacity-fixture.ts";

const production = productionStartCapacityEnvelopeLimits();

/** Identifier shapes the allowances must stay sound for: the retained short ones, then long instance and command IDs. */
const identifierShapes = [
  { label: "short identifiers", instanceId: "Order_1", startCommandId: "start-order" },
  { label: "long instance ID", instanceId: "I".repeat(512), startCommandId: "start-order" },
  { label: "long Start command ID", instanceId: "Order_1", startCommandId: "S".repeat(2_048) },
] as const;

function completion(
  instanceId: string,
  elementId: string,
  output: string,
  ordinal: number,
  value: BusinessValue = fullAllowanceValue(),
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 },
    submittedValues: [{ name: output, value }],
  };
}

/** The handoff's two completions after `start`, each submitting `output`. */
function handoffCompletions(start: StartProcessStimulus, output: BusinessValue = fullAllowanceValue()): Stimulus[] {
  return [
    completion(start.instanceId, "ReviewOrder", "ReviewOrder_out", 1, output),
    completion(start.instanceId, "ArchiveOrder", "ArchiveOrder_out", 2, output),
  ];
}

for (const { label, instanceId, startCommandId } of identifierShapes) {
  test(`the envelope bounds every Workflow encoder for the maximal journey, ${label}`, async (context) => {
    const program = await portableHandoffProgram();
    const start = portableHandoffStart(instanceId, fullAllowanceValue(), startCommandId);
    const envelope = assessStartCapacityEnvelope(start, program);
    assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
    const actual = measureWithWorkflowEncoders(program, start, handoffCompletions(start));
    for (const budget of startCapacityEnvelopeBudgets) {
      const estimate = envelope.estimates[budget];
      context.diagnostic(`${budget}: actual ${actual[budget]}, estimate ${estimate}, limit ${production[budget]}`);
      assert.ok(actual[budget] > 0, `${budget} was exercised`);
      assert.ok(actual[budget] <= estimate, `${budget}: actual ${actual[budget]} exceeds estimate ${estimate}`);
      assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production`);
    }
  });
}

test("the envelope's journey submits exactly the stimuli an independent drive of the model uses", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const { steps } = runStartCapacityJourney(start, program);
  assert.deepEqual(steps.map(({ stimulus }) => stimulus), [
    start,
    completion("Order_1", "ReviewOrder", "ReviewOrder_out", 1),
    completion("Order_1", "ArchiveOrder", "ArchiveOrder_out", 2),
  ]);
});

test("at production limits the longest instance ID the envelope admits fits every real encoder, one byte shorter than the refused one", async (context) => {
  const program = await portableHandoffProgram();
  const value = fullAllowanceValue();
  const fits = (length: number) => assessStartCapacityEnvelope(
    portableHandoffStart("I".repeat(length), value), program).kind === StartCapacityEnvelopeResultKind.WithinCapacity;
  let low = 1;
  let high = 64 * 1024;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  const longest = portableHandoffStart("I".repeat(low), value, "start-order");
  const admittedEnvelope = assessStartCapacityEnvelope(longest, program);
  assert.ok(admittedEnvelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  const admittedActual = measureWithWorkflowEncoders(program, longest, handoffCompletions(longest));
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(admittedActual[budget] <= admittedEnvelope.estimates[budget],
      `${budget}: actual ${admittedActual[budget]} exceeds estimate ${admittedEnvelope.estimates[budget]} at the longest admitted instance ID`);
    assert.ok(admittedActual[budget] <= production[budget], `${budget} holds at the longest admitted instance ID`);
  }
  const refused = assessStartCapacityEnvelope(portableHandoffStart("I".repeat(high), value), program);
  assert.ok(refused.kind === StartCapacityEnvelopeResultKind.Exceeded);
  assert.equal(high, low + 1);
  // The envelope is conservative by design: the real encoders are not required to overflow at `high`.
  context.diagnostic(`refused at ${high} instance-ID bytes by ${refused.failure.budget}: ` +
    `estimate ${refused.failure.estimatedValue} over ${refused.failure.configuredBound}`);
});

test("outputs of other shapes within the allowance stay inside the envelope reserved by the sentinel", async () => {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("Order_1", fullAllowanceValue());
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
  for (const output of [escapeHeavyAllowanceValue("\""), escapeHeavyAllowanceValue("\u0001"), nodeHeavyValue()]) {
    assert.ok(isSingletonBusinessItem(output));
    const actual = measureWithWorkflowEncoders(program, start, handoffCompletions(start, output));
    for (const budget of startCapacityEnvelopeBudgets) {
      assert.ok(actual[budget] <= envelope.estimates[budget],
        `${budget}: actual ${actual[budget]} exceeds the sentinel estimate ${envelope.estimates[budget]}`);
    }
  }
});

/**
 * Allowances fitted at sampled lengths can hide a missing identifier copy behind `fixedBytes`, so at a short and a
 * long length one more identifier byte must add at least as many bytes to every estimate as to its encoder. Adjacent
 * lengths compare copy counts; wider spans would also compare which batch is largest.
 */
test("every estimate counts at least as many copies of each caller-chosen identifier as its encoder", async () => {
  const program = await portableHandoffProgram();
  const value = fullAllowanceValue();
  const dimensions = [
    { label: "instance ID", start: (length: number) => portableHandoffStart("I".repeat(length), value) },
    { label: "Start command ID", start: (length: number) => portableHandoffStart("Order_1", value, "S".repeat(length)) },
  ] as const;
  const measure = (start: StartProcessStimulus) => {
    const envelope = assessStartCapacityEnvelope(start, program);
    assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity);
    return { estimates: envelope.estimates, actual: measureWithWorkflowEncoders(program, start, handoffCompletions(start)) };
  };
  for (const { label, start } of dimensions) {
    for (const length of [16, 700]) {
      const shorter = measure(start(length));
      const longer = measure(start(length + 1));
      for (const budget of startCapacityEnvelopeBudgets) {
        const actualGrowth = longer.actual[budget] - shorter.actual[budget];
        const estimateGrowth = longer.estimates[budget] - shorter.estimates[budget];
        assert.ok(actualGrowth <= estimateGrowth,
          `${label} at ${length}, ${budget}: encoder grows ${actualGrowth} bytes per byte, estimate ${estimateGrowth}`);
      }
    }
  }
});
