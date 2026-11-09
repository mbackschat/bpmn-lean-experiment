# Portable business effect data draft profile

The [profile artifact](profile.json) selects the [structured effect-data amendment](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md): the serial business-task chain restricted to Service Tasks, with a `SingletonBusinessItem` argument and result per mapped parameter. Process Start keeps the String-or-null domain, and both a Start String and a literal input are capped at 1,024 UTF-8 bytes.

The effect result is copied by value into the target Process Property and into the next task's argument snapshot; no structure is shared with the handler's returned value. The [CIB relationships](../../docs/CIB-BPMN-RELATION-REGISTER.md) classify the mapping syntax and the default Java serialization of a structured result; in-place delegate mutation of a structured input is outside the profile. Row acceptance is owned by the [coverage target](../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md).
