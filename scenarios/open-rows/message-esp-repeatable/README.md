# Non-interrupting Message Event Sub-Processes

Answer-free schedules for [PC-MESSAGE-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): non-interrupting Message Event Sub-Processes at the Process level, in a Sub-Process and in both Multi-Instance body modes, with handlers that hold human and Receive work and a boundary of their own, overlapping handlers of one listener, the parent's completion while handlers are live, a listener that belongs to a body that has ended, and where a delivery's own variables land ([#150](https://github.com/mbackschat/bpmn-lean-experiment/issues/150)). The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [repeatable-handlers.bpmn](repeatable-handlers.bpmn) | After a Parallel fork four regions run side by side. *Process level*: `Work` then `Finish`, with a non-interrupting Message Event Sub-Process `ESP_Notice` (`notice`, Start Event `Start_Notice`) whose handler runs the Human Task `Handle_Notice` and then the Receive Task `Await_Ack` (`ack`) under an interrupting `PT30S` boundary `Ack_Deadline` to `Ack_Late`. *Embedded*: the Sub-Process `Region` over the Human Task `Inner` with `ESP_RegionNotice` (`regionNotice`, handler `Handle_RegionNotice`). *Parallel bodies*: `Bodies_Par` over the String list `items`, each body a Human Task `Inner_Par` with `ESP_ParNotice` (`parNotice`, handler `Handle_ParNotice`). *Sequential bodies*: `Bodies_Seq`, the same with `Inner_Seq`, `ESP_SeqNotice` (`seqNotice`) and `Handle_SeqNotice`. |
| [start-variables.bpmn](start-variables.bpmn) | The Sub-Process `Region`, whose `camunda:inputParameter` makes `note` a local `local`, over the Human Task `Inner`, then the Human Task `Finish`. The Process declares `ESP_Note` (`note`, Start Event `Start_Note`, handler `Handle_Note`) and `Region` declares `ESP_RegionNote` (`regionNote`, Start Event `Start_RegionNote`, handler `Handle_RegionNote`), neither with a data item or an input mapping. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [process-notices-overlap-with-nested-wait](process-notices-overlap-with-nested-wait.scenario.json) | repeatable-handlers | PC-MESSAGE-07 | `notice` is delivered twice; `Work` and `Finish` complete; the first handler's task completes and its Receive Task is delivered `ack`; the second handler's task completes and its `Ack_Deadline` fires at 30,000; `Ack_Late` completes. |
| [region-notice-after-ordinary-work](region-notice-after-ordinary-work.scenario.json) | repeatable-handlers | PC-MESSAGE-07 | `regionNotice` is delivered; `Inner` completes; `regionNotice` is delivered again with the handler open; the handler completes. |
| [parallel-bodies-own-listeners](parallel-bodies-own-listeners.scenario.json) | repeatable-handlers | PC-MESSAGE-07 | `parNotice` is delivered to body 1's listener and to body 2's; body 1's `Inner_Par` completes; body 1's listener is addressed again; the handlers and body 2's `Inner_Par` complete. |
| [sequential-body-listener-before-replacement](sequential-body-listener-before-replacement.scenario.json) | repeatable-handlers | PC-MESSAGE-07 | `seqNotice` is delivered to body 1's listener; `Inner_Seq` and the handler complete, ending body 1; body 1's listener is addressed, then body 2's; body 2's tasks complete. |
| [process-note-repeated](process-note-repeated.scenario.json) | start-variables | PC-MESSAGE-07 | `note` is delivered to `Start_Note` with the variable `note = "first"`, then again with `note = "second"`; both handlers, `Inner` and `Finish` complete. The kernel writes each at the root ([CIB-EXT-0025](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables)); its CIB evidence is retained from Verify run 43921697728. |
| [region-note-overwrites-local](region-note-overwrites-local.scenario.json) | start-variables | PC-MESSAGE-07 | `regionNote` is delivered to `Start_RegionNote` with the variable `note = "delivered"` while `Region` holds its local `note`; the handler, `Inner` and `Finish` complete. The kernel overwrites `Region`'s local; its CIB evidence is retained from Verify run 43921697728. |

## Notes for the target runners

- Every schedule addresses an Event Sub-Process start, which the CIB runner numbers through a host that has no activity instance before the start fires.
- An Event Sub-Process start is addressed by its Start Event and the count of begins of its scope: the Process-level and `Region` starts are activation 1, and the start of a Multi-Instance body is the next activation for each body begun.
- `items` is the String list `a, b`; a handler is addressed by the activation of its Human Task, counted per begun occurrence.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
