# Scope host split scenarios

The [scope host specification](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), with an exact source overlay binding its Service Task to a caller-supplied Activity handler.

The [employee onboarding](employee-onboarding.bpmn) with its [handlers](employee-onboarding-overlay.json) splits three times without a gateway. The root None Start *Hire confirmed* opens the mapped Service Task *Register hire* and the User Task *Prepare workstation*, which a Parallel join meets. The Sub-Process *Issue equipment* follows; its body Start opens *Issue badge* and *Issue laptop*, joined inside the body. *Issue equipment* itself leaves on two flows: to *Confirm IT access* and to the None End *Notify facilities*, a terminal branch.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Register first](onboarding-register-first.scenario.json) completes *Register hire* before *Prepare workstation* and *Issue badge* before *Issue laptop*.
- [Workstation first](onboarding-workstation-first.scenario.json) completes them in the other orders.
