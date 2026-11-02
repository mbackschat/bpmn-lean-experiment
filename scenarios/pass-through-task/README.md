# Pass-through Task scenarios

The [pass-through Task proposal](../../docs/capsules/PASS-THROUGH-TASK-PROPOSAL.md#separating-witnesses) owns the bounded account; both models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), which does not admit them until that proposal is approved and implemented.

- The [equipment return](equipment-return.bpmn) schedules a pickup, inspects the returned equipment in a Sub-Process whose Manual Task *Unpack equipment* precedes the User Task *Record condition*, and closes the return through the plain Task *Close return ticket*.
- The [document intake](document-intake.bpmn) classifies a received document and branches on its format: a paper document passes the Manual Task *File paper original*, an illegible one passes the Manual Task *Phone sender for a better copy* and is classified again, and any other format passes the plain Task *Register digital copy*.

The [CIB calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) drives both models in CIB Seven `2.2.0`, with each condition rendered as JUEL.
