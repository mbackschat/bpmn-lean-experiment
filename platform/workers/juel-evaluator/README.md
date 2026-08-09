# JUEL evaluator Worker

This directory is the deferred ownership location for the production JVM Activity Worker that will host the pinned JUEL evaluator when its compatibility lane opens. It will return a typed, content-bound result and will not choose a Sequence Flow or mutate Process state.

No Worker implementation or Java dependency is present. The semantic and capability boundary remains owned by [the JUEL architecture decision](../../../docs/JUEL-EVALUATION-ARCHITECTURE-DECISION.md).
