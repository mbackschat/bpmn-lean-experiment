# User Task discovery and completion scenarios

This capsule owns one exact content-addressed [BPMN Process](process.bpmn) and three answer-free semantic witnesses.

The [exact-completion scenario](scenario.json) observes one active task named `Approve` with semantic occurrence identity `(Instance_1, UserTask_Approve, 1)`, exposes a command-ID-free completion capability, completes that occurrence, and observes Process completion. Its CIB answer is retained separately in [cibseven-evidence.json](cibseven-evidence.json).

The [wrong-activation scenario](wrong-activation.scenario.json) submits activation ordinal `2`. It is rejected before host-task completion, and the ordinal-`1` task remains active. Its answer is retained in [wrong-activation.cibseven-evidence.json](wrong-activation.cibseven-evidence.json).

The [stale-completion scenario](stale-completion.scenario.json) completes the exact occurrence and then submits another command for that completed occurrence. The second command is rejected and the completed state remains unchanged. Its answer is retained in [stale-completion.cibseven-evidence.json](stale-completion.cibseven-evidence.json).

All evidence is calibrated through one warm pinned CIB runner and bound to exact scenario and profile bytes. Generated CIB task IDs remain local host mappings. Lean independently derives all three traces and proves full-occurrence mismatch rejection with state preservation plus an element-only identity non-law. The TypeScript semantic core independently derives the same results. Temporal exposes the core-owned task projection through Query, returns its command outcome through Update, checks duplicate logical delivery, and replays each live history before the disposable server shuts down. The four-target batch detects a seeded activation mutation.

The [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION.md) classifies task discovery and completion as bounded agreement (`CIB-AGR-0002`) and the generated-ID-to-semantic-occurrence bridge as an operational mapping (`CIB-OP-0001`). The complete meaning and exclusions are owned by the [User Task interaction capsule](../../docs/capsules/USER-TASK-INTERACTION.md).
