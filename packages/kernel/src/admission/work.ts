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
  ExpressionTag,
  MappingDialect,
  MessageNames,
  OutputContext,
  ValueSourceTag,
  WorkTag,
  assertNever,
  CalledElementResolution,
  ConfiguredTask,
  ScriptTask,
  callWorkNamesDefinition,
  definitionRefEligibleFor,
  definitionRefEquals,
  elementHeader,
  programCalledProcessFor,
  programCallerDeployment,
  programCallsRoot,
  programProcessOf,
  workCall,
  workResults,
  elementActivity,
  elementEnvelope,
  multiInstanceCounterNames,
  parseJavaInt,
  type ActivityPayload,
  type CallBinding,
  type CalledProcess,
  type CallWork,
  type DefinitionRef,
  type Header,
  type Envelope,
  type Mapping,
  type Program,
  type ProfileOptions,
  type ReceiveWork,
  type ScriptWork,
  type ServiceWork,
  type UserWork,
  type ValueSource,
  type Work,
} from "../il/types.js";
import * as Decision from "./work/decision.js";

/**
 * What admission reads of a work kind, read in one place (`traits`): whether the work carries mappings (a plain Task's
 * only where `readsOwnScope` holds; a decision task's, since `feature/work.ts` `evaluateDecision` writes its result and
 * maps its outputs, PC-AUTO-08), whether it may be a compensation subject (a User Task, Service Task or Call Activity,
 * single or Multi-Instance, whose body's completion retains one record, §13.5.5), what one
 * Multi-Instance instance submits (`instanceBody`), whether an occurrence no token began may do it
 * (`beginsWithoutToken`), the names CIB installs from it (`declaredNames`), whether its run may raise an Error or
 * Escalation in the closure that completes it (an effect's business failure, a called instance's raise), which
 * `admission/flow.ts`'s closure walk follows, and the delegate token it binds.
 */
export interface Traits {
  readonly mapsData: boolean;
  readonly plainTask: boolean;
  readonly compensable: boolean;
  readonly instanceBody: boolean | null;
  readonly beginsWithoutToken: boolean;
  readonly raises: boolean;
  readonly handlerKey: string | null;
}

const noTraits: Traits = {
  mapsData: false, plainTask: false, compensable: false, instanceBody: null, beginsWithoutToken: false, raises: false, handlerKey: null,
};

/** The targets of the mappings CIB itself performs: every one except a BPMN Data Association, which it never runs. */
const writtenTargets = (mappings: readonly Mapping[]): string[] =>
  mappings.filter((mapping) => mapping.dialect !== MappingDialect.DataAssociation).map((mapping) => mapping.target);

/**
 * A User Task submits the loop's output data item; a Service Task's effect result is the empty OutputSet, since a
 * Multi-Instance Activity has no mappings (PC-MI-02); a Receive Task's instance submits no output data item
 * (PC-HUM-06), and its own mappings are the payload outputs `receive` admits. The Multi-Instance shape itself is
 * admitted by `admission/multi-instance.ts`.
 */
export function traits(work: Work): Traits {
  switch (work.tag) {
    case WorkTag.None:
      return { ...noTraits, plainTask: true, beginsWithoutToken: true };
    case WorkTag.Manual:
      return { ...noTraits, beginsWithoutToken: true };
    case WorkTag.User:
      return { ...noTraits, mapsData: true, compensable: true, instanceBody: true, beginsWithoutToken: true };
    case WorkTag.Receive:
      return { ...noTraits, mapsData: true, instanceBody: false };
    case WorkTag.Service:
      return { ...noTraits, mapsData: true, compensable: true, instanceBody: false, beginsWithoutToken: true, raises: true,
        handlerKey: work.payload.handlerKey };
    case WorkTag.Send:
      return { ...noTraits, raises: true, handlerKey: work.payload.handlerKey };
    case WorkTag.Script:
      return { ...noTraits, instanceBody: false };
    case WorkTag.Rule:
      return { ...noTraits, mapsData: true };
    case WorkTag.Call:
      return { ...noTraits, compensable: true, instanceBody: false, raises: true };
  }
  return assertNever(work);
}

/**
 * The names CIB installs from a work: its results (`workResults`) and a Call's mapping targets, those of its input
 * mappings among them, which the called instance receives.
 */
