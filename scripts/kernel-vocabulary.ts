/**
 * The kernel vocabulary, `contracts/schemas/vocabulary.schema.json`, generated from the Lean kernel's declarations
 * (the authority; the TypeScript kernel transcribes them): the constructor names of the kernel enumerations a contract
 * names, the enumerated profile decision points, and every admission and reader refusal code.
 *
 * Usage: `node scripts/kernel-vocabulary.ts --write` rewrites the schema; `--check` exits 1 when the committed file
 * differs. `scripts/kernel-vocabulary.test.ts` runs the check in the fast suite, so the file is never edited by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { leanDeclarations, leanInductives, loadTree, TokenKind, type KernelTree, type Source } from "./kernel-guard-scan.ts";
import { admissionCodes, codecCodes, readerCodes } from "./kernel-guards-refusal.ts";

export const vocabularyPath = "contracts/schemas/vocabulary.schema.json";

/** Each enumeration: its vocabulary name, the Lean file declaring it and the inductive. */
export const enumerations: ReadonlyArray<readonly [string, string, string]> = [
  ["elementKind", "Kernel/IL/Types.lean", "Element"],
  ["eventRole", "Kernel/IL/Types.lean", "EventRole"],
  ["workKind", "Kernel/IL/Types.lean", "Work"],
  ["trigger", "Kernel/IL/Types.lean", "Trigger"],
  ["throw", "Kernel/IL/Types.lean", "Throw"],
  ["gatewayKind", "Kernel/IL/Types.lean", "GatewayKind"],
  ["scopeKind", "Kernel/IL/Types.lean", "ScopeKind"],
  ["inputKind", "Kernel/State/Input.lean", "Input"],
  ["startTrigger", "Kernel/State/Input.lean", "StartTrigger"],
  ["deliveryTrigger", "Kernel/State/Input.lean", "DeliveryTrigger"],
  ["criterionTarget", "Kernel/State/Input.lean", "CriterionTarget"],
  ["commandAction", "Kernel/State/Input.lean", "CommandAction"],
  ["effectOutcome", "Kernel/State/Input.lean", "EffectOutcome"],
  ["waitKind", "Kernel/State/Wait.lean", "OpenKind"],
  ["instanceStatus", "Kernel/State.lean", "InstanceStatus"],
  ["failure", "Kernel/State.lean", "Failure"],
  ["scopeRole", "Kernel/Publish.lean", "ScopeRole"],
];

const optionsFile = "Kernel/IL/Types/Options.lean";
const optionsStructure = "ProfileOptions";

function leanSource(tree: KernelTree, file: string): Source {
  const source = tree.lean.find((candidate) => candidate.file === file);
  if (source === undefined) throw new Error(`vocabulary: ${file} is not a kernel source`);
  return source;
}

function constructors(tree: KernelTree, file: string, inductive: string): string[] {
  const found = leanInductives(leanSource(tree, file)).get(inductive);
  if (found === undefined || found.length === 0) throw new Error(`vocabulary: no inductive ${inductive} in ${file}`);
  return found.map((constructor) => constructor.name);
}

/** `ProfileOptions` fields typed by an inductive of the options file, each with that inductive's constructors. */
function profileOptions(tree: KernelTree): Array<readonly [string, string[]]> {
  const source = leanSource(tree, optionsFile);
  const inductives = leanInductives(source);
  const structure = leanDeclarations(source.tokens).find((declaration) => declaration.name === optionsStructure);
  if (structure === undefined) throw new Error(`vocabulary: no structure ${optionsStructure} in ${optionsFile}`);
  const fields: Array<readonly [string, string[]]> = [];
  for (let i = structure.tokenStart; i + 2 < structure.tokenEnd; i += 1) {
    const [name, colon, type] = [source.tokens[i], source.tokens[i + 1], source.tokens[i + 2]];
    if (name?.kind !== TokenKind.Word || colon?.text !== ":" || type === undefined) continue;
    const options = inductives.get(type.text);
    if (options !== undefined) fields.push([name.text, options.map((option) => option.name)]);
  }
  if (fields.length === 0) throw new Error(`vocabulary: ${optionsStructure} has no enumerated field`);
  return fields;
}

/** Every admission refusal code, `Kernel.AdmissionRegistry`'s own included, every reader refusal code and every
strict-decoding code. */
function refusalCodes(tree: KernelTree): string[] {
  const registry = (file: string): boolean =>
    file === "Kernel/AdmissionRegistry.lean" || file === "packages/kernel/src/admission-registry.ts";
  const codes = [...admissionCodes(tree), ...admissionCodes(tree, registry), ...readerCodes(tree), ...codecCodes(tree)]
    .map(({ code }) => code);
  return [...new Set(codes)].sort();
}

const enumSchema = (values: readonly string[]) => ({ enum: [...values] });

export function vocabularySchema(tree: KernelTree): unknown {
  const defs: Record<string, unknown> = {};
  for (const [name, file, inductive] of enumerations) defs[name] = enumSchema(constructors(tree, file, inductive));
  defs["outcome"] = enumSchema(["committed", ...constructors(tree, "Kernel/State.lean", "Failure")]);
  defs["profileOptions"] = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(profileOptions(tree).map(([field, values]) => [field, enumSchema(values)])),
  };
  defs["refusalCode"] = enumSchema(refusalCodes(tree));
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://bpmn-lean.local/schemas/vocabulary.schema.json",
    title: "BPMN Lean kernel vocabulary",
    description: "Generated by scripts/kernel-vocabulary.ts from the Lean kernel's declarations; never edited by hand.",
    $defs: defs,
  };
}

export function renderVocabulary(tree: KernelTree): string {
  return `${JSON.stringify(vocabularySchema(tree), null, 2)}\n`;
}

if (import.meta.main) {
  const tree = loadTree();
  const target = path.join(tree.root, vocabularyPath);
  const rendered = renderVocabulary(tree);
  const mode = process.argv[2];
  if (mode === "--write") {
    writeFileSync(target, rendered);
  } else if (mode === "--check") {
    if (readFileSync(target, "utf8") !== rendered) {
      console.error(`${vocabularyPath} differs from the generator; run node scripts/kernel-vocabulary.ts --write`);
      process.exit(1);
    }
  } else {
    console.error("usage: node scripts/kernel-vocabulary.ts --write|--check");
    process.exit(64);
  }
}
