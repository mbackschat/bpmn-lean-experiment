# Executable BPMN model corpus index

This file is generated from `manifest.json` by the executable corpus guard. Edit the manifest or evidence owners, not this index by hand.

## Current result

The first tranche contains 5 retained executable models and 7 exact external candidates. 5 are admitted, 7 are rejected, and 1 is eligible for the browser catalog.

## Models

| Model | Source | Clone family | Admission | Pipeline | CIB | Product 2 |
|---|---|---|---|---|---|---|
| Review a request with assignment and form metadata | retainedScenario | human-review-with-form | accepted | user-task-assignment-form-metadata | pipeline | journeyBacked |
| Prepare two work items in parallel | retainedScenario | parallel-two-human-tasks | accepted | parallel-fork-join-a-then-b | pipeline | notCatalogReady |
| Route a Boolean decision | retainedScenario | exclusive-boolean-decision | accepted | exclusive-gateway-simple-boolean-first-true | notSelected | notCatalogReady |
| Fulfil work through a called Process | retainedScenario | called-process-human-work | accepted | called-process-call-activity | notSelected | notCatalogReady |
| Record an external service effect | retainedScenario | single-service-effect | accepted | service-task-effect-success | pipeline | notCatalogReady |
| CIB Seven order goods | externalGit | cib-order-goods | rejected | none | notApplicable | notCatalogReady |
| CIB Seven review invoice | externalGit | cib-review-invoice | rejected | none | notApplicable | notCatalogReady |
| CIB Seven invoice receipt version 1 | externalGit | cib-invoice-receipt | rejected | none | notApplicable | notCatalogReady |
| CIB Seven invoice receipt version 2 | externalGit | cib-invoice-receipt | rejected | none | notApplicable | notCatalogReady |
| CIB Seven vacation request | externalGit | cib-vacation-request | rejected | none | notApplicable | notCatalogReady |
| OMG incident management executable example | externalArchiveEntry | omg-incident-management | rejected | none | notApplicable | notCatalogReady |
| Betsy workflow pattern 16 deferred choice | externalGit | betsy-wcp16-deferred-choice | rejected | none | notApplicable | notCatalogReady |

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
| 9 | `eventRace` | 1 | 1 |
| 10 | `genericTask` | 1 | 1 |
| 11 | `messageStart` | 1 | 1 |
| 12 | `parallelSplit` | 1 | 1 |
| 13 | `resourceAssignment` | 1 | 1 |
| 14 | `sendTaskDelivery` | 1 | 1 |
| 15 | `signalEvent` | 1 | 1 |
| 16 | `timerWait` | 1 | 1 |

## Deduplicated admission blockers

Blockers are ranked by independent clone families first and physical model files second. They are compiler admission facts, not BPMN requirement priorities or conformance percentages.

| Rank | Compiler mechanism | Clone families | Model files |
|---:|---|---:|---:|
| 1 | `consumeForeignAttribute:bpmn:Process:camunda:historyTimeToLive` | 3 | 4 |
| 2 | `preserveProperty:bpmn:Definitions:diagrams` | 3 | 4 |
| 3 | `unsupportedModel:document` | 3 | 4 |
| 4 | `consumeForeignAttribute:bpmn:UserTask:camunda:dueDate` | 2 | 3 |
| 5 | `consumeForeignAttribute:bpmn:UserTask:camunda:formKey` | 2 | 3 |
| 6 | `preserveProperty:bpmn:Definitions:exporter` | 2 | 3 |
| 7 | `preserveProperty:bpmn:Definitions:exporterVersion` | 2 | 3 |
| 8 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:decisionRef` | 1 | 2 |
| 9 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:mapDecisionResult` | 1 | 2 |
| 10 | `consumeForeignAttribute:bpmn:BusinessRuleTask:camunda:resultVariable` | 1 | 2 |
| 11 | `consumeForeignAttribute:bpmn:Process:camunda:versionTag` | 1 | 2 |
| 12 | `consumeForeignAttribute:bpmn:StartEvent:camunda:formKey` | 1 | 2 |
| 13 | `consumeForeignAttribute:bpmn:UserTask:camunda:candidateGroups` | 1 | 2 |
| 14 | `consumeForeignAttribute:bpmn:Process:camunda:isStartableInTasklist` | 1 | 1 |
| 15 | `consumeForeignAttribute:bpmn:StartEvent:camunda:initiator` | 1 | 1 |
| 16 | `consumeForeignAttribute:bpmn:UserTask:camunda:assignee` | 1 | 1 |
| 17 | `executeElementType:bpmn:Task:element` | 1 | 1 |
| 18 | `preserveProperty:bpmn:StartEvent:extensionElements` | 1 | 1 |
| 19 | `preserveProperty:bpmn:UserTask:documentation` | 1 | 1 |
| 20 | `preserveProperty:bpmn:UserTask:extensionElements` | 1 | 1 |
| 21 | `preserveProperty:bpmn:UserTask:resources` | 1 | 1 |
| 22 | `unsupportedEncoding:document` | 1 | 1 |