export function workNames(work: Work): readonly string[] {
  const call = workCall(work);
  return [...workResults(work), ...(call === null ? [] : writtenTargets([...call.inputs, ...call.outputs]))];
}

/** The work one instance of a Multi-Instance Activity may do: whether it submits the output data item, else `null`. */
export const instanceBody = (work: Work): boolean | null => traits(work).instanceBody;

/** The work an occurrence no token began may do: a task without work, a User Task or a Service Task. */
export const beginsWithoutToken = (work: Work): boolean => traits(work).beginsWithoutToken;

/**
 * A plain Task completes with the empty submission, so its outputs have a source only under
 * `OutputContext.ActivityScope` (CIB-EXT-0031), and only as `camunda:outputParameter`s: CIB parses those on any task
 * (`BpmnParse.java:4825-4831`), makes the Task a scope (`:4801-4815`) and runs them when its execution ends
 * (`ExecutionEntity.java:521-525`), as for a User or Service Task.
 */
function readsOwnScope(options: ProfileOptions, outputs: readonly Mapping[]): boolean {
  return options.outputContext === OutputContext.ActivityScope && outputs.every((mapping) => mapping.dialect === MappingDialect.IoParameter);
}

function workEnvelope(options: ProfileOptions, work: Traits, fields: Envelope): string | null {
  if (fields.inputs.length > 0 && !work.mapsData) return "activity.inputMappings";
  if (fields.outputs.length > 0 && !work.mapsData && !(work.plainTask && readsOwnScope(options, fields.outputs))) {
    return "activity.outputMappings";
  }
  if (fields.multiInstance !== null && work.instanceBody === null) return "activity.multiInstanceBody";
  if (fields.compensationHandlers.length > 0 && !work.compensable) return "activity.compensationHandler";
  return null;
}

/**
 * An Activity or Scope compensates through one handler. BPMN 2.0.2 states no limit; CIB keeps one per Activity or scope
 * (`BpmnParse.java:913-920`, `:1199-1201`, `:1754`).
 */
export function handlerCount(fields: Envelope): string | null {
  return fields.compensationHandlers.length > 1 ? "compensation.handlerCount" : null;
}

/**
 * The names CIB installs from the model as variables an expression may read: every element's parameter targets and
 * loop item names, and its work's names (`workNames`). A process-level item is none, since CIB parses no Property, Data
 * Object or process I/O specification (`BpmnParse.java:726`).
 */
function declaredNames(program: Program): string[] {
  return program.elements.flatMap((element) => {
    const fields = elementEnvelope(element);
    const loop = fields?.multiInstance ?? null;
    const performed = elementActivity(element);
    return [
      ...(fields === null ? [] : writtenTargets([...fields.inputs, ...fields.outputs])),
      ...(loop === null ? [] : [loop.elementVariable, loop.inputDataItem, loop.inputDataItemName].filter((name): name is string => name !== null)),
      ...(performed === null ? [] : workNames(performed[1].work)),
    ];
  });
}

/**
 * CIB resolves a delegate token against the variables before its beans (`JuelExpressionManager.java:144-150`), so a
 * declared name equal to it shadows the handler and the job fails (CIB-LIM-0017).
 */
export function handlerKey(program: Program, token: string | null): string | null {
  return token !== null && declaredNames(program).includes(token) ? "work.handlerKeyName" : null;
}

/**
 * An instantiating Receive Task starts its Process (BPMN 2.0.2 §10.3.3, Table 10.10), which pinned CIB never reads
 * (CIB-LIM-0008) (PC-BASIC-04). A Data Output of a Receive Task with a Message must be equivalent to the Message's
 * ItemDefinition (§10.4.1, "Receive Task Mapping"); equivalence is read narrowly as the same ItemDefinition identifier,
 * both absent included, and any other pair is refused (`work.receive.dataOutputItem`), a forward-compatible restriction
 * the carried identifiers keep open. The task has "at most outputSet set and at most one Data Output" (§10.4.1), so a
 * second of either is refused (`work.receive.dataOutputs`). Its payload reaches scope only through Data Associations
 * that read its Data Output (`feature/work.ts#triggerActivity`); an input mapping, or an output mapping of another kind
 * or source, is refused as on work that maps no data (`activity.inputMappings`, `activity.outputMappings`). Under name
 * addressing a Receive Task with a Message subscribes by its name as a Message Event does (`BpmnParse.java:2753-2759`),
 * so a missing or blank name is refused (CIB-LIM-0022).
 */
