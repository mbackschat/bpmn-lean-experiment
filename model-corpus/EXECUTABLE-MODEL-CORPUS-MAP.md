# Executable BPMN model corpus map

This file is generated from `manifest.json` by the executable corpus guard. Edit the manifest or evidence owners, not this map by hand.

## Current result

The first tranche contains 31 retained executable models and 7 exact external candidates. 31 are admitted, 7 are rejected, and 3 are eligible for the browser catalog.
The retained MVP suite covers all 31 registered executable BPMN element variants.

## Models

| Model | Source | Clone family | Admission | Pipeline | CIB | Product 2 |
|---|---|---|---|---|---|---|
| Review a request with assignment and form metadata | retainedScenario | human-review-with-form | accepted | user-task-assignment-form-metadata | pipeline | journeyBacked |
| Review content and risk in parallel | retainedScenario | parallel-two-human-tasks | accepted | parallel-user-task-metadata-content-then-risk | pipeline | journeyBacked |
| Prepare two work items in parallel | retainedScenario | parallel-two-human-tasks | accepted | parallel-fork-join-a-then-b | pipeline | notCatalogReady |
| Resolve an expense exception with structured human work | retainedScenario | structured-expense-exception-review | accepted | expense-exception-review-approve | notSelected | journeyBacked |
| Route a Boolean decision | retainedScenario | exclusive-boolean-decision | accepted | exclusive-gateway-simple-boolean-first-true | notSelected | notCatalogReady |
| Fulfil work through a called Process | retainedScenario | called-process-human-work | accepted | called-process-call-activity | notSelected | notCatalogReady |
| Record an external service effect | retainedScenario | single-service-effect | accepted | service-task-effect-success | pipeline | notCatalogReady |
| Coordinate parallel work inside a bounded scope | retainedScenario | embedded-parallel-human-work | accepted | embedded-subprocess-completion-a-then-b | pipeline | notCatalogReady |
| Recover scoped work after a business error | retainedScenario | subprocess-error-recovery | accepted | subprocess-error-propagation-trigger-first | pipeline | notCatalogReady |
| Wait for a review window | retainedScenario | timer-then-human-review | accepted | timer-user-task-composition | notSelected | notCatalogReady |
| Continue a review after a message | retainedScenario | message-then-human-review | accepted | intermediate-catch-message | notSelected | notCatalogReady |
| Wait for an invoice receipt | retainedScenario | addressed-receive-task | accepted | message-addressed-receive-task | pipeline | notCatalogReady |
| Prepare every applicable review track | retainedScenario | inclusive-human-review-tracks | accepted | inclusive-gateway-both-true-a-then-b | notSelected | notCatalogReady |
| Continue on a message or deadline | retainedScenario | message-timer-event-race | accepted | event-based-gateway-message-wins | notSelected | notCatalogReady |
| Escalate work that misses a deadline | retainedScenario | interrupting-task-deadline | accepted | activity-boundary-timer-deadline-wins | notSelected | notCatalogReady |
| Escalate a bounded work package | retainedScenario | interrupting-subprocess-deadline | accepted | subprocess-boundary-timer-deadline-wins | notSelected | notCatalogReady |
| Remind and finish monitored work | retainedScenario | non-interrupting-task-reminder | accepted | non-interrupting-boundary-timer-deadline-then-both-branches | notSelected | notCatalogReady |
| Review and rework a request until accepted | retainedScenario | cyclic-human-rework | accepted | user-task-cycle-repeat-rework-exit | notSelected | notCatalogReady |
| Start approval from an addressed message | retainedScenario | message-start-human-approval | accepted | message-start-event | notSelected | notCatalogReady |
| Start a scheduled review | retainedScenario | timer-start-human-review | accepted | timer-start-event | notSelected | notCatalogReady |
| Stop remaining scoped work after termination | retainedScenario | subprocess-termination | accepted | terminate-end-event-trigger-first | notSelected | notCatalogReady |
| Run a configured integration before review | retainedScenario | configured-effect-human-review | accepted | configured-task | notSelected | notCatalogReady |
| Retain a mapped service result | retainedScenario | mapped-service-success | accepted | mapped-success-service-task | pipeline | notCatalogReady |
| Route a mapped business error to review | retainedScenario | mapped-service-boundary-error | accepted | mapped-boundary-error-service-task-caught | pipeline | notCatalogReady |
| Review an ordered batch of documents | retainedScenario | sequential-batch-review | accepted | sequential-multi-instance-natural | notSelected | notCatalogReady |
| Escalate a batch review at its shared deadline | retainedScenario | sequential-batch-review | accepted | sequential-multi-instance-interrupted | notSelected | notCatalogReady |
| Complete every parallel risk assessment | retainedScenario | parallel-risk-review | accepted | parallel-multi-instance-all | notSelected | notCatalogReady |
| Stop a parallel review at the first material risk | retainedScenario | parallel-risk-review | accepted | parallel-multi-instance-first | notSelected | notCatalogReady |
| Escalate a parallel risk review at its shared deadline | retainedScenario | parallel-risk-review | accepted | parallel-multi-instance-interrupted | notSelected | notCatalogReady |
| Review an invoice with its supplied context | retainedScenario | human-review-with-direct-data-input | accepted | activity-data-input-present | notSelected | notCatalogReady |
| Record an underwriting decision on the application | retainedScenario | human-decision-with-direct-data-output | accepted | activity-data-output-supplied | notSelected | notCatalogReady |
| CIB Seven order goods | externalGit | cib-order-goods | rejected | none | notApplicable | notCatalogReady |
| CIB Seven review invoice | externalGit | cib-review-invoice | rejected | none | notApplicable | notCatalogReady |
| CIB Seven invoice receipt version 1 | externalGit | cib-invoice-receipt | rejected | none | notApplicable | notCatalogReady |
| CIB Seven invoice receipt version 2 | externalGit | cib-invoice-receipt | rejected | none | notApplicable | notCatalogReady |
| CIB Seven vacation request | externalGit | cib-vacation-request | rejected | none | notApplicable | notCatalogReady |
| OMG incident management executable example | externalArchiveEntry | omg-incident-management | rejected | none | notApplicable | notCatalogReady |
| Betsy workflow pattern 16 deferred choice | externalGit | betsy-wcp16-deferred-choice | rejected | none | notApplicable | notCatalogReady |

