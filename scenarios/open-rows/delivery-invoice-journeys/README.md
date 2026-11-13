# Invoice delivery journeys

Answer-free schedules for [PC-DELIVERY-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the three invoice journeys, bound to the exact source, profile `cibseven-2.2.0` and source overlay that the delivery row requires. The sources and their overlays live in `packages/bpmn-source/test/fixtures/` because the CIB runner finds an overlay by digest beside the BPMN source only ([runner README](../../../runners/cibseven/README.md)); the hosted evidence replay retains the CIB Seven `2.2.0` answer for each schedule from here.

| Schedule | Source | Case it separates |
|---|---|---|
| [serial-classification](serial-classification.scenario.json) | [serial-invoice-classification.bpmn](../../../packages/bpmn-source/test/fixtures/serial-invoice-classification.bpmn) with its [overlay](../../../packages/bpmn-source/test/fixtures/serial-invoice-classification.overlay.json) | Serial validation then classification through two named handlers. |
| [mixed-invoice-rework](mixed-invoice-rework.scenario.json) | [mixed-task-invoice-rework.bpmn](../../../packages/bpmn-source/test/fixtures/mixed-task-invoice-rework.bpmn) with its [overlay](../../../packages/bpmn-source/test/fixtures/mixed-task-invoice-rework.overlay.json) | Review and rework with repeated human work. |
| [mixed-invoice-rework-superseded-review](mixed-invoice-rework-superseded-review.scenario.json) | the same | After rework, a completion of the superseded Review occurrence is refused. |
| [business-error](business-error.scenario.json) | [mixed-task-invoice-business-error.bpmn](../../../packages/bpmn-source/test/fixtures/mixed-task-invoice-business-error.bpmn) with its [overlay](../../../packages/bpmn-source/test/fixtures/mixed-task-invoice-business-error.overlay.json) | Recovery from a business Error through data correction, policy review and fresh validation. |
| [business-error-superseded-reviews](business-error-superseded-reviews.scenario.json) | the same | Superseded Review occurrences are refused during recovery. |
| [business-error-technical-failure](business-error-technical-failure.scenario.json) | the same | A technical failure of *Validate* is an incident that the business Error boundary never catches. |

The [neutral journeys](../../serial-business-task-composition/README.md) and their [public-delivery schedules](../../mixed-task-control-flow/README.md) bind other sources and overlays. The engine API refusals over these three journeys are in `packages/engine-api/test/invoice-delivery-refusals.test.ts`.
