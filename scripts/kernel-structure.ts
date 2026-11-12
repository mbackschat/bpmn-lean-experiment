/**
 * Source scans for the structural guards of the kernel rewrite proposal
 * (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation): layering (guard 4), the shape and size
 * ceilings (guards 9 and 10), the feature file limit and profiles as data (guard 7), over the Lean kernel and its TypeScript transcription.
 * Closed dispatch and no catch-all (guards 1 and 2) read the built environment instead (`kernel-dispatch.lean`).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A kernel module by layer: Lean modules use dotted names under `Kernel`, TypeScript files the same layering. */
export const Layer = {
  Il: "il",
  Codec: "codec",
  State: "state",
  Hooks: "hooks",
  Feature: "feature",
  Admission: "admission",
  Dispatch: "dispatch",
  Registry: "registry",
  AdmissionRegistry: "admissionRegistry",
  Run: "run",
  Laws: "laws",
  Root: "root",
} as const;

export type Layer = typeof Layer[keyof typeof Layer];

export type Module = Readonly<{ name: string; layer: Layer; family: string; file: string; imports: readonly string[] }>;

/** Which layers a layer may import; a feature, admission or dispatch module may also import its own family's modules,
 * so a family splits into paired parts instead of outgrowing the size target, and the runner its own parts. A `Laws`
 * module may also import the feature or dispatch family it states laws for; no executable layer imports `Laws`. */
const mayImport: Readonly<Record<Layer, readonly Layer[]>> = {
  [Layer.Il]: [Layer.Il],
  [Layer.Codec]: [Layer.Il, Layer.State, Layer.Codec],
  [Layer.State]: [Layer.Il, Layer.State],
  [Layer.Hooks]: [Layer.Il, Layer.State],
  [Layer.Feature]: [Layer.Il, Layer.State, Layer.Hooks],
  [Layer.Admission]: [Layer.Il],
  [Layer.Dispatch]: [Layer.Il, Layer.State, Layer.Hooks],
  [Layer.Registry]: [Layer.Il, Layer.State, Layer.Hooks, Layer.Feature],
  [Layer.AdmissionRegistry]: [Layer.Il, Layer.Admission],
  [Layer.Run]: [Layer.Il, Layer.Codec, Layer.State, Layer.Hooks, Layer.Dispatch, Layer.Registry, Layer.AdmissionRegistry, Layer.Run],
  [Layer.Laws]: [Layer.Il, Layer.State, Layer.Hooks, Layer.Laws],
  [Layer.Root]: Object.values(Layer),
};

/** Only these layers may import outside the kernel: Lean's JSON in the codec and the runner's IO. */
const foreignImports: ReadonlySet<Layer> = new Set([Layer.Codec, Layer.Run]);

/** `[layer, family]` of a path segment list under `Kernel/` or `packages/kernel/src/`, normalized to kebab-free
 * lower case so that `Feature/Work.lean` and `feature/work.ts` classify alike. */
export function classify(segments: readonly string[]): readonly [Layer, string] {
  const [head = "", second = ""] = segments.map((segment) => segment.replace(/[-_]/gu, "").toLowerCase());
  switch (head) {
    case "il": return second === "codec" ? [Layer.Codec, ""] : [Layer.Il, ""];
    case "state": return [Layer.State, ""];
    case "hooks": return [Layer.Hooks, ""];
    case "feature": return [Layer.Feature, second];
    case "admission": return [Layer.Admission, second];
    case "step":
    case "publish":
    case "host":
    case "population": return [Layer.Dispatch, head];
    case "registry": return [Layer.Registry, ""];
    case "admissionregistry": return [Layer.AdmissionRegistry, ""];
    case "run": return [Layer.Run, ""];
    case "laws": return [Layer.Laws, second];
    case "index":
    case "kernel": return [Layer.Root, ""];
    default: throw new Error(`unclassified kernel module: ${segments.join("/")}`);
  }
}