## MVP capability coverage

| Family | Element or variant | Retained models |
|---|---|---|
| Process structure | Process | `request-review-with-form`, `parallel-content-and-risk-review`, `parallel-work-preparation`, `expense-exception-review`, `boolean-decision-routing`, `called-process-fulfilment`, `external-service-recording`, `scoped-parallel-work`, `scoped-business-error-recovery`, `timed-review-window`, `message-triggered-review`, `invoice-receipt-wait`, `applicable-review-tracks`, `message-or-deadline-routing`, `task-deadline-escalation`, `work-package-deadline-escalation`, `non-interrupting-work-reminder`, `request-review-rework`, `message-started-approval`, `scheduled-review-start`, `scoped-termination`, `configured-integration-review`, `mapped-service-result`, `mapped-business-error-review`, `ordered-batch-document-review`, `deadline-escalated-batch-review`, `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review`, `invoice-review-with-context`, `underwriting-decision-recorded` |
| Process structure | Sequence Flow | `request-review-with-form`, `parallel-content-and-risk-review`, `parallel-work-preparation`, `expense-exception-review`, `boolean-decision-routing`, `called-process-fulfilment`, `external-service-recording`, `scoped-parallel-work`, `scoped-business-error-recovery`, `timed-review-window`, `message-triggered-review`, `invoice-receipt-wait`, `applicable-review-tracks`, `message-or-deadline-routing`, `task-deadline-escalation`, `work-package-deadline-escalation`, `non-interrupting-work-reminder`, `request-review-rework`, `message-started-approval`, `scheduled-review-start`, `scoped-termination`, `configured-integration-review`, `mapped-service-result`, `mapped-business-error-review`, `ordered-batch-document-review`, `deadline-escalated-batch-review`, `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review`, `invoice-review-with-context`, `underwriting-decision-recorded` |
| Start Events | None Start Event | `request-review-with-form`, `parallel-content-and-risk-review`, `parallel-work-preparation`, `expense-exception-review`, `boolean-decision-routing`, `called-process-fulfilment`, `external-service-recording`, `scoped-parallel-work`, `scoped-business-error-recovery`, `timed-review-window`, `message-triggered-review`, `invoice-receipt-wait`, `applicable-review-tracks`, `message-or-deadline-routing`, `task-deadline-escalation`, `work-package-deadline-escalation`, `non-interrupting-work-reminder`, `request-review-rework`, `scoped-termination`, `configured-integration-review`, `mapped-service-result`, `mapped-business-error-review`, `ordered-batch-document-review`, `deadline-escalated-batch-review`, `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review`, `invoice-review-with-context`, `underwriting-decision-recorded` |
| Start Events | Message Start Event | `message-started-approval` |
| Start Events | Timer Start Event | `scheduled-review-start` |
| End Events | None End Event | `request-review-with-form`, `parallel-content-and-risk-review`, `parallel-work-preparation`, `expense-exception-review`, `boolean-decision-routing`, `called-process-fulfilment`, `external-service-recording`, `scoped-parallel-work`, `scoped-business-error-recovery`, `timed-review-window`, `message-triggered-review`, `invoice-receipt-wait`, `applicable-review-tracks`, `message-or-deadline-routing`, `task-deadline-escalation`, `work-package-deadline-escalation`, `non-interrupting-work-reminder`, `request-review-rework`, `message-started-approval`, `scheduled-review-start`, `scoped-termination`, `configured-integration-review`, `mapped-service-result`, `mapped-business-error-review`, `ordered-batch-document-review`, `deadline-escalated-batch-review`, `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review`, `invoice-review-with-context`, `underwriting-decision-recorded` |
| End Events | Error End Event | `scoped-business-error-recovery` |
| End Events | Terminate End Event | `scoped-termination` |
| Activities | User Task | `request-review-with-form`, `parallel-content-and-risk-review`, `parallel-work-preparation`, `expense-exception-review`, `boolean-decision-routing`, `called-process-fulfilment`, `scoped-parallel-work`, `scoped-business-error-recovery`, `timed-review-window`, `message-triggered-review`, `applicable-review-tracks`, `message-or-deadline-routing`, `task-deadline-escalation`, `work-package-deadline-escalation`, `non-interrupting-work-reminder`, `request-review-rework`, `message-started-approval`, `scheduled-review-start`, `scoped-termination`, `configured-integration-review`, `mapped-business-error-review`, `ordered-batch-document-review`, `deadline-escalated-batch-review`, `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review`, `invoice-review-with-context`, `underwriting-decision-recorded` |
| Activities | User Task with a direct Data Input | `invoice-review-with-context` |
| Activities | User Task with a direct Data Output | `underwriting-decision-recorded` |
| Activities | Sequential Multi-Instance User Task | `ordered-batch-document-review`, `deadline-escalated-batch-review` |
| Activities | Parallel Multi-Instance User Task | `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review` |
| Activities | Service Task | `external-service-recording`, `mapped-service-result`, `mapped-business-error-review` |
| Activities | Receive Task | `invoice-receipt-wait` |
| Activities | Task with BPMN Lean task definition | `configured-integration-review` |
| Activities | Call Activity | `called-process-fulfilment` |
| Activities | Embedded Sub-Process | `scoped-parallel-work`, `scoped-business-error-recovery`, `work-package-deadline-escalation`, `scoped-termination` |
| Gateways | Exclusive Gateway | `expense-exception-review`, `boolean-decision-routing`, `request-review-rework` |
| Gateways | Parallel Gateway | `parallel-content-and-risk-review`, `parallel-work-preparation`, `scoped-parallel-work`, `scoped-business-error-recovery`, `scoped-termination` |
| Gateways | Inclusive Gateway | `applicable-review-tracks` |
| Gateways | Event-Based Gateway | `message-or-deadline-routing` |
| Intermediate Catch Events | Message Intermediate Catch Event | `message-triggered-review`, `message-or-deadline-routing` |
| Intermediate Catch Events | Timer Intermediate Catch Event | `timed-review-window`, `message-or-deadline-routing` |
| Boundary Events | Interrupting Timer Boundary Event on User Task | `task-deadline-escalation` |
| Boundary Events | Interrupting Timer Boundary Event on sequential Multi-Instance User Task | `ordered-batch-document-review`, `deadline-escalated-batch-review` |
| Boundary Events | Interrupting Timer Boundary Event on parallel Multi-Instance User Task | `parallel-risk-review-all`, `parallel-risk-review-first`, `deadline-escalated-parallel-risk-review` |
| Boundary Events | Non-interrupting Timer Boundary Event on User Task | `non-interrupting-work-reminder` |
| Boundary Events | Interrupting Timer Boundary Event on Sub-Process | `work-package-deadline-escalation` |
| Boundary Events | Error Boundary Event on Service Task | `mapped-business-error-review` |
| Boundary Events | Error Boundary Event on Sub-Process | `scoped-business-error-recovery` |

