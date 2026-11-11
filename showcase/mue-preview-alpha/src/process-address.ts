import { engineDefinitionMessageStartWorkflowId } from "@bpmn-lean/engine-api";

/** The Task Queue of the Alpha preview's Worker and platform, which names its engine population. */
export const alphaTaskQueue = "bpmn-mue-preview-alpha";

/**
 * The host Workflow ID engine-api gives a directly started instance of a population: engine-api exports its instance-address rule only
 * under the Message Start name, and both starts derive the address from the population and the instance.
 */
export const processWorkflowId = engineDefinitionMessageStartWorkflowId;
