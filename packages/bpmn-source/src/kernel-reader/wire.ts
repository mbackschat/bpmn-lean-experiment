/**
 * The kernel IL's wire form, Lean's derived JSON encoding of `Kernel/IL/Types.lean`: a structure is an object with
 * every field, a nullary constructor a string, any other constructor `{"<name>": {<arguments>}}`. The reader builds
 * this form directly so `@bpmn-lean/bpmn-source` needs no dependency on the kernel package.
 */
export type KernelJson = null | boolean | number | string | KernelJson[] | { [key: string]: KernelJson };

/** Exhaustiveness witness for every `switch` over a reader enum; no such switch has a `default:` arm. */
export function assertNever(value: never): never {
  throw new TypeError(`unhandled reader variant ${JSON.stringify(value)}`);
}

export const ctor = (name: string, args: Record<string, KernelJson>): KernelJson => ({ [name]: args });

export const literalSource = (value: string): KernelJson => ctor("literal", { value });
export const expressionSource = (body: KernelJson): KernelJson => ctor("expression", { body });
export const variable = (name: string): KernelJson => ctor("variable", { name });
export const stringLiteral = (value: string): KernelJson => ctor("literal", { value: { kind: "string", value } });
export const foreign = (language: string, source: string): KernelJson => ctor("foreign", { language, source });
/** The syntax that wrote a mapping, which settles what an unset source means (`Kernel.MappingDialect`). */
export enum MappingSyntax {
  DataAssociation = "dataAssociation",
  IoParameter = "ioParameter",
  CallVariable = "callVariable",
}

export const mapping = (target: string, source: KernelJson, dialect: MappingSyntax): KernelJson => ({ target, source, dialect });
export const subscription = (trigger: KernelJson, outputs: KernelJson[] = []): KernelJson => ({ trigger, outputs });

/** Lean's `String` order, by Unicode scalar value; the IL's id-keyed lists keep it, as the kernel's publication does. */
export function compareIds(left: string, right: string): number {
  const a = [...left].map((char) => char.codePointAt(0) ?? 0);
  const b = [...right].map((char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

/**
 * The kernel IL's `ProfileOptions` in its wire form: every field, each enum value its Lean constructor name. The
 * kernel's behaviour branches on these fields; `relations` is provenance only.
 */
export type KernelProfileOptions = Readonly<{
  relations: string[];
  evaluator: "simpleBoolean" | "juel";
  submission: "outputSet" | "installsVariables";
  scopeChainSubmissionBytes: number | null;
  undeclaredWrite: "refused" | "atInstanceRoot";
  errorPathOutputs: "none" | "mapped";
  technicalFailure: "hostFailure" | "incident";
  incidentProcessCancellation: boolean;
  continuationFailure: "rolledBack" | "incident";
  conditionOrder: "afterOutputs" | "beforeOutputs";
  messageCorrelation: "modeledKey" | "apiCriteria";
  deliveryVariables: "mappedOnly" | "installs";
  multiInstanceFinalBody: "conditionEveryCompletion" | "modeSpecific";
  multiInstanceOutputs: "aggregates" | "none";
  compensationOrder: "dependency" | "reverseCreation";
  compensationHandlerFailure: "failsInstance" | Readonly<{ selected: Readonly<{ code: string }> }>;
  abnormalScopeEnd: "withoutOutflow" | "completesNormally";
  unhandledError: "failsInstance" | "endsThrowingPath";
  errorCatchVariables: "refused" | "eventScope";
  callBindingTime: "programAssembly" | "invocation";
  timerZone: string | null;
  multiInstanceBinding: "dataAssociations" | "loopReferences";
  effectResultValues: "outputSet" | "activityLocals";
}>;

/** One portable value's allowance, which bounds a scope-chain submission (`NSD-TASK-01`). */
const portableValueAllowanceBytes = 16_384;

/**
 * The kernel options a profile selects, derived from its CIB relation identifiers
 * ([register](../../../../docs/CIB-BPMN-RELATION-REGISTER.md)), never from its identity. A field takes its
 * non-default value exactly when the profile selects a relation `Kernel/IL/Types.lean` names for that value; every
 * other field keeps the standards reading.
 */
export function kernelProfileOptions(relations: readonly string[]): KernelProfileOptions {
  const selects = (...ids: string[]): boolean => ids.some((id) => relations.includes(id));
  return {
    relations: [...relations],
    evaluator: "simpleBoolean",
    submission: selects("CIB-EXT-0005", "CIB-EXT-0010") ? "installsVariables" : "outputSet",
    scopeChainSubmissionBytes: selects("CIB-EXT-0020") ? portableValueAllowanceBytes : null,
    undeclaredWrite: selects("CIB-EXT-0005", "CIB-EXT-0007", "CIB-EXT-0009", "CIB-EXT-0020") ? "atInstanceRoot" : "refused",
    errorPathOutputs: selects("CIB-EXT-0004", "CIB-EXT-0009", "CIB-EXT-0016") ? "mapped" : "none",
    technicalFailure: selects("CIB-EXT-0013", "CIB-OP-0008", "CIB-CFG-0008") ? "incident" : "hostFailure",
    incidentProcessCancellation: selects("CIB-OP-0009"),
    continuationFailure: selects("CIB-EXT-0026") ? "incident" : "rolledBack",
    conditionOrder: selects("CIB-INT-0011") ? "beforeOutputs" : "afterOutputs",
    messageCorrelation: selects("CIB-EXT-0025") ? "apiCriteria" : "modeledKey",
    deliveryVariables: selects("CIB-EXT-0025") ? "installs" : "mappedOnly",
    multiInstanceFinalBody: selects("CIB-INT-0009") ? "modeSpecific" : "conditionEveryCompletion",
    multiInstanceOutputs: selects("CIB-LIM-0001") ? "none" : "aggregates",
    compensationOrder: "dependency",
    compensationHandlerFailure: "failsInstance",
    abnormalScopeEnd: selects("CIB-INT-0007") ? "completesNormally" : "withoutOutflow",
    unhandledError: selects("CIB-INT-0013") ? "endsThrowingPath" : "failsInstance",
    errorCatchVariables: selects("CIB-EXT-0028") ? "eventScope" : "refused",
    callBindingTime: "programAssembly",
    timerZone: null,
    multiInstanceBinding: selects("CIB-INT-0014") ? "loopReferences" : "dataAssociations",
    effectResultValues: selects("CIB-EXT-0015") ? "activityLocals" : "outputSet",
  };
}

/** The standards reading: no relation selected. */
export const defaultKernelProfileOptions: KernelProfileOptions = kernelProfileOptions([]);
