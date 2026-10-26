import { analyzeLeanSource, leanDeclarationPrefix, leanHeader } from "./lean-source-analysis.ts";

/** One unqualified use whose current-namespace resolution hides a declaration reached through an `open`. */
export type LeanNameShadowing = Readonly<{
  path: string;
  line: number;
  name: string;
  resolved: ReadonlyArray<string>;
  hidden: ReadonlyArray<string>;
}>;

type Declaration = Readonly<{ path: string; qualified: string; isPrivate: boolean }>;
type Scope = { namespaces: string[]; opened: string[] };

const commandPattern = new RegExp(
  `^[\\t ]*(${leanDeclarationPrefix()})(namespace|section|end|open|def|abbrev|theorem|lemma|inductive|structure|instance|class|opaque)(?:[\\t ]+([^\\s:({\\[⟨]+))?(?=[\\t \\r\\n:({\\[]|$)`,
  "gmu");
const identifier = /(?<![\p{L}\p{N}_'.?!])[\p{L}_][\p{L}\p{N}_'?!]*(?![\p{L}\p{N}_'?!]|\.[\p{L}_])/gu;

const prefixesOf = (namespaces: ReadonlyArray<string>): string[] => {
  const parts = namespaces.join(".").split(".").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("."));
};

/** The opened namespaces of an `open` line; `scoped`, `hiding`, `renaming` and explicit-name forms open none. */
function openedNamespaces(line: string): string[] {
  const names = /^[\t ]*open[\t ]+([A-Za-z_][A-Za-z0-9_'.?]*(?:[\t ]+[A-Za-z_][A-Za-z0-9_'.?]*)*)[\t ]*(?:in)?[\t ]*$/u
    .exec(line)?.[1]?.split(/[\t ]+/u).filter((name) => name !== "in");
  return names === undefined || names.some((name) => ["scoped", "hiding", "renaming"].includes(name)) ? [] : names;
}

/**
 * Finds every unqualified identifier that Lean resolves through the current namespace while a different
 * declaration of the same short name is reachable through an `open` in force.
 *
 * Lean v4.34.1 `ResolveName.resolveGlobalName` (`src/lean/Lean/ResolveName.lean`) returns the current
 * namespace's matches and consults `open` declarations only when there are none, so such a use is never
 * ambiguous: adding or publishing the namespace declaration silently changes what an existing use means.
 * The module conversion made private helpers public, which is exactly that edit
 * ([module rules](../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules)).
 *
 * A namespace declaration of the same file is the author's own deliberate choice and is not reported.
 *
 * This is a masked text scan, not elaboration. A declaration is visible when it is in the same file, in a module
 * imported with `import all` (which also opens its private declarations), or non-private in the transitive
 * import closure; `protected` declarations need a qualifier and are skipped.
 * Local binders are not modelled, so a binder sharing a declaration's short name is reported too.
 */
export function leanNameShadowings(sources: ReadonlyArray<{ path: string; source: string }>): LeanNameShadowing[] {
  const moduleOf = (path: string) => path.replace(/\.lean$/u, "").replaceAll("/", ".");
  const imports = new Map<string, string[]>();
  const importsAll = new Map<string, Set<string>>();
  const declarations = new Map<string, Declaration[]>();
  const shortNames = new Map<string, Declaration[]>();
  const scanned = sources.map(({ path, source }) => {
    const header = leanHeader(source).imports;
    imports.set(moduleOf(path), header.map(({ module }) => module));
    importsAll.set(moduleOf(path), new Set(header.filter((item) => item.importsAll).map(({ module }) => module)));
    const code = analyzeLeanSource(source).code;
    const scopes: Scope[] = [];
    let scope: Scope = { namespaces: [], opened: [] };
    const segments: Array<{ start: number; end: number; scope: Scope }> = [];
    const commands = [...code.matchAll(commandPattern)];
    commands.forEach((command, index) => {
      const [, modifiers = "", kind, name] = command;
      const end = commands[index + 1]?.index ?? code.length;
      switch (kind) {
        case "namespace":
        case "section":
          scopes.push({ namespaces: [...scope.namespaces], opened: [...scope.opened] });
          if (kind === "namespace" && name !== undefined) scope.namespaces.push(name);
          return;
        case "end":
          scope = scopes.pop() ?? { namespaces: [], opened: [] };
          return;
        case "open": {
          const lineEnd = code.indexOf("\n", command.index);
          scope.opened.push(...openedNamespaces(code.slice(command.index, lineEnd < 0 ? code.length : lineEnd)));
          return;
        }
        default: {
          segments.push({ start: command.index, end, scope: { namespaces: [...scope.namespaces], opened: [...scope.opened] } });
          if (name === undefined || /\bprotected\b/u.test(modifiers)) return;
          const bare = name.replace(/^_root_\./u, "");
          const qualified = name.startsWith("_root_.") ? bare : [...scope.namespaces, bare].join(".");
          const declaration = { path, qualified, isPrivate: /\bprivate\b/u.test(modifiers) };
          declarations.set(qualified, [...(declarations.get(qualified) ?? []), declaration]);
          const short = qualified.slice(qualified.lastIndexOf(".") + 1);
          shortNames.set(short, [...(shortNames.get(short) ?? []), declaration]);
        }
      }
    });
    return { path, code, segments };
  });
  const closures = new Map<string, Set<string>>();
  const closureOf = (module: string): Set<string> => {
    const known = closures.get(module);
    if (known !== undefined) return known;
    const closure = new Set<string>();
    closures.set(module, closure);
    for (const imported of imports.get(module) ?? []) {
      closure.add(imported);
      for (const transitive of closureOf(imported)) closure.add(transitive);
    }
    return closure;
  };
  return scanned.flatMap(({ path, code, segments }) => {
    const closure = closureOf(moduleOf(path));
    const opened = importsAll.get(moduleOf(path)) ?? new Set<string>();
    const visible = (qualified: string) => (declarations.get(qualified) ?? []).some((declaration) =>
      declaration.path === path || opened.has(moduleOf(declaration.path)) ||
      (!declaration.isPrivate && closure.has(moduleOf(declaration.path))));
    const reported = new Set<string>();
    return segments.flatMap(({ start, end, scope }) => {
      const namespaces = prefixesOf(scope.namespaces);
      const openedPrefixes = scope.opened.flatMap((opened) => [opened, ...namespaces.map((prefix) => `${prefix}.${opened}`)]);
      return [...code.slice(start, end).matchAll(identifier)].flatMap((match) => {
        const name = match[0];
        if (!shortNames.has(name)) return [];
        const resolved = namespaces.map((prefix) => `${prefix}.${name}`).filter(visible);
        if (!resolved.some((qualified) => declarations.get(qualified)!.some((declaration) => declaration.path !== path))) return [];
        const hidden = [...new Set(openedPrefixes.map((prefix) => `${prefix}.${name}`))]
          .filter((candidate) => visible(candidate) && !resolved.includes(candidate));
        const key = `${name}:${resolved.join(",")}`;
        if (hidden.length === 0 || reported.has(key)) return [];
        reported.add(key);
        return [{ path, line: code.slice(0, start + match.index).split("\n").length, name, resolved, hidden }];
      });
    });
  });
}
