# None Intermediate Throw Event scenarios

The [None Throw proposal](../../docs/capsules/NONE-INTERMEDIATE-THROW-PROPOSAL.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [warranty repair](warranty-repair.bpmn) with its [handler](warranty-repair-overlay.json) diagnoses a fault, throws *Fault diagnosed* and repairs the device in a Sub-Process whose body throws *Repair started* before replacing the part, ordering a spare part through a mapped Service Task and testing the device into its own `result`, copied out to `testResult`. A passed device throws *Device released*; otherwise *Rework requested* re-enters the Sub-Process through a Merge.
- The [onboarding milestones](onboarding-milestones.bpmn) with its [handler](onboarding-milestones-overlay.json) confirms a start date and forks at the root into the declaring Sub-Process *Set up account*, whose body creates the account and throws *Account ready*, and the None Throw *Welcome sent* before the mapped Service Task *Order laptop*; the join throws *Onboarding complete*.

The [source test](../../packages/bpmn-source/test/none-intermediate-throw-source.test.ts) compiles both models at the Program and checked levels and refuses the one-fact edits that leave the class; the [runtime test](../../packages/bpmn-source/test/none-intermediate-throw-runtime.test.ts) runs the four journeys in committed state, and the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) calibrates them on CIB Seven `2.2.0`.

Four answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/none-intermediate-throw-pipeline-cases.ts), each with one seeded mutation:

- [Warranty passed](warranty-passed.scenario.json) diagnoses, repairs and passes the device in one round. Its mutation leaves *Fault diagnosed* open after *Diagnose fault*, as an Event lowered to a User Task wait would.
- [Warranty rework](warranty-rework.scenario.json) fails the first test and passes the second. Its mutation reopens *Replace part*'s first activation after the failed test, as a re-entry reusing the earlier occurrences would.
- [Account first](onboarding-account-first.scenario.json) creates the account before the *Order laptop* result. Its mutation leaves *Order laptop* unopened after the fork, as a waiting *Welcome sent* would.
- [Laptop first](onboarding-laptop-first.scenario.json) takes the *Order laptop* result before the account. Its mutation leaves the Process running at the end, as a waiting *Onboarding complete* would.
