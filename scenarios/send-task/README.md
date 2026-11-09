# Send Task scenarios

The [Send Task specification](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) owns the bounded account; both models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Send Task to a caller-supplied Activity handler that performs the send.

- The [shipping notice](shipping-notice.bpmn) with its [handler](shipping-notice-overlay.json) packs an order in the User Task *Pack order* and then sends the shipping notice through the Send Task *Send shipping notice*, whose inputs carry the customer's address as `recipient`, the order as `correlationId` and the literal channel `email`.
- The [claim acknowledgement](claim-acknowledgement.bpmn) with its [handler](claim-acknowledgement-overlay.json) opens the Sub-Process *Intake*, which forks into the Send Task *Acknowledge claim*, sending the claim reference, and the User Task *Assess claim*, joins them and is followed by the User Task *Settle claim*.

The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenSendTaskProbeTest.java) drives all three journeys in CIB Seven `2.2.0` with each handler as a delegate bean.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Shipping notice](shipping-notice.scenario.json) packs the order and completes the send with an empty result.
- [Claim, assessed first](claim-assessed-first.scenario.json) completes *Assess claim* before the acknowledgement's result.
- [Claim, acknowledged first](claim-acknowledged-first.scenario.json) completes the acknowledgement before *Assess claim*.