## Deduplicated unsupported reusable mechanisms

This ranking compares external candidates with the reusable mechanisms exercised by the retained executable tranche. It includes ingestion, preservation, semantic, and product-integration mechanisms, so the owning research must classify dependencies before a semantic proposal is selected.

| Rank | Reusable mechanism | Clone families | Model files |
|---:|---|---:|---:|
| 1 | `diagramInterchange` | 4 | 5 |
| 2 | `vendorRuntimeMetadata` | 4 | 5 |
| 3 | `collaborationPresentation` | 3 | 4 |
| 4 | `taskMetadata` | 3 | 4 |
| 5 | `dataAssociation` | 2 | 3 |
| 6 | `lanePresentation` | 2 | 3 |
| 7 | `scriptTaskExecution` | 2 | 2 |
| 8 | `businessDecision` | 1 | 2 |
| 9 | `genericTask` | 1 | 1 |
| 10 | `resourceAssignment` | 1 | 1 |
| 11 | `sendTaskDelivery` | 1 | 1 |
| 12 | `signalEvent` | 1 | 1 |

## Deduplicated admission blockers

Blockers are ranked by independent clone families first and physical model files second. They are compiler admission facts, not BPMN requirement priorities or conformance percentages.

| Rank | Compiler mechanism | Clone families | Model files |
|---:|---|---:|---:|
| 1 | `consumeForeignAttribute:bpmn:Process:camunda:historyTimeToLive` | 3 | 4 |
| 2 | `consumeForeignAttribute:bpmn:UserTask:camunda:dueDate` | 2 | 3 |
| 3 | `consumeForeignAttribute:bpmn:UserTask:camunda:formKey` | 2 | 3 |
| 4 | `unsupportedModel:document` | 2 | 3 |
| 5 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:decisionRef` | 1 | 2 |
| 6 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:mapDecisionResult` | 1 | 2 |
| 7 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:resultVariable` | 1 | 2 |
| 8 | `consumeForeignAttribute:bpmn:Process:camunda:versionTag` | 1 | 2 |
| 9 | `consumeForeignAttribute:bpmn:StartEvent:camunda:formKey` | 1 | 2 |
| 10 | `consumeForeignAttribute:bpmn:UserTask:camunda:candidateGroups` | 1 | 2 |
| 11 | `preserveElementType:bpmn:DataStore:element` | 1 | 2 |
| 12 | `preserveElementType:bpmn:Message:element` | 1 | 2 |
| 13 | `consumeForeignAttribute:bpmn:Process:camunda:isStartableInTasklist` | 1 | 1 |
| 14 | `consumeForeignAttribute:bpmn:StartEvent:camunda:initiator` | 1 | 1 |
| 15 | `consumeForeignAttribute:bpmn:UserTask:camunda:assignee` | 1 | 1 |
| 16 | `executeElementType:bpmn:Task:element` | 1 | 1 |
| 17 | `preserveProperty:bpmn:StartEvent:extensionElements` | 1 | 1 |
| 18 | `preserveProperty:bpmn:UserTask:extensionElements` | 1 | 1 |
| 19 | `preserveProperty:bpmn:UserTask:resources` | 1 | 1 |
| 20 | `unsupportedEncoding:document` | 1 | 1 |
