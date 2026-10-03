import { StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { CallDataKind } from "./call-data-contract.js";
import { callDataProgramGraph } from "./call-data-program-admission.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";

/** CDATA-INPUT-01 and CDATA-REFUSE-01 bind ingress names to the admitted declaration. */
export function callDataStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (program.identity.semanticProfile !== CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID) return true;
  if (!callDataProgramGraph(program)) return false;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const invoke = program.operations.find((operation) => operation.kind === SemanticOperationKind.InvokeProcess);
      if (invoke?.data.kind !== CallDataKind.Scalar || invoke.data.directInput.source.kind !== "property") return false;
      const { data } = invoke;
      const request = invoke.data.directInput.source.propertyId;
      return stimulus.initialVariables.every(({ name }) => data.callerProperties.includes(name)) &&
        stimulus.initialVariables.filter(({ name }) => name === request).length === 1;
    }
    case StimulusKind.CompleteUserTaskInstance: {
      const tasks = program.operations.filter((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask &&
        operation.task.elementId === stimulus.taskId.elementId);
      const task = tasks[0];
      return tasks.length === 1 && task?.kind === SemanticOperationKind.AwaitDataInputOutputUserTask &&
        stimulus.submittedValues.length === 1 && stimulus.submittedValues[0]?.name === task.directOutput.sourceDataOutputId;
    }
    default: return false;
  }
}
