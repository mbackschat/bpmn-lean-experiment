# Scope host split scenarios

The [scope host specification](../../docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its Service Task to a caller-supplied Activity handler.

The [employee onboarding](employee-onboarding.bpmn) with its [handlers](employee-onboarding-overlay.json) splits three times without a gateway. The root None Start *Hire confirmed* opens the mapped Service Task *Register hire* and the User Task *Prepare workstation*, which a Parallel join meets. The Sub-Process *Issue equipment* follows; its body Start opens *Issue badge* and *Issue laptop*, joined inside the body. *Issue equipment* itself leaves on two flows: to *Confirm IT access* and to the None End *Notify facilities*, a terminal branch.

The [source test](../../packages/bpmn-source/test/scope-host-split-source.test.ts) compiles the model at the Program and checked levels and refuses the one-fact edits that leave the class, each beside an admitted control.

Two answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/scope-host-split-pipeline-cases.ts); together they complete each split's branches in both orders, each with one seeded mutation:

- [Register first](onboarding-register-first.scenario.json) completes *Register hire* before *Prepare workstation* and *Issue badge* before *Issue laptop*; its mutation opens *Issue badge* alone after the body split, as a split taking its first flow only would.
- [Workstation first](onboarding-workstation-first.scenario.json) completes them in the other orders; its mutation leaves *Confirm IT access* closed after *Issue equipment* completes, as an exit taking its first output only would.
