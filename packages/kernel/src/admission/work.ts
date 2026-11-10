/**
 * Admission of Activities, transcribed from `Kernel/Admission/Work.lean`. A refusal carries a stable code.
 *
 * Boundaries are admitted by `admission/subscriptions.ts` through the admission registry. Input and output mappings
 * are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs, an
 * effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an effect's
 * result patch); elsewhere `feature/work.ts` would evaluate a mapping and drop its binding.
 */
import {
  CallBindingTag,
  MappingDialect,
  ValueSourceTag,
  WorkTag,
  assertNever,
  programCalledProcess,
  programProcessChildren,
  elementScope,
  scopeKindStart,
  type ActivityPayload,
  type CallBinding,
  type CallWork,
  type Envelope,
  type Mapping,
  type Program,
  type ReceiveWork,
  type ServiceWork,
  type UserWork,
  type Work,
} from "../il/types.js";

function mapsData(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User:
    case WorkTag.Service:
      return true;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/**
 * The work one instance of a Multi-Instance Activity may do: whether its completion submits the loop's output data
 * item, or `null` for work no instance may do. A User Task submits it; a Service Task's effect result is the empty
 * OutputSet, since a Multi-Instance Activity has no mappings (PC-MI-02). The Multi-Instance shape itself is admitted by
 * `admission/multi-instance.ts`.
 */
export function instanceBody(work: Work): boolean | null {
  switch (work.tag) {
    case WorkTag.User:
      return true;
    case WorkTag.Service:
      return false;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return null;
  }
  return assertNever(work);
}

/** The work an occurrence no token began may do: a task without work, a User Task or a Service Task. */
export function beginsWithoutToken(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Service:
      return true;
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

function envelope(work: Work, fields: Envelope): string | null {
  if (fields.inputs.length > 0 && !mapsData(work)) return "activity.inputMappings";
  if (fields.outputs.length > 0 && !mapsData(work)) return "activity.outputMappings";
  if (fields.multiInstance !== null && instanceBody(work) === null) return "activity.multiInstanceBody";
  // A compensation subject completes through the pipeline's `Hooks.completed`, which `feature/work.ts` reaches for a
  // single User Task or Service Task only.
  if (fields.compensationHandler !== null && (!mapsData(work) || fields.multiInstance !== null)) return "activity.compensationHandler";
  return null;
}

function receive(work: ReceiveWork): string | null {
  if (work.message.correlation.length > 0) return "work.receive.correlation";
  const name = work.message.name;
  if (name === null) return null;
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return null;
    case ValueSourceTag.Expression:
      return "work.receive.messageExpression";
  }
  return assertNever(name);
}

/**
 * The called process's Data Associations correspond to the Call's by position (BPMN 2.0.2 §10.3.6): the kernel reads
 * exactly one input and one output Data Association, the scalar interface the reader resolves; anything else, or a mix
 * with CIB variable mappings, has no correspondence it could read.
 */
function dataCorrespondence(work: CallWork): string | null {
  const isData = (mapping: Mapping): boolean => mapping.dialect === MappingDialect.DataAssociation;
  const mappings = [...work.inputs, ...work.outputs];
  const exact = work.inputs.length === 1 && work.outputs.length === 1 && mappings.every(isData);
  return mappings.some(isData) && !exact ? "work.call.dataCorrespondence" : null;
}

function calledElement(program: Program, work: CallWork): string | null {
  const called = work.calledElement;
  switch (called.tag) {
    case ValueSourceTag.Expression:
      return "work.call.calledElementExpression";
    case ValueSourceTag.Literal: {
      if (called.value === program.identity.processId) return "work.call.rootProcess";
      const process = programCalledProcess(program, called.value);
      if (process === null) return "work.call.calledProcessMissing";
      const eventSubProcess = programProcessChildren(program, process).some((child) => {
        const scope = elementScope(child);
        return scope !== null && scopeKindStart(scope[1].kind) !== null;
      });
      return eventSubProcess ? "call.calledEventSubProcess" : null;
    }
  }
  return assertNever(called);
}

function callBinding(binding: CallBinding): string | null {
  switch (binding.tag) {
    case CallBindingTag.Latest:
      return null;
    case CallBindingTag.Deployment:
    case CallBindingTag.Version:
    case CallBindingTag.VersionTag:
      return "work.call.binding";
  }
  return assertNever(binding);
}

/**
 * CIB drops a Call output whose target is a Multi-Instance counter before writing it
 * (`CallableElementActivityBehavior.java:48,135,160-166`); the counters belong to the loop (BPMN 2.0.2 Table 10.30)
 * (PC-SCOPE-04).
 */
const multiInstanceCounters: readonly string[] = ["nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"];

/**
 * A Call names a called process literally that the program carries, not the root process and without an Event
 * Sub-Process, binds the latest version, carries no business key or tenant and maps its data explicitly; its mappings
 * live in `CallWork`, never in the envelope.
 */
function call(program: Program, work: CallWork): string | null {
  const refused = calledElement(program, work) ?? callBinding(work.binding);
  if (refused !== null) return refused;
  if (work.outputs.some((mapping) => multiInstanceCounters.includes(mapping.target))) return "work.call.multiInstanceCounterOutput";
  if (work.businessKey !== null) return "work.call.businessKey";
  if (work.tenant !== null) return "work.call.tenant";
  if (work.propagateAllInputs || work.propagateAllOutputs) return "work.call.propagateAll";
  return dataCorrespondence(work);
}

/** The fields of a User Task the kernel does not yet read. */
function userTask(task: UserWork): string | null {
  if (task.assignee !== null) return "work.user.assignee";
  if (task.candidateUsers.length > 0) return "work.user.candidateUsers";
  if (task.formKey !== null) return "work.user.formKey";
  if (task.dueDate !== null) return "work.user.dueDate";
  if (task.followUpDate !== null) return "work.user.followUpDate";
  if (task.priority !== null) return "work.user.priority";
  if (task.candidateGroups.some((group) => group.tag === ValueSourceTag.Expression)) return "work.user.candidateGroupExpression";
  return null;
}

function service(work: ServiceWork): string | null {
  return work.protocol.length === 0 || work.operation.length === 0 ? "work.service.unboundImplementation" : null;
}

function work(program: Program, payload: ActivityPayload): string | null {
  const assigned = payload.work;
  switch (assigned.tag) {
    case WorkTag.None:
    case WorkTag.Manual:
      return null;
    case WorkTag.User:
      return userTask(assigned.payload);
    case WorkTag.Receive:
      return receive(assigned.payload);
    case WorkTag.Service:
      return service(assigned.payload);
    case WorkTag.Send:
      return "work.send";
    case WorkTag.Script:
      return "work.script";
    case WorkTag.Rule:
      return "work.rule";
    case WorkTag.Call:
      return call(program, assigned.payload);
  }
  return assertNever(assigned);
}

export function activity(program: Program, payload: ActivityPayload): string | null {
  return work(program, payload) ?? envelope(payload.work, payload.envelope);
}