function files(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(full, extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

export function leanModules(root = projectRoot): Module[] {
  const kernel = path.join(root, "Kernel");
  const modules = [path.join(root, "Kernel.lean"), ...files(kernel, ".lean")];
  return modules.map((file) => {
    const relative = path.relative(root, file).slice(0, -".lean".length);
    const segments = relative === "Kernel" ? ["kernel"] : relative.split(path.sep).slice(1);
    const [layer, family] = classify(segments);
    const imports = [...readFileSync(file, "utf8").matchAll(/^(?:public |meta )*import (?:all )?([\w.]+)/gmu)]
      .map((match) => match[1] ?? "");
    return { name: relative.split(path.sep).join("."), layer, family, file: path.relative(root, file), imports };
  });
}

export function typeScriptModules(root = projectRoot): Module[] {
  const source = path.join(root, "packages", "kernel", "src");
  return files(source, ".ts").map((file) => {
    const relative = path.relative(source, file).slice(0, -".ts".length);
    const [layer, family] = classify(relative.split(path.sep));
    const imports = [...readFileSync(file, "utf8").matchAll(/^(?:import|export)\b[^;]*?from "([^"]+)"/gmsu)]
      .map((match) => match[1] ?? "")
      .map((specifier) => specifier.startsWith(".")
        ? path.relative(source, path.resolve(path.dirname(file), specifier)).replace(/\.js$/u, "")
        : specifier);
    return { name: relative, layer, family, file: path.relative(root, file), imports };
  });
}

/** Guard 4: every import follows the layer table, features, admissions and dispatch modules import no other family
 * (population may import step), only the codec and the runner reach outside the kernel, no executable module imports
 * `Laws`, and the TypeScript kernel has no laws layer. */
export function layeringFindings(modules: readonly Module[], isKernel: (name: string) => boolean): string[] {
  const byName = new Map(modules.map((module) => [module.name, module]));
  // Laws are Lean-only: the TypeScript kernel transcribes the executable modules, and only the generated Lean root,
  // which nothing executable imports, may import a Laws module.
  const isLean = (module: Module): boolean => module.file.endsWith(".lean");
  const importFindings = (module: Module, imported: string): string[] => {
    const target = byName.get(imported);
    if (target === undefined) {
      if (isKernel(imported)) return [`${module.file}: imports unknown kernel module ${imported}`];
      return foreignImports.has(module.layer) || module.layer === Layer.Root ? [] : [`${module.file}: imports ${imported} outside the kernel`];
    }
    const sameFamily = target.layer === module.layer && target.family === module.family &&
      (module.layer === Layer.Feature || module.layer === Layer.Admission || module.layer === Layer.Dispatch);
    // The population layer drives each instance through the one step function (proposal, module table and guard 13).
    const populationSteps = module.layer === Layer.Dispatch && module.family === "population" &&
      target.layer === Layer.Dispatch && target.family === "step";
    // `Kernel.Laws.<F>` states the rules of the feature or dispatch family `F` (proposal, module table).
    const ownLaws = module.layer === Layer.Laws && target.family === module.family &&
      (target.layer === Layer.Feature || target.layer === Layer.Dispatch);
    const typeScriptRootLaws = module.layer === Layer.Root && target.layer === Layer.Laws && !isLean(module);
    if (!typeScriptRootLaws && (sameFamily || populationSteps || ownLaws || mayImport[module.layer].includes(target.layer))) return [];
    return [`${module.file}: ${module.layer} module imports ${target.layer} module ${imported}`];
  };
  return modules.flatMap((module) => [
    ...(module.layer === Layer.Laws && !isLean(module) ? [`${module.file}: the TypeScript kernel has no laws layer`] : []),
    ...module.imports.flatMap((imported) => importFindings(module, imported)),
  ]);
}

/**
 * The architecture's feature limit (docs/kernel/ARCHITECTURE-SPEC.md "Modules and build shape"): one feature's rules
 * span at most three files in each language. A larger feature becomes sub-features, each a feature of its own that the
 * others reach through their own hooks records, which `Kernel.Registry` fills.
 */
export function featureFileFindings(modules: readonly Module[]): string[] {
  const counts = new Map<string, string[]>();
  for (const module of modules) {
    if (module.layer !== Layer.Feature) continue;
    counts.set(module.family, [...(counts.get(module.family) ?? []), module.file]);
  }
  if (counts.size === 0) return ["feature file limit: read no feature modules"];
  return [...counts].filter(([, files]) => files.length > 3)
    .map(([family, files]) => `feature ${family}: ${files.length} files, above three (${[...files].sort().join(", ")})`);
}

/** Guards 9 and 10: a file above 1,200 nonblank lines, `Step` above 600, `import all` outside `Laws`, `export *`. */
export function shapeFindings(root = projectRoot): string[] {
  const scanned = [
    path.join(root, "Kernel.lean"),
    ...files(path.join(root, "Kernel"), ".lean"),
    ...files(path.join(root, "packages", "kernel", "src"), ".ts"),
    ...files(path.join(root, "packages", "bpmn-source", "src"), ".ts"),
  ];
  return scanned.flatMap((file) => {
    const relative = path.relative(root, file);
    const source = readFileSync(file, "utf8");
    const nonblank = source.split("\n").filter((line) => line.trim() !== "").length;
    const findings: string[] = [];
    if (nonblank > 1200) findings.push(`${relative}: ${nonblank} nonblank lines, above 1,200`);
    if ((relative === path.join("Kernel", "Step.lean") || relative.endsWith(path.join("kernel", "src", "step.ts"))) && nonblank > 600) {
      findings.push(`${relative}: ${nonblank} nonblank lines, above Step's 600`);
    }
    if (/^(?:public )?import all /mu.test(source) && !relative.startsWith(path.join("Kernel", "Laws"))) {
      findings.push(`${relative}: import all outside Laws`);
    }
    if (/^export \* from/mu.test(source) && relative.startsWith(path.join("packages", "kernel"))) {
      findings.push(`${relative}: export *`);
    }
    return findings;
  });
}

/** A module path normalized for pairing: lower case, separators kept, dashes and underscores dropped. */
function pairKey(segments: readonly string[]): string {
  return segments.map((segment) => segment.replace(/[-_]/gu, "").toLowerCase()).join("/");
}

/** Guard 8: every Lean executable module has a TypeScript file of the same normalized path, and the reverse. The
 * generated Lean root and the TypeScript export index have no pair; `Laws` and `Proofs` are not executable. */
export function pairingFindings(root = projectRoot): string[] {
  const lean = new Set(files(path.join(root, "Kernel"), ".lean")
    .map((file) => path.relative(path.join(root, "Kernel"), file).slice(0, -".lean".length).split(path.sep))
    .filter((segments) => segments[0] !== "Laws" && segments[0] !== "Proofs")
    .map(pairKey));
  const typeScript = new Set(files(path.join(root, "packages", "kernel", "src"), ".ts")
    .map((file) => path.relative(path.join(root, "packages", "kernel", "src"), file).slice(0, -".ts".length).split(path.sep))
    .filter((segments) => !(segments.length === 1 && segments[0] === "index"))
    .map(pairKey));
  return [
    ...[...lean].filter((key) => !typeScript.has(key)).map((key) => `Lean module without a TypeScript pair: ${key}`),
    ...[...typeScript].filter((key) => !lean.has(key)).map((key) => `TypeScript module without a Lean pair: ${key}`),
  ].sort();
}

/** Guard 5: every feature module `Kernel/Feature/<F>.lean` has its declarative `Kernel/Laws/<F>.lean`, written with the
 * feature (docs/kernel/ARCHITECTURE-SPEC.md#risks); a feature's sub-modules share its one Laws module. */
export function lawsFindings(root = projectRoot): string[] {
  const directory = (name: string): string[] => {
    try {
      return readdirSync(path.join(root, "Kernel", name)).filter((file) => file.endsWith(".lean")).map((file) => file.slice(0, -".lean".length));
    } catch {
      return [];
    }
  };
  const features = directory("Feature");
  if (features.length === 0) return ["read no Kernel/Feature module; a renamed directory must not empty the guard's input"];
  const laws = new Set(directory("Laws"));
  return features.filter((feature) => !laws.has(feature)).sort().map((feature) => `Kernel/Feature/${feature}.lean has no Kernel/Laws/${feature}.lean`);
}

/** `Admission/Flow` and `Feature/Flow` to `flow`: the two halves of one family, which name a construct's admission
 * check and its execution alike. */
function admissionOrFeatureFamily(relative: string): string | null {
  const match = /^(?:Kernel\/|packages\/kernel\/src\/)(?:Admission|admission|Feature|feature)\/([^/.]+)/u.exec(relative);
  return match?.[1] === undefined ? null : match[1].replace(/[-_]/gu, "").toLowerCase();
}

/** Guard 8's name clause: one rule, one place, so a definition's short name appears once per language package. Lean
 * executable modules (`Laws` and `Proofs` excluded), the TypeScript kernel and `bpmn-source` are scanned apart; the
 * one exemption is a name both halves of one family define, and only those two. */
export function duplicateNameFindings(root = projectRoot): string[] {
  const typeScriptDefinition = /^(?:export )?(?:(?:async )?function\*? ?([A-Za-z0-9_$]+)|const ([A-Za-z0-9_$]+)(?:: [^=]+)? = (?:async )?(?:\([^)]*\)|[A-Za-z0-9_$]+)(?:: [^=]+)? =>)/u;
  const packages: readonly (readonly [string, string, RegExp])[] = [
    ["Kernel", ".lean", /^(?:@\[[^\]]*\]\s*)?(?:private |protected )?(?:noncomputable )?(?:partial )?(?:def|abbrev) ([^\s(:]+)/u],
    // A top-level `function` or a top-level `const` bound to an arrow function: both are helper definitions.
    [path.join("packages", "kernel", "src"), ".ts", typeScriptDefinition],
    [path.join("packages", "bpmn-source", "src"), ".ts", typeScriptDefinition],
  ];
  return packages.flatMap(([directory, extension, definition]) => {
    const owners = new Map<string, Set<string>>();
    for (const file of files(path.join(root, directory), extension)) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (/^Kernel\/(?:Laws|Proofs)\//u.test(relative)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = definition.exec(line);
        const name = (match?.[1] ?? match?.[2])?.split(".").at(-1);
        if (name !== undefined && name !== "") owners.set(name, (owners.get(name) ?? new Set()).add(relative));
      }
    }
    return [...owners].flatMap(([name, modules]) => {
      if (modules.size < 2) return [];
      const families = [...modules].map(admissionOrFeatureFamily);
      if (modules.size === 2 && families[0] !== null && families[0] === families[1]) return [];
      return [`${name} is defined in ${[...modules].sort().join(", ")}`];
    });
  }).sort();
}

/** Guard 7: no profile identifier literal in the kernel; profiles are data the catalog owns. */
export function profileLiteralFindings(root = projectRoot): string[] {
  const scanned = [...files(path.join(root, "Kernel"), ".lean"), ...files(path.join(root, "packages", "kernel", "src"), ".ts")];
  return scanned.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/["'`](bpmn-2\.0\.2-[a-z0-9-]+|cib[a-z0-9-]*-profile[a-z0-9-]*)["'`]/gu)]
      .map((match) => `${path.relative(root, file)}: profile identifier ${match[1]}`);
  });
}
