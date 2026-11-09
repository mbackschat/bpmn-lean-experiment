/**
 * The correlation ingress Workflow: one per correlation address (a correlation scope and a Message channel), the
 * cross-instance router of the architecture's [Temporal hosting](../../../docs/kernel/ARCHITECTURE-SPEC.md#temporal-hosting-and-refinement-preflight).
 *
 * Process chains register the open correlated waits they hold on its channel (`register`); publications arrive as
 * `publish` Updates and are taken one at a time in arrival order. For each, the ingress asks every registered chain
 * which of its waits match now (one Activity querying them), delivers to the sole match through that chain's `deliver`
 * Update (one Activity), and settles the publication in a bounded ledger, so a repeated command identifier is answered
 * from it. Zero or several matches settle without a delivery. The decisions are `correlation.ts`'s; this module only
 * sequences them. A publication the kernel's codec cannot carry is refused by the Update's validator.
 *
 * The ingress runs until its history suggests Continue-As-New; it then waits until no publication is queued or in
 * flight and every Update handler has finished, and carries its state.
 */
import {
  ApplicationFailure,
  allHandlersFinished,
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import {
  canonicalJson,
  candidates,
  deliveryStimulus,
  delivered,
  emptyIngress,
  forget,
  publicationContent,
  question,
  recorded,
  register,
  route,
  settle,
  unrouted,
  Routing,
  type IngressState,
} from "./correlation.js";
import type { CorrelatedPublication, PublicationResult } from "./host-contract.js";
import type { KernelPort } from "./port.js";
import { publishUpdate, registerUpdate, rejectionType, type HostActivities, type IngressArgs } from "./protocol.js";

/** Transport retries only: a routing Activity's answer is the routing fact; its transport failure is never one. */
const activities = proxyActivities<Pick<HostActivities, "scanCorrelation" | "deliverCorrelated">>({
  startToCloseTimeout: "1m",
  retry: { initialInterval: "1s", backoffCoefficient: 2, maximumInterval: "1m" },
});

export function createRunCorrelationIngress<P, S, I>(port: KernelPort<P, S, I>): (args: IngressArgs) => Promise<void> {
  return (args) => hostIngress(port, args);
}

async function hostIngress<P, S, I>(port: KernelPort<P, S, I>, args: IngressArgs): Promise<void> {
  let state: IngressState = args.carried ?? emptyIngress;
  const queue: CorrelatedPublication[] = [];
  let inFlight: string | null = null;

  setHandler(registerUpdate, (registration) => {
    state = register(state, registration);
  });

  setHandler(publishUpdate, async (publication) => {
    const content = publicationContent(publication);
    const settled = (): PublicationResult | null => recorded(state, publication.commandId, content);
    const known = settled();
    if (known !== null) return known;
    if (inFlight !== publication.commandId && !queue.some((queued) => queued.commandId === publication.commandId)) {
      queue.push(publication);
    }
    await condition(() => settled() !== null);
    const result = settled();
    if (result === null) throw new TypeError(`publication ${publication.commandId} settled without a result`);
    return result;
  }, {
    validator: (publication) => {
      if (publication.correlationScope !== args.correlationScope || canonicalJson(publication.channel) !== canonicalJson(args.channel)) {
        throw ApplicationFailure.create({ message: "publication-wrong-address", type: rejectionType, nonRetryable: true });
      }
      try {
        port.decodeStimulus(deliveryStimulus(publication, { processInstanceId: "", elementId: "", activation: 0 }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw ApplicationFailure.create({ message: `malformed-publication: ${reason}`, type: rejectionType, nonRetryable: true });
      }
    },
  });

  for (;;) {
    await condition(() => queue.length > 0 || workflowInfo().continueAsNewSuggested);
    const publication = queue.shift();
    if (publication === undefined) {
      await condition(allHandlersFinished);
      if (queue.length > 0) continue;
      return continueAsNew<(next: IngressArgs) => Promise<void>>({ ...args, carried: state });
    }
    inFlight = publication.commandId;
    const ordinal = state.ordinal + 1;
    state = { ...state, ordinal };
    const scanned = await activities.scanCorrelation({ candidates: candidates(state), question: question(publication) });
    state = forget(state, scanned);
    const routed = route(scanned);
    const result = routed.kind === Routing.One
      ? delivered(ordinal, routed.target, await activities.deliverCorrelated({
        workflowId: routed.target.workflowId,
        stimulus: deliveryStimulus(publication, routed.target.occurrence),
      }))
      : unrouted(ordinal, routed);
    state = settle(state, { commandId: publication.commandId, content: publicationContent(publication), result });
    inFlight = null;
  }
}
