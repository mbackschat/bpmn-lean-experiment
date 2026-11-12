/**
 * Guard 16's source half for the kernel unit tests (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation,
 * #108): a kernel unit test reaches the TypeScript kernel only through `packages/kernel/test/lean-paired.ts`, which
 * records every case it runs for `packages/differential/test/kernel-unit-pairing.integration-test.ts` to replay against
 * the Lean kernel. Any other test file may import kernel types only; the helper may re-export kernel enums, which carry
 * no behavior, and nothing else. A test that reached the kernel past the helper would check TypeScript behavior Lean
 * never sees.
 */
import { emptyInputFinding, typeScriptEnums, type KernelTree } from "./kernel-guard-scan.ts";

export const pairedHelper = "packages/kernel/test/lean-paired.ts";

/** A module specifier that reaches the TypeScript kernel: the package, or its sources or build by path. */
const kernelSpecifier = String.raw`(?:@bpmn-lean/kernel(?:/[^"']*)?|[^"']*(?:packages/kernel|\.\.)/(?:src|dist)/[^"']*)`;
const staticStatement = new RegExp(String.raw`^[ \t]*(import|export)\b([^;]*?)\bfrom\s*["']${kernelSpecifier}["']`, "gmu");
const dynamicReach = new RegExp(String.raw`\b(?:import|require)\s*\(\s*["']${kernelSpecifier}["']`, "gu");

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** Block and line comments blanked, so a statement quoted in prose is no statement; line numbers stay. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, " ")).replace(/(^|[^:"'])\/\/[^\n]*/gu, "$1");

export function unitPairingFindings(tree: KernelTree): string[] {
  const tests = tree.testFiles.filter(({ file }) => /^packages\/kernel\/test\/[^/]+\.ts$/u.test(file));
  if (tests.length === 0) return [emptyInputFinding(16, "kernel unit test")];
  if (!tests.some(({ file }) => file === pairedHelper)) return [emptyInputFinding(16, pairedHelper)];
  const enums = typeScriptEnums(tree.typeScript);
  const findings: string[] = [];
  for (const { file, text } of tests) {
    const code = withoutComments(text);
    for (const match of code.matchAll(dynamicReach)) {
      findings.push(`G16 ${file}:${lineOf(code, match.index)}: reaches the kernel by a dynamic import`);
    }
    for (const match of code.matchAll(staticStatement)) {
      const [, keyword, clause = ""] = match;
      const at = `G16 ${file}:${lineOf(code, match.index)}`;
      const body = clause.trim();
      if (keyword === "import" && /^type\b/u.test(body)) continue;
      if (file !== pairedHelper) {
        findings.push(`${at}: reaches the TypeScript kernel outside ${pairedHelper}, so Lean never answers its cases`);
        continue;
      }
      if (keyword === "import" && /^\*\s+as\s+\w+$/u.test(body)) continue;
      const names = keyword === "export" ? /^\{([^}]*)\}$/u.exec(body)?.[1] : undefined;
      const exported = names?.split(",").map((name) => name.trim()).filter((name) => name !== "");
      const behavior = exported === undefined ? [body] : exported.filter((name) => !enums.has(name));
      if (behavior.length > 0) findings.push(`${at}: the helper passes on ${behavior.join(", ")}, which is no kernel enum`);
    }
  }
  return findings;
}
