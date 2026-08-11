# Configured Task scenario

The [answer-free scenario](scenario.json) executes the byte-identical approved [BPMN source](process.bpmn) admitted by the [BPMN 2.0.2 BPMN Lean configured Task effect profile](../../profiles/bpmn-2.0.2-bpmn-lean-configured-task-effect-draft/profile.json) and governed by the [configured generic Task proposal](../../docs/capsules/CONFIGURED-GENERIC-TASK-PROPOSAL.md).

The first stimulus starts `Process_ConfiguredTask`. The second completes the published `ConfiguredTask_Probe` effect occurrence with the empty success result. The third completes `UserTask_Review` activation 1 with no submitted values.

The scenario contains source identity and semantic inputs only. It carries no expected result, CIB runner target, retained CIB evidence, handler transport, retry policy, Workflow identity, or Product 2 task binding.
