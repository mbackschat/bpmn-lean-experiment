# Link Event scenarios

The [Link Events proposal](../../docs/capsules/LINK-EVENTS-PROPOSAL.md#separating-witnesses) owns the bounded account. The models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json). Each one is a retained [None Throw model](../none-intermediate-throw/README.md) with three Sequence Flows interrupted by Link pairs, so the original is its explicit-flow twin and its handler overlay is the twin's.

- The [warranty repair with Go To links](warranty-repair-links.bpmn) ends the rework flow at the throw *Back to repair*, whose catch leads to the Merge *Repair round*. It also ends the *Order spare part* flow inside *Repair device* at *To testing*, and the conditioned Choice candidate towards *Device released* at *Release device*.
- The [onboarding milestones with Off-Page links](onboarding-milestones-links.bpmn) ends the fork's branch to *Welcome sent* at *Welcome track*, *Create account*'s flow in *Set up account* at *Account done*, and the join's flow at *All set*.

The [source test](../../packages/bpmn-source/test/link-events-source.test.ts) compiles both models to their twins' Programs and refuses the one-fact edits that leave the class. The [runtime test](../../packages/bpmn-source/test/link-events-runtime.test.ts) commits every journey command exactly as the twin does.

Four answer-free schedules reuse the twins' stimuli. The [pipeline cases](../../packages/differential/test/link-events-pipeline-cases.ts) register them as standards-only cases, each with one seeded mutation:

- [Warranty passed](warranty-passed.scenario.json) passes the device in one round. Its mutation leaves the catch *To testing* open instead of *Test device*, as a catch lowered to a wait would.
- [Warranty rework](warranty-rework.scenario.json) fails the first test and crosses the Go To loop once. Its mutation leaves the throw *Back to repair* open instead of *Replace part*'s second activation.
- [Account first](onboarding-account-first.scenario.json) creates the account before the *Order laptop* result. Its mutation leaves *Order laptop* unopened after the fork, as a waiting *Welcome track* would.
- [Laptop first](onboarding-laptop-first.scenario.json) takes the *Order laptop* result before the account. Its mutation leaves the Process running at the end, as a waiting *All set* would.
