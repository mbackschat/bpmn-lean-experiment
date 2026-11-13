# Exclusive Choice without a default scenarios

The [Exclusive Choice without a default proposal](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account. Both models are witnesses for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one mapped Service Task to a caller-supplied Activity handler.

- The [expense routing](expense-routing.bpmn), with its [handler](expense-routing-overlay.json), routes a claim by its Start-supplied `priority` and `category` through the Choice *Route expense* (urgent first, then travel or equipment), which has no default, and pays it out through the Choice *Pay out*, also without a default, by the Service Task *Reimburse claimant* or the User Task *Add to payroll*.
- The [ticket triage](ticket-triage.bpmn), with its [handler](ticket-triage-overlay.json), assesses `severity` in the User Task *Triage ticket* inside the Sub-Process *Triage*, then routes through the Choice *Route by severity*, which has no default, to the User Task *Escalate* or to the Service Task *Auto-close*.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- the [urgent travel expense](urgent-travel.scenario.json) takes the first true route to *Review urgently*, then pays out by bank through *Reimburse claimant*;
- the [medium ticket](medium-triage.scenario.json) matches no route, so its triage completion rolls back and the task stays open.

Two schedules run on Lean and the TypeScript kernel only, from differential test fixtures: a [catering expense](../../packages/differential/test/fixtures/exclusive-choice-without-default-catering.scenario.json), whose Start rolls back and so creates no Workflow to observe, and a [cash payout](../../packages/differential/test/fixtures/exclusive-choice-without-default-cash-payout.scenario.json), whose review completion rolls back.

The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveChoiceWithoutDefaultProbeTest.java) drives six journeys and one parse refusal in CIB Seven `2.2.0` with JUEL renditions of the conditions:

- an urgent travel expense takes the first true route to *Review urgently*;
- a catering expense fails its Start with `ENGINE-02004` and leaves no instance;
- a cash payout fails the review's completion with `ENGINE-02004`, leaving the review open;
- a bank payout arms the reimbursement with the claimant;
- a medium ticket fails its triage completion with `ENGINE-02004`, leaving the task open, until it is completed as high;
- a low ticket arms the auto-close with the ticket.
- a payout Choice left with only its bank flow is refused when parsed.
