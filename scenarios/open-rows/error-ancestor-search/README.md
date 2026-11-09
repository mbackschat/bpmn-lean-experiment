# Error search across nested Sub-Processes and siblings

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the search for a catcher outward through enclosing Sub-Processes, a nearer catch-all against a farther exact code, and handlers of unrelated sibling regions. The [order model](fulfil-order.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, two regions run side by side and each nests one Sub-Process in another.

| Region | Thrower | Inner Sub-Process boundary | Outer Sub-Process boundary |
|---|---|---|---|
| `ReserveStock` ⊃ `PickItems` | Service Task `PickLine`, answered by `effectResult` | exact `PACKING_FAILED` | exact `STOCK_SHORT` |
| `ShipOrder` ⊃ `LoadTruck` | Error End `STOCK_SHORT` after Human Task `ScanPallet` | catch-all | exact `STOCK_SHORT` |

Every recovery boundary leads to its own Human Task inside the Sub-Process that carries the boundary, so the route taken is the open Human Task.

| Scenario | Case it exercises |
|---|---|
| [outer-exact-skips-inner-wrong-code](outer-exact-skips-inner-wrong-code.scenario.json) | A code the inner exact boundary does not name, which the outer exact boundary names. |
| [inner-exact](inner-exact.scenario.json) | The code the inner exact boundary names. |
| [nearer-catch-all-before-farther-exact](nearer-catch-all-before-farther-exact.scenario.json) | An Error End whose code the farther outer boundary names exactly, under a nearer catch-all. |
| [unrelated-sibling-catch-all](unrelated-sibling-catch-all.scenario.json) | A code no boundary of the throwing region names while the sibling region holds a catch-all, then the sibling region's own throw. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
