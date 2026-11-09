# Concurrent embedded activation sources

This directory contains three exact BPMN 2.0.2 sources for the [concurrent embedded activations specification](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md). In each one, a Parallel fork's User Task branches meet at an identity-only converging Exclusive Gateway that feeds an embedded Sub-Process, so every arriving branch starts its own concurrent activation of that Sub-Process. Clause 13.4.2 passes each arriving token through the merge on its own, and Clause 13.3.4 instantiates the Sub-Process for every arriving token. That is the mechanism these sources witness.

- The [audit remediation source](audit-remediation.bpmn) reviews controls and payments in parallel inside an Audit Sub-Process. Each finding opens its own Remediation with Fix finding and Verify fix, then reports its finding, and the root closes the audit once the Audit scope quiesces.
- The [credit intake source](credit-intake.bpmn) opens an application and then runs three checks in parallel. Each check reaches its own Assess activation, which scores the applicant, and the root decides after the Intake scope quiesces.
- The [claim escalation source](claim-escalation.bpmn) places the region in a depth-2 Review body whose target, Escalation, sits at depth 3. File case and Close claim follow in the enclosing scopes.

The bounded profile admits these shapes.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Interleaved audit with a stale fix](audit-interleaved-and-stale.scenario.json) finishes the second Remediation first and then repeats its finished Fix finding, which is rejected.
- [Reversed audit](audit-reversed.scenario.json) reverses both the review order and the Remediation completion order.
- [Reverse-order intake](intake-reverse-assessments.scenario.json) completes the three Assess activations in reverse order before Decide.
