# User Task discovery and completion scenario

This capsule reuses the exact content-addressed BPMN resource from the [Milestone 0 sequential User Task scenario](../m0-sequential-user-task/README.md). It adds a structured semantic task-instance identity, an exact open-task projection, and completion by that full identity.

The [committed-completion scenario](scenario.json) observes one active task named `Approve` with Process-instance identity `Instance_1`, BPMN element identity `UserTask_Approve`, and activation ordinal `1`. It exposes a command-ID-free `enabledInteractions` capability, completes that exact occurrence, and observes Process completion. Its answer is retained separately in [cibseven-evidence.json](cibseven-evidence.json).

The [wrong-activation scenario](wrong-activation.scenario.json) sends ordinal `2`, is rejected before host-task completion, and observes the exact active task and enabled ordinal-`1` interaction unchanged. Equality of its pre-command state with the committed scenario is the permanent guard against deriving semantic capabilities from future scenario commands. Its answer is retained in [wrong-activation.cibseven-evidence.json](wrong-activation.cibseven-evidence.json).

The [stale-completion scenario](stale-completion.scenario.json) completes the exact occurrence and then submits a new command for that completed occurrence. The second command is rejected and the completed state remains unchanged. Its answer is retained in [stale-completion.cibseven-evidence.json](stale-completion.cibseven-evidence.json).

All three evidence artifacts are calibrated against one warm CIB runner and bound to their exact answer-free scenario bytes. Generated CIB task IDs remain local host mappings and never enter the canonical trace. Lean independently derives all three traces and proves universal full-occurrence mismatch rejection with state preservation, the wrong-activation corollary, and the element-only identity non-law. The TypeScript semantic core independently derives the same traces, while Temporal exposes the core-owned task projection through Query and returns its command outcome through Update. The four-target batch compares every result, checks duplicate command delivery, detects an activation-projection mutation, and replays both the retained lifecycle Signal history and an exact-completion Update history. The capsule is evidence-closed for this bounded draft claim.

The contract and exclusions are owned by the [User Task interaction semantic capsule](../../docs/capsules/USER-TASK-INTERACTION.md).
