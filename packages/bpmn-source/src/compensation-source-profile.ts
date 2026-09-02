import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  EffectOperation,
  EffectProtocol,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedCompensation,
  CompensationSingleEffectDescriptor,
} from "@bpmn-lean/semantic-core";

export { COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID };

export const COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION =
  "urn:bpmn-lean:effect:compensation-single-effect-v1" as const;

export const compensationSingleEffectDescriptor = Object.freeze({
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.CompensationSingleEffect,
}) satisfies CompensationSingleEffectDescriptor;

export const compensationSourceIds = Object.freeze({
  definitions: "Definitions_Compensation",
  targetNamespace:
    "https://bpmn-lean.org/scenarios/compensation-source-checkpoint",
  itemDefinition: "ItemDefinition_TravelDetails",
  process: "Process_Compensation",
  property: "Property_TravelDetails",
  rootStart: "Start_Travel",
  split: "Gateway_Split",
  reserveHotel: "Task_ReserveHotel",
  reserveBoundary: "Boundary_ReserveHotel_Compensation",
  reserveHandler: "Task_UndoReserveHotel",
  arrangeGroundTravel: "SubProcess_ArrangeGroundTravel",
  arrangeStart: "Start_ArrangeGroundTravel",
  arrangeTask: "Task_ArrangeGroundTravel",
  arrangeEnd: "End_ArrangeGroundTravel",
  eventHandler: "EventSubProcess_UndoGroundTravel",
  eventHandlerStart: "Start_UndoGroundTravel",
  eventHandlerEffect: "Task_UndoGroundTravel",
  eventHandlerEnd: "End_UndoGroundTravel",
  ioSpecification: "IoSpecification_UndoGroundTravel",
  dataInput: "DataInput_TravelDetails",
  inputSet: "InputSet_UndoGroundTravel",
  outputSet: "OutputSet_UndoGroundTravel",
  dataAssociation: "DataInputAssociation_TravelDetails",
  issueInsurance: "Task_IssueInsurance",
  insuranceBoundary: "Boundary_IssueInsurance_Compensation",
  insuranceHandler: "Task_UndoInsurance",
  join: "Gateway_Join",
  trigger: "Throw_Compensate",
  rootEnd: "End_Done",
  reserveAssociation: "Association_ReserveHotel",
  insuranceAssociation: "Association_IssueInsurance",
  reserveDefinition: "Compensate_ReserveHotel",
  insuranceDefinition: "Compensate_IssueInsurance",
  eventHandlerDefinition: "Compensate_UndoGroundTravel",
  globalDefinition: "Compensate_Global",
  rootStartFlow: "Flow_Start_Split",
  splitReserveFlow: "Flow_Split_ReserveHotel",
  reserveArrangeFlow: "Flow_ReserveHotel_ArrangeGroundTravel",
  arrangeJoinFlow: "Flow_ArrangeGroundTravel_Join",
  splitInsuranceFlow: "Flow_Split_IssueInsurance",
  insuranceJoinFlow: "Flow_IssueInsurance_Join",
  joinTriggerFlow: "Flow_Join_Compensate",
  triggerEndFlow: "Flow_Compensate_End",
  arrangeStartFlow: "Flow_ArrangeGroundTravel_Start_Task",
  arrangeEndFlow: "Flow_ArrangeGroundTravel_Task_End",
  handlerStartFlow: "Flow_UndoGroundTravel_Start_Task",
  handlerEndFlow: "Flow_UndoGroundTravel_Task_End",
});

export const compensationSourceLimits = Object.freeze({
  retentionLimits: Object.freeze({
    maxRecords: 2,
    maxCanonicalBytes: 4096,
  }),
  snapshotLimits: Object.freeze({
    maxRecords: 1,
    maxCanonicalBytes: 8192,
  }),
  executionLimits: Object.freeze({
    maxTriggers: 1,
    maxHandlers: 3,
    maxCanonicalBytes: 20480,
  }),
}) satisfies Pick<
  CheckedCompensation,
  "retentionLimits" | "snapshotLimits" | "executionLimits"
>;
