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
export const mapping = (target: string, source: KernelJson): KernelJson => ({ target, source });
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

/** The kernel IL's `ProfileOptions`: profile behaviour as typed data, selected by the profile's relations. */
export type KernelProfileOptions = Readonly<{
  submissionInstallsVariables: boolean;
  incidentProcessCancellation: boolean;
  scopeChainSubmissionBytes: number | null;
}>;

export const defaultKernelProfileOptions: KernelProfileOptions = {
  submissionInstallsVariables: true,
  incidentProcessCancellation: false,
  scopeChainSubmissionBytes: null,
};

/** One portable value's allowance, which bounds a scope-chain submission (`NSD-TASK-01`). */
const portableValueAllowanceBytes = 16_384;

/**
 * The kernel options a profile selects, derived from its CIB relation identifiers
 * ([register](../../../../docs/CIB-BPMN-RELATION-REGISTER.md)), never from its identity: a User Task completion
 * installs its submitted values as variables (`CIB-EXT-0005`), an effect incident offers the cancellation of its
 * root process (`CIB-OP-0009`), and a submission may name only scope-chain locals within one value allowance
 * (`CIB-EXT-0020`).
 */
export function kernelProfileOptions(relations: readonly string[]): KernelProfileOptions {
  return {
    submissionInstallsVariables: relations.includes("CIB-EXT-0005"),
    incidentProcessCancellation: relations.includes("CIB-OP-0009"),
    scopeChainSubmissionBytes: relations.includes("CIB-EXT-0020") ? portableValueAllowanceBytes : null,
  };
}
