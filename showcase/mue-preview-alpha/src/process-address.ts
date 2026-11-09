import { engineDefinitionMessageStartWorkflowId } from "@bpmn-lean/engine-api";

/**
 * The host Workflow ID engine-api gives a directly started instance: engine-api exports its instance-address rule only
 * under the Message Start name, and both starts derive the address from the instance alone.
 */
export const processWorkflowId = engineDefinitionMessageStartWorkflowId;