function receive(options: ProfileOptions, work: ReceiveWork, envelope: Envelope): string | null {
  if (work.instantiate) return "work.receive.instantiate";
  if (work.message.correlation.length > 0) return "work.receive.correlation";
  if (work.message.messageRef !== null && work.dataOutputs.some((output) => output.itemRef !== work.message.itemRef)) {
    return "work.receive.dataOutputItem";
  }
  if (work.dataOutputs.length > 1 || work.outputSets > 1) return "work.receive.dataOutputs";
  if (envelope.inputs.length > 0) return "activity.inputMappings";
  const readsDataOutput = (mapping: Mapping): boolean => {
    const source = mapping.source;
    return mapping.dialect === MappingDialect.DataAssociation && source.tag === ExpressionTag.Variable &&
      work.dataOutputs.some((output) => output.id === source.name);
  };
  if (!envelope.outputs.every(readsDataOutput)) return "activity.outputMappings";
  const unnamed = options.messageNames === MessageNames.Addresses && work.message.messageRef !== null;
  const name = work.message.name;
  if (name === null) return unnamed ? "message.unnamed" : null;
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return unnamed && [...name.value].every((char) => char <= " ") ? "message.unnamed" : null;
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

/**
 * Under `CalledElementResolution.qualifiedName` the literal is a QName, and one whose prefix has no namespace binding
 * names nothing (`Semantic.xsd:149`). A carried process eligible for the Call's caller must answer the name before the
 * binding is read (PC-SCOPE-03).
 */
function calledElement(program: Program, header: Header, work: CallWork): string | null {
  const called = work.calledElement;
  const resolution = program.options.calledElementResolution;
  const deployment = programCallerDeployment(program, header);
  switch (called.tag) {
    case ValueSourceTag.Expression:
      return "work.call.calledElementExpression";
    case ValueSourceTag.Literal: {
      if (resolution === CalledElementResolution.QualifiedName && work.calledQName === null) return "work.call.calledElementUnbound";
      if (programCallsRoot(program, resolution, work)) return "work.call.rootProcess";
      return program.processes.some((process) =>
        definitionRefEligibleFor(deployment, process.definition) && callWorkNamesDefinition(resolution, work, process.definition))
        ? null : "work.call.calledProcessMissing";
    }
  }
  return assertNever(called);
}

/** Exactly one carried process must answer the whole selector at the Call's caller's deployment (PC-SCOPE-03). */
function calledProcess(program: Program, header: Header, work: CallWork): string | null {
  const resolution = program.options.calledElementResolution;
  const processes = programCalledProcessFor(program, resolution, programCallerDeployment(program, header), work);
  if (processes.length === 0) return "work.call.calledProcessMissing";
  return processes.length === 1 ? null : "work.call.ambiguous";
}

/**
 * A Call binds the latest version in every profile; under `cibKey` also its caller's own `deployment` and a literal
 * `version` or `versionTag` (CIB-EXT-0045), each resolved when its caller is deployed. CIB resolves a version or tag an
 * expression gives at each invocation (`CallableElementUtil.java:75-103`), which binding at deployment cannot
 * (CIB-LIM-0032).
 */
function callBinding(resolution: CalledElementResolution, binding: CallBinding): string | null {
  if (binding.tag === CallBindingTag.Latest) return null;
  if (resolution === CalledElementResolution.QualifiedName) return "work.call.binding";
  switch (binding.tag) {
    case CallBindingTag.Deployment:
      return null;
    case CallBindingTag.Version:
    case CallBindingTag.VersionTag:
      return binding.value.tag === ValueSourceTag.Literal ? null : "work.call.bindingExpression";
  }
  return assertNever(binding);
}

/** The carried process a Call on `header`'s element binds, when its selector admits exactly one. */
function boundProcess(program: Program, header: Header, work: CallWork): CalledProcess | null {
  const resolution = program.options.calledElementResolution;
  const [process, ...others] = programCalledProcessFor(program, resolution, programCallerDeployment(program, header), work);
  return process !== undefined && others.length === 0 ? process : null;
}

/** The carried processes the Calls on `process`'s elements bind. */
function callees(program: Program, process: CalledProcess): readonly CalledProcess[] {
  return program.elements.flatMap((element) => {
    const owner = programProcessOf(program, elementHeader(element));
    const activity = elementActivity(element);
    const work = activity === null ? null : workCall(activity[1].work);
    if (owner === null || !definitionRefEquals(owner.definition, process.definition) || activity === null || work === null) return [];
    const bound = boundProcess(program, activity[0], work);
    return bound === null ? [] : [bound];
  });
}

/**
 * Whether `origin` is in `frontier` or among the processes its Calls bind, transitively. Each process is expanded once
 * (`seen`), so the search is linear in the carried processes, which also bound its rounds (`fuel`).
 */
function callsInto(program: Program, origin: DefinitionRef, fuel: number, seen: readonly DefinitionRef[],
  frontier: readonly CalledProcess[]): boolean {
  if (fuel === 0) return false;
  const fresh = frontier.filter((process) => !seen.some((definition) => definitionRefEquals(definition, process.definition)));
  return fresh.some((process) => definitionRefEquals(process.definition, origin)) ||
    (fresh.length > 0 && callsInto(program, origin, fuel - 1, [...seen, ...fresh.map((process) => process.definition)],
      fresh.flatMap((process) => callees(program, process))));
}

/**
 * A Call on a carried process whose callee leads back to that process is recursion, which CIB runs as a new instance per
 * invocation and assembly-time binding refuses (CIB-LIM-0034), as a call of the root process is.
 */
function cycle(program: Program, header: Header, work: CallWork): string | null {
  const own = programProcessOf(program, header);
  const callee = boundProcess(program, header, work);
  if (own === null || callee === null) return null;
  return callsInto(program, own.definition, program.processes.length + 1, [], [callee]) ? "work.call.cycle" : null;
}

/**
 * A Call's Data Associations correspond to its callee's by position (BPMN 2.0.2 §10.3.6), which the reader resolves only
 * within the caller's document; a callee of another deployment has no correspondence the program carries (CIB-LIM-0035).
 */
function dataAcrossDeployments(program: Program, header: Header, work: CallWork): string | null {
  const callee = boundProcess(program, header, work);
  const data = [...work.inputs, ...work.outputs].some((mapping) => mapping.dialect === MappingDialect.DataAssociation);
  return data && callee !== null && callee.definition.deployment !== programCallerDeployment(program, header)
    ? "work.call.dataAcrossDeployments" : null;
}

/**
 * CIB drops a Call output whose target is a Multi-Instance counter before writing it
 * (`CallableElementActivityBehavior.java:48,135,160-166`); the counters belong to the loop (BPMN 2.0.2 Table 10.30)
 * (PC-SCOPE-04). `loopCounter` is not among them: CIB's list holds only the three instance counts.
 */
const multiInstanceCounters: readonly string[] = multiInstanceCounterNames.filter((name) => name !== "loopCounter");

/**
 * A Call names a called process literally that the program carries, not the root process, binds as its profile admits
 * (`callBinding`), carries no business key or tenant and maps its data explicitly; its mappings live in `CallWork`,
 * never in the envelope. A Call on a carried process binds at that process's deployment (`programCallerDeployment`).
 */
function call(program: Program, header: Header, work: CallWork): string | null {
  const refused = calledElement(program, header, work) ?? callBinding(program.options.calledElementResolution, work.binding) ??
    calledProcess(program, header, work) ?? cycle(program, header, work);
  if (refused !== null) return refused;
  if (work.outputs.some((mapping) => multiInstanceCounters.includes(mapping.target))) return "work.call.multiInstanceCounterOutput";
  if (work.businessKey !== null) return "work.call.businessKey";
  if (work.tenant !== null) return "work.call.tenant";
  if (work.propagateAllInputs || work.propagateAllOutputs) return "work.call.propagateAll";
  return dataCorrespondence(work) ?? dataAcrossDeployments(program, header, work);
}

/**
 * A Business Rule Task names a decision among the DMN resources deployed with its own document, which a copy of another
 * deployment's process does not carry (CIB-LIM-0036).
 */
function ruleAcrossDeployments(program: Program, header: Header): string | null {
  const deployment = programProcessOf(program, header)?.definition.deployment ?? null;
  return deployment !== null && deployment !== program.identity.deployment ? "work.rule.acrossDeployments" : null;
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
  return !value.startsWith("+") && parseJavaInt(value) !== null;
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

/**
 * The `scriptFormat` names CIB runs on its JavaScript engine, compared ignoring ASCII case: `javascript` and `ecmascript`
 * by name (`DefaultScriptEngineResolver.java:76-89`), `js` by the engine's own (probe P1, 2026-11-12).
 */
const javascriptFormats: readonly string[] = ["javascript", "ecmascript", "js"];

const asciiLower = (text: string): string => text.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());

/** Whether `format` names CIB's JavaScript engine; the host's evaluator asks this, so admission owns the list. */
export const isJavascriptFormat = (format: string): boolean => javascriptFormats.includes(asciiLower(format));

/**
 * A source CIB evaluates as a JUEL expression before it runs the value as the script: its text after the characters
 * Java's `trim` drops starts with `${` or `#{` (`ScriptUtil.java:89-93,192-194`, `StringUtil.java:58-61`).
 */
function sourceExpression(source: string): boolean {
  const text = source.replace(/^[\u0000-\u0020]+/u, "");
  return text.startsWith("${") || text.startsWith("#{");
}

/**
 * A Script Task ([script semantics](../../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md)). The standards profile
 * names no script language and refuses every one. Under `ScriptTask.Javascript` it is admitted as an inline JavaScript
 * source; a Script referenced by `camunda:resource` has no source in the program, and one with neither a source nor a
 * resource CIB refuses at deployment (`ScriptUtil.java:66-75`).
 */
function script(options: ProfileOptions, work: ScriptWork): string | null {
  if (work.resource !== null) return "work.script.resource";
  switch (options.scriptTask) {
    case ScriptTask.Refused:
      return "work.script";
    case ScriptTask.Javascript:
      if (!isJavascriptFormat(work.format)) return "work.script.language";
      if (work.source === null) return "work.script.source";
      return sourceExpression(work.source) ? "work.script.sourceExpression" : null;
  }
  return assertNever(options.scriptTask);
}

/**
 * Service work without a binding has no handler to invoke (CIB-LIM-0051). The work of a Task carrying the
 * `bpmnLean:taskDefinition` extension is refused under `ConfiguredTask.Refused`, since CIB ignores the extension and
 * passes the Task through (CIB-LIM-0011).
 */
function service(options: ProfileOptions, work: ServiceWork): string | null {
  if (work.taskDefinition && options.configuredTask === ConfiguredTask.Refused) return "work.configuredTask";
  return work.protocol.length === 0 || work.operation.length === 0 ? "work.service.unboundImplementation" : null;
}

/**
 * A looping Call's input Data Associations: the reader reads the loop's item association as the Call's own input from
 * the `inputDataItem`, while each instance holds the item under the Data Input that association feeds (BPMN 2.0.2
 * Table 10.29, §10.3.6), and it reads the collection's association as a second input, so the called instance would not
 * receive the item (`call-input-unavailable`). A forward-compatible restriction; CIB performs no Data Association
 * (CIB-LIM-0013).
 */
function loopedCallInputs(envelope: Envelope, work: CallWork): string | null {
  return envelope.multiInstance !== null && work.inputs.some((mapping) => mapping.dialect === MappingDialect.DataAssociation)
    ? "work.call.multiInstanceDataInput"
    : null;
}

function work(program: Program, header: Header, payload: ActivityPayload): string | null {
  const assigned = payload.work;
  switch (assigned.tag) {
    case WorkTag.None:
    case WorkTag.Manual:
      return null;
    case WorkTag.User:
      return userTask(assigned.payload);
    case WorkTag.Receive:
      return receive(program.options, assigned.payload, payload.envelope);
    case WorkTag.Service:
      return service(program.options, assigned.payload);
    case WorkTag.Send:
      return "work.send";
    case WorkTag.Script:
      return script(program.options, assigned.payload);
    case WorkTag.Rule:
      return ruleAcrossDeployments(program, header) ?? Decision.task(program, assigned.payload, payload.envelope);
    case WorkTag.Call:
      return loopedCallInputs(payload.envelope, assigned.payload) ?? call(program, header, assigned.payload);
  }
  return assertNever(assigned);
}

export function activity(program: Program, header: Header, payload: ActivityPayload): string | null {
  const read = traits(payload.work);
  return work(program, header, payload) ?? handlerKey(program, read.handlerKey) ?? workEnvelope(program.options, read, payload.envelope);
}
