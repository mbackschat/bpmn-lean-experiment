# Pass-through Task scenarios

The [pass-through Task specification](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) owns the bounded account; both models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [equipment return](equipment-return.bpmn) with its [handler](equipment-return-overlay.json) schedules a pickup, inspects the returned equipment in a Sub-Process whose Manual Task *Unpack equipment* precedes the User Task *Record condition*, refunds the deposit and closes the return through the plain Task *Close return ticket*.
- The [document intake](document-intake.bpmn) with its [handler](document-intake-overlay.json) classifies a received document in a Sub-Process whose User Task *Record document format* sets the Sub-Process's own `format`, copied out to `documentFormat`, and branches on it: a paper document is archived in a Sub-Process whose Manual Task *File paper original* precedes the Service Task *Index archive location*, an illegible one passes the Manual Task *Phone sender for a better copy* and is classified again with a fresh `format`, and any other format passes the plain Task *Register digital copy*. The classification sits in a Sub-Process because the profile admits a User Task completion only over names a frame on its chain declares.

The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drives both models in CIB Seven `2.2.0`, with each condition rendered as JUEL.

Their occurrences appear only in the command publications, which the publication agreement test compares between the Lean and TypeScript kernels:

- [Equipment return](equipment-return.scenario.json) schedules the pickup, records the condition and completes the refund.
- [Intake, illegible twice then paper](intake-illegible-twice-then-paper.scenario.json) phones the sender twice, re-entering the classification each time, then archives the paper original.
- [Intake, digital](intake-digital.scenario.json) registers the digital copy and ends.
