/**
 * Admission of Activities, transcribed from `Kernel/Admission/Work.lean`. A refusal carries a stable code.
 *
 * Boundaries are admitted by `admission/subscriptions.ts` through the admission registry. Input and output mappings
 * are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs, an
 * effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an effect's
 * result patch); elsewhere `feature/work.ts` would evaluate a mapping and drop its binding. A plain Task's completion
 * submits nothing, so its output parameters are admitted only where they read the Task's own scope (`readsOwnScope`).
 */
import {
  CallBindingTag,
  MappingDialect,
  OutputContext,
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
  type ProfileOptions,
  type ReceiveWork,
  type ServiceWork,
  type UserWork,
  type ValueSource,
  type Work,
} from "../il/types.js";
import * as Decision from "./work/decision.js";

/**
 * Whether `work` carries mappings. A plain Task carries them when `plainTask` holds (`readsOwnScope`); a decision task
 * when `decisionTask` holds, since `feature/work.ts` `evaluateDecision` writes its result and maps its outputs
 * (PC-AUTO-08), though no compensation subject completes through it.
 */
function mapsData(plainTask: boolean, decisionTask: boolean, work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User:
    case WorkTag.Service:
      return true;
    case WorkTag.None:
      return plainTask;
    case WorkTag.Rule:
      return decisionTask;
    case WorkTag.Manual:
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/**
 * The work one instance of a Multi-Instance Activity may do: whether its completion submits the loop's output data
 * item, or `null` for work no instance may do. A User Task submits it; a Service Task's effect result is the empty
 * OutputSet, since a Multi-Instance Activity has no mappings (PC-MI-02); a Receive Task's delivery carries no payload
 * (PC-HUM-06). The Multi-Instance shape itself is admitted by `admission/multi-instance.ts`.
 */
export function instanceBody(work: Work): boolean | null {
  switch (work.tag) {
    case WorkTag.User:
      return true;
    case WorkTag.Service:
    case WorkTag.Receive:
      return false;
    case WorkTag.None:
    case WorkTag.Manual:
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

/**
 * A plain Task completes with the empty submission, so its outputs have a source only under
 * `OutputContext.ActivityScope` (CIB-EXT-0031), and only as `camunda:outputParameter`s: CIB parses those on any task
 * (`BpmnParse.java:4825-4831`), makes the Task a scope (`:4801-4815`) and runs them when its execution ends
 * (`ExecutionEntity.java:521-525`), as for a User or Service Task.
 */
function readsOwnScope(options: ProfileOptions, outputs: readonly Mapping[]): boolean {
  return options.outputContext === OutputContext.ActivityScope && outputs.every((mapping) => mapping.dialect === MappingDialect.IoParameter);
}

function envelope(options: ProfileOptions, work: Work, fields: Envelope): string | null {
  if (fields.inputs.length > 0 && !mapsData(false, true, work)) return "activity.inputMappings";
  if (fields.outputs.length > 0 && !mapsData(readsOwnScope(options, fields.outputs), true, work)) return "activity.outputMappings";
  if (fields.multiInstance !== null && instanceBody(work) === null) return "activity.multiInstanceBody";
  // A compensation subject completes through the pipeline's `Hooks.completed`, which `feature/work.ts` reaches for a
  // single User Task or Service Task only.
  if (fields.compensationHandler !== null && (!mapsData(false, false, work) || fields.multiInstance !== null)) return "activity.compensationHandler";
  return null;
}

/**
 * An instantiating Receive Task starts its Process (BPMN 2.0.2 §10.3.3, Table 10.10), which pinned CIB never reads
 * (CIB-LIM-0008) (PC-BASIC-04).
 */
function receive(work: ReceiveWork): string | null {
  if (work.instantiate) return "work.receive.instantiate";
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

/** A model string CIB evaluates as an expression: it holds `${` or `#{`, the reader's own marker. */
function expressionText(value: string): boolean {
  return value.includes("${") || value.includes("#{");
}

/** The number the `count` decimal digits of `chars` from `start` spell, when they are all digits. */
function digitsAt(chars: readonly string[], start: number, count: number): number | null {
  const part = chars.slice(start, start + count);
  if (part.length !== count || !part.every((char) => char >= "0" && char <= "9")) return null;
  return part.reduce((number, char) => number * 10 + (char.charCodeAt(0) - 48), 0);
}

function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * `YYYY-MM-DDTHH:MM:SSZ`, a calendar instant in UTC: the one date form CIB reads as the same instant on every engine,
 * since it reads a form without offset in the JVM's zone and one starting with `P` as a duration from now
 * (`DueDateBusinessCalendar#resolveDuedate`, `DateTimeUtil#parseDate`), and its projection prints it back unchanged.
 */
function utcInstant(value: string): boolean {
  const chars = [...value];
  const charAt = (index: number, char: string): boolean => chars[index] === char;
  const [year, month, day, hour, minute, second] = [[0, 4], [5, 2], [8, 2], [11, 2], [14, 2], [17, 2]]
    .map(([start, count]) => digitsAt(chars, start!, count!));
  if (year == null || month == null || day == null || hour == null || minute == null || second == null) return false;
  return chars.length === 20 && charAt(4, "-") && charAt(7, "-") && charAt(10, "T") && charAt(13, ":") && charAt(16, ":") &&
    charAt(19, "Z") && 0 < year && 0 < month && month <= 12 && 0 < day && day <= daysIn(year, month) && hour < 24 &&
    minute < 60 && second < 60;
}

/**
 * A decimal Java `int`, optionally negative: CIB parses a literal priority with `Integer.parseInt`
 * (`TaskDecorator#initializeTaskPriority`); a `+` sign, which Java also reads, is refused rather than carried.
 */
function javaInt(value: string): boolean {
  const digits = value.startsWith("-") ? value.slice(1) : value;
  if (digits.length === 0 || ![...digits].every((char) => char >= "0" && char <= "9")) return false;
  const number = BigInt(value);
  return -2147483648n <= number && number <= 2147483647n;
}

/** A field's literal value satisfies `admitted`; an expression waits for the Task fields JUEL level. */
function literalField(admitted: (value: string) => boolean, source: ValueSource | null): boolean {
  if (source === null) return true;
  switch (source.tag) {
    case ValueSourceTag.Literal:
      return admitted(source.value);
    case ValueSourceTag.Expression:
      return false;
  }
  return assertNever(source);
}

/**
 * CIB's built-in form field types without configuration (`ProcessEngineConfigurationImpl#initFormTypes`); an `enum`
 * field's values are not carried. CIB refuses a field without an id or type at deployment
 * (`DefaultFormHandler#parseFormField`, `FormTypes#parseFormPropertyType`).
 */
const formFieldTypes: readonly string[] = ["string", "long", "boolean", "date"];

/**
 * The User Task fields the kernel reads are literal (PC-HUM-02); each expression-valued field waits for the Task fields
 * JUEL level, a relative or zoned date and a non-decimal priority stay refused.
 */
function userTask(task: UserWork): string | null {
  const always = (): boolean => true;
  if (!literalField(always, task.assignee)) return "work.user.assignee";
  if (!task.candidateUsers.every((user) => literalField(always, user))) return "work.user.candidateUsers";
  if (task.formKey !== null && expressionText(task.formKey)) return "work.user.formKey";
  if (!literalField(utcInstant, task.dueDate)) return "work.user.dueDate";
  if (!literalField(utcInstant, task.followUpDate)) return "work.user.followUpDate";
  if (!literalField(javaInt, task.priority)) return "work.user.priority";
  if (!task.candidateGroups.every((group) => literalField(always, group))) return "work.user.candidateGroupExpression";
  if (task.formFields.some(([key, type]) => key.length === 0 || !formFieldTypes.includes(type))) return "work.user.formField";
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
      return Decision.task(program, assigned.payload);
    case WorkTag.Call:
      return call(program, assigned.payload);
  }
  return assertNever(assigned);
}

export function activity(program: Program, payload: ActivityPayload): string | null {
  return work(program, payload) ?? envelope(program.options, payload.work, payload.envelope);
}
