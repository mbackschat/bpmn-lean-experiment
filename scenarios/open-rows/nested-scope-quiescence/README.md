# Nested embedded scopes with mixed work and gateways

This directory serves [PC-SCOPE-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): ordinary embedded scopes nested two levels deep, with mixed activities and the Exclusive, Parallel and Inclusive Gateways, completing at the end of their own work. The [fulfilment model](fulfilment.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The registered [nested embedded scope control](../../nested-embedded-scope-control/README.md) and [embedded completion](../../embedded-subprocess-completion/README.md) scenarios hold the User Task and Parallel Gateway shapes.

After a Parallel fork, the root runs the Human Task `Invoice` beside the Sub-Process `Pack`, which is followed by the Human Task `Ship`. `Pack` forks again into two branches that end at separate End Events:

| Branch of `Pack` | Work |
|---|---|
| Inner scope `Stock` | forks into the Service Task `Reserve` (answered by `effectResult`) and an Inclusive Gateway `Select` whose conditions `${needPick}` and `${needWrap}` open the Human Tasks `Pick` and `Wrap`, with `Inspect` on the default flow; an Inclusive Gateway merge leads to the Human Task `Stage`. The two branches of `Stock` end at separate End Events. |
| Exclusive route | an Exclusive Gateway `${skipVerification}` leads either to the Call Activity `Verify` (the called Process runs the Human Task `CheckAddress`) or, when true, to the Service Task `Waive`. |

Start variables are the Booleans `needPick`, `needWrap` and `skipVerification`. Each effect is answered once and the two effects are distinct elements. A Human Task of the called instance is addressed by the kernel's derived called-instance identifier.

| Schedule | Case it exercises |
|---|---|
| [stock-end-first](stock-end-first.scenario.json) | `Pick` flags only. `Reserve` answers first, the Call returns, `Pick` and `Stage` complete, `Ship` is addressed before it exists, and `Ship` and `Invoice` complete last. |
| [verification-last-reverse](verification-last-reverse.scenario.json) | The same flags in the opposite order: `Pick` and `Stage` first, then `Reserve`, with `Ship` addressed before it exists, and `CheckAddress` completing the last inner work. |
| [inclusive-join-both-and-waiver](inclusive-join-both-and-waiver.scenario.json) | `Pick`, `Wrap` and `skipVerification` all set. `Stage` is addressed before it exists, `Wrap` completes before `Pick`, the waiver and `Reserve` answer, then `Stage`, `Ship` and `Invoice` complete. |
| [default-branch-and-stale](default-branch-and-stale.scenario.json) | No flag set, so `Inspect` runs on the default flow; `Inspect` and `Stage` are each addressed again after they completed, then the remaining work completes. |

The schedules carry no expected route, join, open wait or Process state; the retained CIB evidence is the answer.
