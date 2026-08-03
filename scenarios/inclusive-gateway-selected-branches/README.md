# Structured Inclusive Gateway scenarios

This directory contains one exact BPMN 2.0.2 source and four answer-free scenarios for the [Inclusive Gateway selected-branch specification](../../docs/capsules/INCLUSIVE-GATEWAY-SPEC.md). The source is the same canonical fixture used by source admission, Lean lowering identity, differential execution, and Temporal refinement; the separate declaration-permuted fixture remains a hostile source-order discriminator.

The [one-true scenario](one-true.scenario.json) supplies only `takeA` and must expose `Task_A`. The [default scenario](default.scenario.json) supplies neither routing binding and must expose `Task_Default`. The two both-true scenarios supply `takeA` and `takeB`, expose `Task_A` and `Task_B`, and differ only in their explicit [A-then-B](both-true-a-then-b.scenario.json) or [B-then-A](both-true-b-then-a.scenario.json) completion order. No expected result appears in target input.

Lean, the independent TypeScript semantic core, and Temporal are the execution targets. CIB Seven source references are provenance for deferred probe seeds only: no CIB Inclusive Gateway relationship, retained result, expression-truth evidence, or differential target is selected.
