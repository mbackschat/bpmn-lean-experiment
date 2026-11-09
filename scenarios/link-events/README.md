# Link Event scenarios

The [Link Events proposal](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account. The models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json). Each one is a retained [None Throw model](../none-intermediate-throw/README.md) with three Sequence Flows interrupted by Link pairs, so the original is its explicit-flow twin. Each model's handler overlay ([warranty](warranty-repair-overlay.json), [onboarding](onboarding-milestones-overlay.json)) is a byte-identical copy of its twin's, because a scenario directory carries the overlays its scenarios declare.

- The [warranty repair with Go To links](warranty-repair-links.bpmn) ends the rework flow at the throw *Back to repair*, whose catch leads to the Merge *Repair round*. It also ends the *Order spare part* flow inside *Repair device* at *To testing*, and the conditioned Choice candidate towards *Device released* at *Release device*.
- The [onboarding milestones with Off-Page links](onboarding-milestones-links.bpmn) ends the fork's branch to *Welcome sent* at *Welcome track*, *Create account*'s flow in *Set up account* at *Account done*, and the join's flow at *All set*.

Four answer-free schedules reuse the twins' stimuli. The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Warranty passed](warranty-passed.scenario.json) passes the device in one round.
- [Warranty rework](warranty-rework.scenario.json) fails the first test and crosses the Go To loop once.
- [Account first](onboarding-account-first.scenario.json) creates the account before the *Order laptop* result.
- [Laptop first](onboarding-laptop-first.scenario.json) takes the *Order laptop* result before the account.
