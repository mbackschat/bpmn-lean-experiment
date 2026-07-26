# Parallel fork/join scenarios

This directory contains the exact balanced two-branch BPMN resource and two answer-free scenarios for the [parallel fork/join spec](../../docs/capsules/PARALLEL-FORK-JOIN-SPEC.md).

Both scenarios start one `Process_ParallelForkJoin` instance and reach simultaneous `UserTask_A` and `UserTask_B` occurrences. [A then B](a-then-b.scenario.json) and [B then A](b-then-a.scenario.json) differ only in the explicit external completion order. Their expected results remain verifier-owned evidence and never enter target input.

The selected [parallel draft profile](../../profiles/parallel-fork-join-draft/README.md) follows normative per-incoming-Sequence-Flow synchronization. Agreement with CIB on this balanced shape does not resolve candidate deviation `CIB-DEV-0001`, because both the normative and count-based accounts join only after both branches arrive here.
