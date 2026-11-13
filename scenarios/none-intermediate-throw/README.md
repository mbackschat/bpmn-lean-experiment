# None Intermediate Throw Event scenarios

The [None Throw specification](../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) owns the bounded account; the models are witnesses for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [warranty repair](warranty-repair.bpmn) with its [handler](warranty-repair-overlay.json) diagnoses a fault, throws *Fault diagnosed* and repairs the device in a Sub-Process whose body throws *Repair started* before replacing the part, ordering a spare part through a mapped Service Task and testing the device into its own `result`, copied out to `testResult`. A passed device throws *Device released*; otherwise *Rework requested* re-enters the Sub-Process through a Merge.
- The [onboarding milestones](onboarding-milestones.bpmn) with its [handler](onboarding-milestones-overlay.json) confirms a start date and forks at the root into the declaring Sub-Process *Set up account*, whose body creates the account and throws *Account ready*, and the None Throw *Welcome sent* before the mapped Service Task *Order laptop*; the join throws *Onboarding complete*.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Warranty passed](warranty-passed.scenario.json) diagnoses, repairs and passes the device in one round.
- [Warranty rework](warranty-rework.scenario.json) fails the first test and passes the second.
- [Account first](onboarding-account-first.scenario.json) creates the account before the *Order laptop* result.
- [Laptop first](onboarding-laptop-first.scenario.json) takes the *Order laptop* result before the account.
