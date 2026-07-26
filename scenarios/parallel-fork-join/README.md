# Parallel fork/join scenarios

This directory contains the exact balanced two-branch BPMN resource and three answer-free scenarios for the [parallel fork/join spec](../../docs/capsules/PARALLEL-FORK-JOIN-SPEC.md).

Both scenarios start one `Process_ParallelForkJoin` instance and reach simultaneous `UserTask_A` and `UserTask_B` occurrences. [A then B](a-then-b.scenario.json) and [B then A](b-then-a.scenario.json) differ only in the explicit external completion order. Their expected results remain verifier-owned evidence and never enter target input.

The [live-sibling stale scenario](stale-a-while-b-active.scenario.json) completes A, then repeats A under a distinct semantic command while B keeps the Process active. All four targets reject stale A with B unchanged. Its [content-bound CIB evidence](stale-a-while-b-active.cibseven-evidence.json) retains the raw B-only query after both commands, and the verifier's seeded mutation fails if that sibling observation is dropped.

The selected [parallel draft profile](../../profiles/parallel-fork-join-draft/README.md) follows normative per-incoming-Sequence-Flow synchronization. Agreement with CIB on this balanced shape does not resolve candidate deviation `CIB-DEV-0001`, because both the normative and count-based accounts join only after both branches arrive here.
