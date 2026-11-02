# Pass-through Task scenarios

The [pass-through Task proposal](../../docs/capsules/PASS-THROUGH-TASK-PROPOSAL.md#separating-witnesses) owns the bounded account; both models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [equipment return](equipment-return.bpmn) with its [handler](equipment-return-overlay.json) schedules a pickup, inspects the returned equipment in a Sub-Process whose Manual Task *Unpack equipment* precedes the User Task *Record condition*, refunds the deposit and closes the return through the plain Task *Close return ticket*.
- The [document intake](document-intake.bpmn) with its [handler](document-intake-overlay.json) classifies a received document and branches on its format: a paper document is archived in a Sub-Process whose Manual Task *File paper original* precedes the Service Task *Index archive location*, an illegible one passes the Manual Task *Phone sender for a better copy* and is classified again, and any other format passes the plain Task *Register digital copy*.

The [source test](../../packages/bpmn-source/test/pass-through-task-source.test.ts) compiles both models and locks the refused one-fact edits. The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drives both models in CIB Seven `2.2.0`, with each condition rendered as JUEL.
