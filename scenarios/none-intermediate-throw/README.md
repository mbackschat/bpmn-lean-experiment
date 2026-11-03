# None Intermediate Throw Event scenarios

The [None Throw proposal](../../docs/capsules/NONE-INTERMEDIATE-THROW-PROPOSAL.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [warranty repair](warranty-repair.bpmn) with its [handler](warranty-repair-overlay.json) diagnoses a fault, throws *Fault diagnosed* and repairs the device in a Sub-Process whose body throws *Repair started* before replacing the part, ordering a spare part through a mapped Service Task and testing the device into its own `result`, copied out to `testResult`. A passed device throws *Device released*; otherwise *Rework requested* re-enters the Sub-Process through a Merge.
- The [onboarding milestones](onboarding-milestones.bpmn) with its [handler](onboarding-milestones-overlay.json) confirms a start date and forks at the root into the declaring Sub-Process *Set up account*, whose body creates the account and throws *Account ready*, and the None Throw *Welcome sent* before the mapped Service Task *Order laptop*; the join throws *Onboarding complete*.

The [source test](../../packages/bpmn-source/test/none-intermediate-throw-source.test.ts) compiles both models at the Program and checked levels and refuses the one-fact edits that leave the class.
