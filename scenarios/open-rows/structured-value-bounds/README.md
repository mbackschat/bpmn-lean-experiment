# Structured value bounds

Answer-free schedules for the boundary half of [PC-DATA-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): "boundary/over-bound nested values reject atomically". The portable value domain bounds a root value at four container levels (the root container counted as one), 32 members per container, 256 value nodes and 16,384 canonical JSON bytes, with exact-limit acceptance and one-over rejection ([data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md)). The retained CIB Seven `2.2.0` answer is the target, so the evidence shows what CIB does with the same values. The profile is `cibseven-2.2.0` with no source overlay.

[bounded-value.bpmn](bounded-value.bpmn) is a Start Event, the User Task *Accept value*, which publishes the Process variable `payload` as its input, and an End Event. A start schedule carries the value in `payload`; a completion schedule starts with a small `payload` and writes the value as a completion binding.

| Schedule | Case it separates | Row |
|---|---|---|
| [start-at-depth-bound](start-at-depth-bound.scenario.json) | A start value with four container levels. | PC-DATA-03 |
| [start-over-depth-bound](start-over-depth-bound.scenario.json) | A start value with five container levels. | PC-DATA-03 |
| [start-at-node-bound](start-at-node-bound.scenario.json) | A start value of exactly 256 value nodes (7738 canonical bytes). | PC-DATA-03 |
| [start-over-node-bound](start-over-node-bound.scenario.json) | A start value of 257 value nodes (7768 canonical bytes). | PC-DATA-03 |
| [start-at-byte-bound](start-at-byte-bound.scenario.json) | A start value of exactly 16,384 canonical bytes. | PC-DATA-03 |
| [start-over-byte-bound](start-over-byte-bound.scenario.json) | A start value of exactly 16,385 canonical bytes. | PC-DATA-03 |
| [start-at-member-bound](start-at-member-bound.scenario.json) | A start value whose List has 32 members; a 33rd cannot be written, because the scenario schema bounds members at 32. | PC-DATA-03 |
| [completion-at-depth-bound](completion-at-depth-bound.scenario.json) | A completion that writes one value with four container levels. | PC-DATA-03 |
| [completion-over-depth-after-valid-entry](completion-over-depth-after-valid-entry.scenario.json) | A completion whose first binding is valid and whose last binding has five container levels, then a completion with the valid binding alone. | PC-DATA-03 |

The byte count is the one `JSON.stringify` gives the tagged value (`kind` before `value`, Map entries as `{"name":…,"value":…}`). The node-bound values are one Map of eight Lists of Integers. A value of 33 members cannot be written in a schema-valid scenario, so the member bound has an exact-limit schedule only; the one-over member case belongs to the wire decoder's own tests.

Notes for the target runners:

- Gap: List and Map values at the start and completion surfaces.
- The byte-bound values are 15 Strings of 1,024 bytes plus a last String that lands on the stated count; every binding of them stays inside the 20,480-byte binding allowance.
