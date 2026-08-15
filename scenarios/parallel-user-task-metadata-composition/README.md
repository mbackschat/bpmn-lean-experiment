# Parallel User Task metadata composition scenarios

The two answer-free schedules use one content-addressed [parallel content and risk review source](process.bpmn). Process Start carries no data. Both User Tasks publish candidate group `reviewers`; Content carries Boolean field `contentApproved`, and Risk carries Boolean field `riskApproved`.

The [Content-then-Risk schedule](content-then-risk.scenario.json) and [Risk-then-Content schedule](risk-then-content.scenario.json) submit distinct Boolean values through the existing occurrence-bound completion command. The first completion must preserve the other task and its metadata, and the second permits the existing parallel join to complete the Process. Retained CIB evidence is separate from both targets.

The [parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the exact source restriction, passive metadata meaning, accepted command ordering, and exclusions.
