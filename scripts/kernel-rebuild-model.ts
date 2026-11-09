/**
 * The static rebuild-set model of guard 15 over both languages' import graphs
 * (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation): a feature or admission edit rebuilds only the
 * cone the proposal's module table states, and only `IL.Types`, `State` and `Hooks` have more than five direct
 * importers. It builds its own graph because `kernel-structure.ts` classifies only the executable layers and the model
 * must also see `Laws` and `Proofs`.
 *
 * Also guard 9's report of shape-file edits per branch: no record file exists, and a commit scoped `kernel-shape` is the
 * accepted form of a shape edit.
 */
import { emptyInputFinding, normalizeSegment, type KernelTree, type Source } from "./kernel-guard-scan.ts";
import { commitScope, type Commit } from "./kernel-guards-dispatch.ts";

export type ImportGraph = ReadonlyMap<string, readonly string[]>;

const kernelPrefix = "packages/kernel/src/";

/** Lean module name to the kernel modules it imports. */
export function leanImportGraph(sources: readonly Source[]): ImportGraph {
  return new Map(sources.map((source) => [
    source.file.replace(/\.lean$/u, "").split("/").join("."),
    [...source.text.matchAll(/^(?:public |meta )*import (?:all )?(Kernel[\w.]*)/gmu)].map((match) => match[1] ?? ""),
  ]));
}

function resolveTypeScript(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const segments = from.split("/").slice(0, -1);
  for (const part of specifier.replace(/\.js$/u, "").split("/")) {
    if (part === "..") segments.pop();
    else if (part !== ".") segments.push(part);
  }
  return segments.join("/");
}

/** TypeScript module path (`feature/work`) to the kernel modules it imports or re-exports. */
export function typeScriptImportGraph(sources: readonly Source[]): ImportGraph {
  return new Map(sources.map((source) => {
    const module = source.file.slice(kernelPrefix.length).replace(/\.ts$/u, "");
    const { tokens } = source;
    const imports = new Set<string>();
    tokens.forEach((token, index) => {
      const next = tokens[index + 1];
      if (token.text === "from" && next?.kind === "string") {
        const resolved = resolveTypeScript(module, next.text);
        if (resolved !== null) imports.add(resolved);
      }
    });
    return [module, [...imports]];
  }));
}

function reverse(graph: ImportGraph): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  for (const [module, imports] of graph) {
    for (const imported of imports) {
      if (!importers.has(imported)) importers.set(imported, new Set());
      importers.get(imported)?.add(module);
    }
  }
  return importers;
}

