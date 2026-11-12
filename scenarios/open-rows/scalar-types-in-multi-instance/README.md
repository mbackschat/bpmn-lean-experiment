# Scalar types across the Service and Human command surfaces

Answer-free schedules for [PC-DATA-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the same well-formed typed value offered to each command surface of one Process, a Service Task's effect result and a User Task's completion, inside a sequential Multi-Instance Sub-Process. The [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the value domains and the per-surface eligibility rule; the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

[typed-body.bpmn](typed-body.bpmn) runs a Sub-Process *Batch* twice in sequence (a literal cardinality of two). Each body runs the Service Task *Fetch* (`${bpmnLeanEffectHandler}`, `asyncBefore`), whose input `slot` is `${loopCounter}` and whose result `result` is mapped to `fetched`, then the User Task *Review*, whose inputs publish `position` (`${loopCounter}`) and `seen` (`${fetched}`) and whose completion writes `verdict`. Every schedule completes both bodies in order; only the types of the first body's result and completion differ, so the second body is the control that shows what the first one left behind.

| Schedule | Case it separates | Row |
|---|---|---|
| [strings-only](strings-only.scenario.json) | Both bodies exchange Strings at the Service result and the Human completion. | PC-DATA-02 |
| [boolean-service-result](boolean-service-result.scenario.json) | The first body's Service result is a Boolean. | PC-DATA-02 |
| [integer-human-completion](integer-human-completion.scenario.json) | The first body's Human completion is an Integer. | PC-DATA-02 |
| [integer-service-boolean-human](integer-service-boolean-human.scenario.json) | The first body's Service result is an Integer and its Human completion a Boolean. | PC-DATA-02 |
| [null-service-decimal-human](null-service-decimal-human.scenario.json) | The first body's Service result is a present Null and its Human completion a Decimal. | PC-DATA-02 |
| [decimal-service-null-human](decimal-service-null-human.scenario.json) | The first body's Service result is a Decimal and its Human completion a present Null. | PC-DATA-02 |
| [string-over-bytes-human-completion](string-over-bytes-human-completion.scenario.json) | The first body's Human completion is a String of 600 `é`, 1,200 UTF-8 bytes, which the scenario schema admits at a root and the portable domain does not; a valid completion of the same task follows. | PC-DATA-02 |
| [decimal-coefficient-over-long-service-result](decimal-coefficient-over-long-service-result.scenario.json) | The first body's Service result is a Decimal whose coefficient `9223372036854775808` is one past the signed 64-bit range, which the schema admits and the domain does not; a valid result for the same effect follows. | PC-DATA-02 |

The acceptance clause keeps three outcomes apart at these two surfaces:

- Whole-scenario support: the six schedules from strings-only to decimal-service-null-human, whose every command commits in both engines.
- Direct refusal of one input: string-over-bytes-human-completion and decimal-coefficient-over-long-service-result. The kernel rejects the out-of-domain input as `value-outside-domain` with the state unchanged, and the valid input after it commits. CIB stores the long String and commits (CIB-LIM-0014). The CIB runner refuses the Decimal at decoding (`ScenarioVariableValueProjection.requireDecimal`), so that schedule is the kernel's alone and has no CIB evidence.
- Strict wire decoding: a value the schema bounds (a negative Integer, a Decimal scale above 6, an Integer spelled as text) cannot appear in a schema-valid scenario, so no schedule here holds one. The schema test (`scripts/portable-business-value-contract.test.ts`) refuses all three and the CIB runner's decoder test (`ScenarioJsonTest`) the first two. The kernel's decoders, held to each other by `kernel-behavior-oracle.integration-test.ts`, refuse the mistyped value and read the other two, which ingress then rejects as `value-outside-domain`.
