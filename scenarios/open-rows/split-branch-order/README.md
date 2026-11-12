# Split branch order

Answer-free schedules for [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (renaming and declaration permutation): two automatic branches that each write the same variable after a split, so the value left behind shows which branch ran last. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#arrival-and-leaving) own the meaning: a split's branch schedule is profile data, never identifier order. The standards profile refuses branches whose reads and writes race (`flow.concurrentWrite`), so under it every model here is refused at deployment and that refusal is the answer. CIB runs the first-declared branch first, each to its next wait, join or end (CIB-OP-0016), so the last-declared branch's write is left. These inputs only exercise it; under the CIB profiles the retained CIB Seven `2.2.0` answer is the row's target, and the kernel agrees with every schedule. The profile is `cibseven-2.2.0` with no source overlay. Each branch is a plain Task, or in `subprocess-fork` an automatic Sub-Process, whose output parameter writes the literal `zeta` or `alpha` into `outcome` (CIB-EXT-0031); the first-declared branch, *Zeta*, has the identifiers that sort last.

## Models

| Model | What it holds |
|---|---|
| [parallel-fork](parallel-fork.bpmn) | A Parallel fork over *Zeta* and *Alpha*, joined by a Parallel Gateway before the User Task *Inspect*. |
| [start-split](start-split.bpmn) | The None Start's two outgoing flows to *Zeta* and *Alpha*, joined the same way. |
| [uneven-fork](uneven-fork.bpmn) | The Parallel fork with a second plain Task, *Zeta again*, writing `zeta-again` after *Zeta*, so the first-declared branch is the longer one. |
| [nested-fork](nested-fork.bpmn) | The first branch forks again into *Zeta one* and *Zeta two*, writing `zeta-one` and `zeta-two`, joined by *Inner join* before the outer *Join*; *Alpha* is the second branch. |
| [subprocess-fork](subprocess-fork.bpmn) | The first branch is the embedded Sub-Process *Zeta*, whose body only starts and ends and whose output parameter writes `zeta` when it completes; *Alpha* is the second branch. |
| [inclusive-split](inclusive-split.bpmn) | An Inclusive split whose two candidates are both `${go}`, joined by an Inclusive Gateway before *Inspect*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [both-branches](parallel-fork-both-branches.scenario.json) | parallel-fork | The start runs both branches in one closure. |
| [both-branches](uneven-fork-both-branches.scenario.json) | uneven-fork | The same with branches of unequal length: the value left behind shows whether a branch runs to its join before the next one starts. |
| [all-branches](nested-fork-all-branches.scenario.json) | nested-fork | The same with a split inside the first branch: the value left behind shows whether the inner branches run before the outer second branch. |
| [both-branches](subprocess-fork-both-branches.scenario.json) | subprocess-fork | The value left behind shows whether the Sub-Process completes, and writes, before the second branch starts (`PvmAtomicOperationActivityEnd:105`). |
| [both-branches](start-split-both-branches.scenario.json) | start-split | The same from the Start Event's own split. |
| [both-selected](inclusive-split-both-selected.scenario.json) | inclusive-split | `go` is true, so the Inclusive split selects both candidates. |

The schedules carry no expected value; the retained CIB evidence is the answer.