function reverseClosure(importers: ReadonlyMap<string, ReadonlySet<string>>, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const module = queue.pop() ?? "";
    for (const importer of importers.get(module) ?? []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  return seen;
}

export type Language = Readonly<{
  label: string;
  /** A module's `[layer, family]` when it is a feature or admission module, `null` otherwise. */
  family: (module: string) => readonly ["feature" | "admission", string] | null;
  /** May an edit of `family`'s module rebuild `module`? */
  inCone: (layer: "feature" | "admission", family: string, module: string, graph: ImportGraph) => boolean;
  /** The modules allowed above five direct importers. */
  hubs: ReadonlySet<string>;
  /** Generated aggregators: an import of one costs nothing, so it does not count as an importer. */
  aggregators: ReadonlySet<string>;
}>;

const leanLanguage: Language = {
  label: "Lean",
  family: (module) => {
    const match = /^Kernel\.(Feature|Admission)\.([^.]+)/u.exec(module);
    return match === null ? null : [match[1] === "Feature" ? "feature" : "admission", match[2] ?? ""];
  },
  inCone: (layer, family, module, graph) => {
    const own = layer === "feature" ? `Kernel.Feature.${family}` : `Kernel.Admission.${family}`;
    if (module === own || module.startsWith(`${own}.`) || module === "Kernel.Run" || module === "Kernel") return true;
    if (layer === "admission") return module === "Kernel.AdmissionRegistry";
    if (module === "Kernel.Registry" || module === `Kernel.Laws.${family}`) return true;
    return module.startsWith("Kernel.Proofs.") && (graph.get(module) ?? []).includes(`Kernel.Laws.${family}`);
  },
  hubs: new Set(["Kernel.IL.Types", "Kernel.State", "Kernel.Hooks"]),
  aggregators: new Set(["Kernel"]),
};

const typeScriptLanguage: Language = {
  label: "TypeScript",
  family: (module) => {
    const match = /^(feature|admission)\/([^/]+)/u.exec(module);
    return match === null ? null : [match[1] === "feature" ? "feature" : "admission", normalizeSegment(match[2] ?? "")];
  },
  inCone: (layer, family, module) => {
    const candidate = /^(feature|admission)\/([^/]+)/u.exec(module);
    if (candidate !== null && candidate[1] === layer && normalizeSegment(candidate[2] ?? "") === family) return true;
    if (module === "run" || module === "index") return true;
    return layer === "feature" ? module === "registry" : module === "admission-registry";
  },
  hubs: new Set(["il/types", "state", "hooks"]),
  aggregators: new Set(["index"]),
};

/** Guard 15: one language's feature and admission cones and its fan-in ceiling. */
export function rebuildModelFindings(graph: ImportGraph, language: Language): string[] {
  const features = [...graph.keys()].filter((module) => language.family(module) !== null);
  if (graph.size === 0 || features.length === 0) return [emptyInputFinding(15, `${language.label} feature or admission modules`)];
  const importers = reverse(graph);
  const findings: string[] = [];
  for (const module of features.sort()) {
    const family = language.family(module);
    if (family === null) continue;
    for (const rebuilt of [...reverseClosure(importers, module)].sort()) {
      if (rebuilt !== module && !language.inCone(family[0], family[1], rebuilt, graph)) {
        findings.push(`G15 ${language.label}: editing ${module} rebuilds ${rebuilt}, outside its cone`);
      }
    }
  }
  for (const [module, direct] of [...importers].sort(([left], [right]) => (left < right ? -1 : 1))) {
    const count = [...direct].filter((importer) => !language.aggregators.has(importer)).length;
    if (count > 5 && !language.hubs.has(module)) findings.push(`G15 ${language.label}: ${module} has ${count} direct importers, above 5; only the three hubs may`);
  }
  return findings;
}

export function rebuildFindings(tree: KernelTree): string[] {
  return [
    ...rebuildModelFindings(leanImportGraph(tree.lean), leanLanguage),
    ...rebuildModelFindings(typeScriptImportGraph(tree.typeScript), typeScriptLanguage),
  ];
}

export { leanLanguage, typeScriptLanguage };

const shapeFiles = new Set([
  "Kernel/IL/Types.lean", "Kernel/State.lean", "Kernel/Hooks.lean",
  "packages/kernel/src/il/types.ts", "packages/kernel/src/state.ts", "packages/kernel/src/hooks.ts",
]);

/** The submodules each shape file re-exports are shape files too. */
const shapeDirectories = ["Kernel/IL/Types/", "Kernel/State/", "packages/kernel/src/il/types/", "packages/kernel/src/state/"];

function isShapeFile(file: string): boolean {
  return shapeFiles.has(file) || shapeDirectories.some((directory) => file.startsWith(directory));
}

/** Guard 9's report: the commits on a branch that edit a shape file, marked accepted when scoped `kernel-shape`. */
export function shapeEditReport(commits: readonly Commit[]): string[] {
  const edits = commits.filter((commit) => commit.files.some(isShapeFile));
  const lines = edits.map((commit) => {
    const accepted = commitScope(commit.subject) === "kernel-shape" ? "accepted" : "NOT scoped kernel-shape";
    return `shape edit ${commit.sha.slice(0, 8)} [${accepted}]: ${commit.subject}`;
  });
  return [`shape edits on this branch: ${edits.length}`, ...lines];
}
