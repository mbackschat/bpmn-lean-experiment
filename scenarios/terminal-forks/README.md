# Terminal fork scenarios

The [terminal forks specification](../../docs/capsules/TERMINAL-FORKS-SPEC.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler, and neither declares scope-local data.

- The [employee offboarding](employee-offboarding.bpmn) with its [handler](employee-offboarding-overlay.json) looks up the employee and forks at the root into four branches, each to its own None End: the User Tasks *Collect equipment* and *Revoke system access*, the plain Task *Notify payroll*, and a direct End *Departure recorded*.
- The [office move](office-move.bpmn) with its [handler](office-move-overlay.json) books movers and enters *Clear old office*, whose body forks into the User Task *Pack desk*, the Manual Task *Return keys* and the plain Task *Cancel parking permit*, each to its own End, before *Confirm new office*.

Three answer-free schedules:

- [Equipment first](offboarding-equipment-first.scenario.json) collects the equipment before revoking access.
- [Access first](offboarding-access-first.scenario.json) revokes access before collecting the equipment.
- [Office move](office-move.scenario.json) packs the desk, which completes *Clear old office*, then confirms the new office.
