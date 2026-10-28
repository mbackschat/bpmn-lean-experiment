import { leanHeader, type LeanHeader } from "./lean-source-analysis.ts";

type LeanSources = ReadonlyArray<Readonly<{ path: string; source: string }>>;

/** Each scanned module's header, and the scanned modules a module's imports reach transitively. */
function importGraph(sources: LeanSources) {
  const moduleOf = (path: string) => path.replace(/\.lean$/u, "").replaceAll("/", ".");
  const headers: ReadonlyMap<string, LeanHeader> = new Map(sources.map(({ path, source }) => [moduleOf(path), leanHeader(source)] as const));
  const closure = (module: string, seen = new Set<string>()): Set<string> => {
    for (const { module: imported } of headers.get(module)!.imports) {
      if (headers.has(imported) && !seen.has(imported)) closure(imported, seen.add(imported));
    }
    return seen;
  };
  return { headers, closure };
}

/**
 * The modules a library root reaches through imports of any form: the build that target runs. Witness modules
 * that only the conformance root or a driver imports fall outside the semantic library.
 */
export function leanLibraryModules(sources: LeanSources, root: string): Set<string> {
  const { headers, closure } = importGraph(sources);
  return headers.has(root) ? closure(root) : new Set();
}

/**
 * Every module whose build an edit to a module's public interface can invalidate, keyed by that module and
 * sorted by name: the static fanout that [the fanout ratchet](../docs/LEAN-BUILD-MODULARITY-SPEC.md#contract)
 * bounds.
 *
 * Lake rebuilds an importer from the artifacts of everything it loads. A module loads what it imports directly,
 * of any form, and whatever those re-export through `public import`; a private import stops there, which the
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-SPEC.md#mechanism-observations-lean-v4341-2026-10-23)
 * record. An `import all` or `meta import` opens the imported module's private part, so it also loads everything
 * that module loads, private imports included: a private import of the family admission module into the profile
 * registry let an interface edit rebuild the registry's ten `import all` importers (pinned container, 2026-10-26).
 * A plain file loads its whole import closure and re-exports every import, so a hidden-body edit still rebuilds it.
 *
 * This is an upper bound: an importer whose own artifact comes out unchanged stops propagation in Lake, which a
 * graph scan cannot see. Imports of modules outside `sources`, such as Lean core, are ignored.
 */
export function leanFanouts(sources: LeanSources): Map<string, string[]> {
  const { headers, closure } = importGraph(sources);
  const reexports = new Map<string, Set<string>>();
  const reexported = (module: string): Set<string> => {
    const known = reexports.get(module);
    if (known !== undefined) return known;
    const visible = new Set([module]);
    reexports.set(module, visible);
    const header = headers.get(module)!;
    for (const { module: imported, isPublic } of header.imports) {
      if (!headers.has(imported) || !(isPublic || !header.isModule)) continue;
      for (const reached of reexported(imported)) visible.add(reached);
    }
    return visible;
  };
  const loads = new Map<string, Set<string>>();
  const loadedBy = (module: string): Set<string> => {
    const known = loads.get(module);
    if (known !== undefined) return known;
    const header = headers.get(module)!;
    const loaded = header.isModule ? new Set<string>() : closure(module);
    loads.set(module, loaded);
    for (const { module: imported, importsAll, isMeta } of header.imports) {
      if (!headers.has(imported)) continue;
      for (const reached of reexported(imported)) loaded.add(reached);
      if (importsAll) for (const reached of loadedBy(imported)) loaded.add(reached);
      if (isMeta) for (const reached of closure(imported)) loaded.add(reached);
    }
    return loaded;
  };
  const fanouts = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  for (const importer of headers.keys()) {
    const loaded = new Set(loadedBy(importer));
    loaded.delete(importer);
    for (const module of loaded) fanouts.get(module)!.push(importer);
  }
  for (const importers of fanouts.values()) importers.sort();
  return fanouts;
}

/**
 * Every module that an edit to a module's hidden part (a proof, a private declaration or a body that is not
 * exposed) rebuilds, keyed by that module and sorted by name.
 *
 * Only an `import all` importer loads the hidden part, and loading a hidden part also loads the hidden parts
 * it imports with `import all`, so the edit follows every chain of `import all` imports; an importer that does
 * not `import all` the module or a chain member is left alone. A `meta import` loads the compiled form of the
 * imported module's whole import closure, and a plain file loads every module of its import closure whole, so each
 * of them that reaches the module rebuilds too (the
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-SPEC.md#mechanism-observations-lean-v4341-2026-10-23)).
 *
 * An `import all` importer that rewrites with one of the module's hidden definitions (`simp [f]`, `rw [f]` and
 * their siblings, or a named `f.eq_…` lemma) generates that definition's equation lemmas and exports them, so the
 * hidden body becomes part of its public interface and everything loading it rebuilds as well; `unfold f` exports
 * none. A source scan cannot see which rewrites survive elaboration, so every such rewrite counts.
 */
export function leanHiddenEditFanouts(sources: LeanSources): Map<string, string[]> {
  const { headers, closure } = importGraph(sources);
  const interfaceFanouts = leanFanouts(sources);
  const text = new Map(sources.map(({ path, source }) => [path.replace(/\.lean$/u, "").replaceAll("/", "."), source]));
  const hiddenLoaders = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  const plainReach = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  for (const [importer, header] of headers) {
    for (const { module: imported, importsAll, isMeta } of header.imports) {
      if (!headers.has(imported)) continue;
      if (importsAll) hiddenLoaders.get(imported)!.push(importer);
      if (isMeta) for (const reached of [imported, ...closure(imported)]) hiddenLoaders.get(reached)!.push(importer);
    }
    if (!header.isModule) for (const reached of closure(importer)) plainReach.get(reached)!.push(importer);
  }
  return new Map([...headers.keys()].map((module) => {
    const rebuilt = new Set<string>();
    const pending = [module];
    while (pending.length > 0) {
      for (const importer of hiddenLoaders.get(pending.pop()!)!) {
        if (rebuilt.has(importer)) continue;
        rebuilt.add(importer);
        pending.push(importer);
      }
    }
    const hidden = hiddenDefinitions(text.get(module)!);
    for (const importer of [...rebuilt]) {
      if (rewritesWith(text.get(importer)!, hidden)) for (const loader of interfaceFanouts.get(importer)!) rebuilt.add(loader);
    }
    for (const importer of plainReach.get(module)!) rebuilt.add(importer);
    rebuilt.delete(module);
    return [module, [...rebuilt].sort()];
  }));
}

/**
 * The short names of a module's definitions whose bodies importers cannot see: every `def` outside an
 * `@[expose]` section and without its own `@[expose]`. A plain file exposes everything. `recursive` holds those whose
 * own block names them again, because `unfold` of a recursive definition realizes its equation lemmas too.
 */
function hiddenDefinitions(source: string): HiddenDefinitions {
  const names = new Set<string>();
  const recursive = new Set<string>();
  if (!leanHeader(source).isModule) return { names, recursive };
  const lines = source.split("\n");
  for (const { line: index, keyword, name, attributes, inExposedScope } of declarations(source)) {
    if (keyword !== "def" || inExposedScope || exposes(attributes)) continue;
    names.add(name);
    const end = lines.findIndex((next, at) => at > index && /^[^\s|]/u.test(next) && !/^(?:termination_by|decreasing_by)\b/u.test(next));
    const block = lines.slice(index, end === -1 ? lines.length : end).join("\n");
    if ((block.match(nameToken(name)) ?? []).length > 1) recursive.add(name);
  }
  return { names, recursive };
}

type HiddenDefinitions = Readonly<{ names: ReadonlySet<string>; recursive: ReadonlySet<string> }>;

/** A whole-identifier occurrence of a short name, so `f` matches neither `f'`, `f?`, `g.f` nor `f_eq`. */
function nameToken(name: string): RegExp {
  return new RegExp(`(?<![\\w.'?!])${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w'?!])`, "gu");
}

const declarationStart = /^(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|public|noncomputable|partial)\s+)*(?:theorem|lemma|def|abbrev|instance|example|structure|inductive)\b/gmu;

/**
 * Whether `name` is bound inside one declaration: a binder of its signature, or a name a tactic or term introduces.
 * Lean resolves a rewrite argument to such a binder before any global constant. A bracketed group counts as a binder
 * only in the signature or after `fun`, `λ`, `∀` or `∃`, because elsewhere `(f n : T)` is a type ascription of a call.
 */
function boundIn(declaration: string, name: string): boolean {
  if (!/^[\p{L}_][\w'?!]*$/u.test(name)) return false;
  const n = name.replace(/[?!]/gu, "\\$&");
  const word = String.raw`[\p{L}_][\w'?!]*`;
  const token = String.raw`(?<![\w.'])${n}(?![\w'?!])`;
  const binderGroup = String.raw`[({⦃\[]\s*(?:${word}\s+)*${n}(?:\s+${word})*\s*:(?!=)`;
  return topLevelGroups(signatureOf(declaration)).some((group) => new RegExp(`^${binderGroup}`, "u").test(group)) || [
    String.raw`(?:\bfun|λ|∀|∃)\s+(?:[^,=⟨\n]*?\s)?${binderGroup}`,
    // The names before `:`, `:=` or `←`; in `let result ← f x` only `result` is bound.
    String.raw`\b(?:have|let|fun|∀|∃)\s+(?:[^:=←\n]*\s)?${token}`,
    // A binder list may continue on lines that hold nothing but names.
    String.raw`\b(?:intro|intros|rename_i|obtain|rcases|rintro|next|case)\b(?:[^\n;:=]|\n(?=[ \t]+[\w'?! \t]+\n))*?${token}`,
    String.raw`\b(?:cases|generalize|by_cases|induction|match)\s+${n}\s*:`,
    String.raw`\|\s+\.?[\w.]+(?:\s+${word})*\s+${n}(?:\s+${word})*\s*=>`,
    String.raw`\bwith\s+${n}\b`,
    String.raw`(?:\b(?:with|obtain|rintro|fun)\s*)⟨[^⟩]*${token}[^⟩]*⟩`,
    String.raw`⟨[^⟩]*${token}[^⟩]*⟩\s*(?::=|:)`,
  ].some((pattern) => new RegExp(pattern, "u").test(declaration));
}

/** The bracketed groups that open at depth 0 of a signature: its binders, never an ascription nested inside one. */
function topLevelGroups(signature: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < signature.length; at += 1) {
    const char = signature[at]!;
    if ("([{⦃⟨".includes(char)) {
      if (depth === 0) start = at;
      depth += 1;
    } else if (")]}⦄⟩".includes(char)) {
      depth -= 1;
      if (depth === 0) groups.push(signature.slice(start, at + 1));
    }
  }
  return groups;
}

/** A declaration's text before its top-level type colon or `:=`: the part that holds its binders. */
function signatureOf(declaration: string): string {
  let depth = 0;
  for (let at = 0; at < declaration.length; at += 1) {
    const char = declaration[at]!;
    if ("([{⦃⟨".includes(char)) depth += 1;
    else if (")]}⦄⟩".includes(char)) depth -= 1;
    else if (char === ":" && depth === 0) return declaration.slice(0, at);
  }
  return declaration;
}

/**
 * Every bracketed argument list that follows a word or a closing parenthesis, with its top-level elements: the
 * argument lists of `simp`, `rw`, `grind` and every sibling, whatever the tactic's name and wherever the list starts.
 * A list after `@` or `#` is an attribute or an array literal. Term-level lists applied to a function count too, which
 * only over-approximates.
 */
function argumentLists(source: string): Array<Readonly<{ index: number; elements: string[] }>> {
  const lists: Array<Readonly<{ index: number; elements: string[] }>> = [];
  for (let at = source.indexOf("["); at !== -1; at = source.indexOf("[", at + 1)) {
    if ("@#".includes(source[at - 1] ?? "")) continue;
    const before = /(\S)\s*$/u.exec(source.slice(Math.max(0, at - 200), at))?.[1];
    if (before === undefined || !/[\w'?!)]/u.test(before)) continue;
    const elements: string[] = [];
    let depth = 0;
    let start = at + 1;
    let close = at + 1;
    for (; close < source.length; close += 1) {
      const char = source[close]!;
      if ("([{⦃⟨".includes(char)) depth += 1;
      else if (")}⦄⟩".includes(char)) depth -= 1;
      else if (char === "]") {
        if (depth === 0) break;
        depth -= 1;
      } else if (char === "," && depth === 0) {
        elements.push(source.slice(start, close));
        start = close + 1;
      }
    }
    elements.push(source.slice(start, close));
    lists.push({ index: at, elements });
  }
  return lists;
}

/** Whether a source rewrites with any of `hidden` through a tactic that generates equation lemmas. */
function rewritesWith(source: string, hidden: HiddenDefinitions): boolean {
  return hiddenRewriteSites(source, hidden).length > 0;
}

/**
 * The name each rewrite with a hidden definition uses, once per occurrence: an element of an argument list, a local
 * `simp` attribute, a named `f.eq_…` or functional-induction lemma, or an `unfold` of a recursive one.
 */
function hiddenRewriteSites(text: string, { names, recursive }: HiddenDefinitions): string[] {
  if (names.size === 0) return [];
  const source = withoutComments(text);
  let declarations_: number[] | undefined;
  const enclosing = (at: number) => {
    declarations_ ??= [...source.matchAll(declarationStart)].map(({ index }) => index);
    const begin = declarations_.findLast((start) => start <= at) ?? 0;
    return source.slice(begin, declarations_.find((start) => start > at) ?? source.length);
  };
  // `(f ·)` and `@f` name `f` itself: simp unfolds a cdot alias (Lean/Elab/Tactic/Simp.lean:235).
  const head = (element: string) => /^[\s←↓↑=<\-(@]*([\p{L}_][\w'.?!]*)/u.exec(element)?.[1];
  const arguments_ = argumentLists(source).flatMap(({ index, elements }) => elements.flatMap((element) => {
    const argument = head(element);
    return argument !== undefined && names.has(argument.split(".").at(-1)!) && !boundIn(enclosing(index), argument.split(".")[0]!)
      ? [argument.split(".").at(-1)!] : [];
  }));
  const attributed = [...source.matchAll(/^attribute\s*\[[^\]]*\bsimp\b[^\]]*\]([^\n]*)/gmu)]
    .flatMap(([, list]) => list!.trim().split(/\s+/u).map((name) => name.split(".").at(-1)!));
  // Functional induction principles are realized on demand like equation lemmas, so they count as well.
  const lemmas = [...source.matchAll(/([A-Za-z0-9_'?!]+)\.(?:eq_(?:\d+|def|unfold)|induct|fun_cases)\b/gu)].map(([, name]) => name!);
  const induction = [...source.matchAll(/\bfun_(?:induction|cases)\s+([^\s;)]+)/gu)].map(([, name]) => name!.split(".").at(-1)!);
  const unfolded = [...source.matchAll(/\bunfold\b([^\n;)]*)/gu)]
    .flatMap(([, list]) => list!.split(/\s+at\s+/u)[0]!.trim().split(/\s+/u).map((name) => name.split(".").at(-1)!))
    .filter((name) => recursive.has(name));
  return [...arguments_, ...attributed, ...lemmas, ...induction, ...unfolded].filter((name) => names.has(name));
}

/**
 * Every rewrite with a hidden definition of a module imported with `import all`, as `Module.definition` per
 * occurrence and keyed by the rewriting module, which item 2 of
 * [the build modularity specification](../docs/LEAN-BUILD-MODULARITY-SPEC.md#contract) forbids: each one
 * exports the definition's equation lemmas, so a body edit changes the rewriting module's public interface.
 */
export function leanHiddenRewrites(sources: LeanSources): Map<string, string[]> {
  const { headers } = importGraph(sources);
  const text = new Map(sources.map(({ path, source }) => [path.replace(/\.lean$/u, "").replaceAll("/", "."), source]));
  const hidden = new Map([...headers.keys()].map((module) => [module, hiddenDefinitions(text.get(module)!)]));
  const rewrites = new Map<string, string[]>();
  for (const [importer, header] of headers) {
    const sites = header.imports.filter(({ module, importsAll }) => importsAll && headers.has(module))
      .flatMap(({ module }) => hiddenRewriteSites(text.get(importer)!, hidden.get(module)!).map((name) => `${module}.${name}`));
    rewrites.set(importer, sites.sort());
  }
  return rewrites;
}

/**
 * Every module that an edit to one of a module's hidden definition bodies rebuilds, keyed by that module and sorted by
 * name: the cost the [build modularity specification](../docs/LEAN-BUILD-MODULARITY-SPEC.md#problem) set out to bound.
 *
 * A body in an `@[expose]` section is part of the public interface, so in a module with such a section every body
 * edit rebuilds the whole interface fanout; otherwise a body edit rebuilds only the hidden-edit fanout. One
 * `@[expose] public section` therefore turns every body edit of a module into an interface edit: a body edit to
 * `NestedScopeData` rebuilt exactly the 61 modules of its public cone that one target loads, as this model predicts
 * (pinned container, 2026-10-27). A definition exposed on its own is an interface edit by necessity and is named by
 * {@link leanExposedDefinitions} instead.
 */
export function leanBodyEditFanouts(sources: LeanSources): Map<string, string[]> {
  const interfaceFanouts = leanFanouts(sources);
  const hiddenFanouts = leanHiddenEditFanouts(sources);
  return new Map(sources.map(({ path, source }) => {
    const module = path.replace(/\.lean$/u, "").replaceAll("/", ".");
    const hidden = hiddenFanouts.get(module)!;
    if (!exposedSectionDefinitions(source)) return [module, hidden];
    return [module, [...new Set([...interfaceFanouts.get(module)!, ...hidden])].sort()];
  }));
}

/**
 * The definitions each module exposes individually, keyed by module: an `@[expose]` definition, an `abbrev`, and an
 * `instance`, whose body Lean exposes unless its type is a proposition (Lean/Elab/MutualDef.lean:1349), so counting
 * every instance over-approximates. Each one's body edit rebuilds the module's whole interface fanout, so a wide
 * module names every such definition in a reviewed allowance.
 */
export function leanExposedDefinitions(sources: LeanSources): Map<string, string[]> {
  return new Map(sources.map(({ path, source }) => {
    const names = leanHeader(source).isModule ? declarations(source).filter(({ attributes, keyword, isPrivate, inExposedScope }) =>
      !isPrivate && !inExposedScope && (keyword !== "def" || exposes(attributes))).map(({ name }) => name) : [];
    return [path.replace(/\.lean$/u, "").replaceAll("/", "."), names.sort()];
  }));
}

/** Whether a module exposes a body through a section: a non-private definition inside an `@[expose]` section, or a plain file. */
function exposedSectionDefinitions(source: string): boolean {
  return !leanHeader(source).isModule || declarations(source).some(({ isPrivate, inExposedScope }) => !isPrivate && inExposedScope);
}

type Declaration = Readonly<{ line: number; keyword: string; name: string; attributes: string; isPrivate: boolean;
  inExposedScope: boolean }>;

const sectionHeader = /^(@\[expose\]\s+)?(?:public\s+)?(?:noncomputable\s+)?(?:meta\s+)?section(?:\s+(\S+))?\s*$/u;
const sectionCommand = /^(?:@\[[^\]]*\]\s*|(?:public|private|protected|noncomputable|meta)\s+)*section\b/u;
const modifier = String.raw`(?:private|protected|noncomputable|partial|public|unsafe|nonrec|meta)`;
const declarationLine = new RegExp(String.raw`^((?:@\[[^\]]*\]\s*)*)((?:${modifier}\s+)*)(def|instance|abbrev)\b\s*(.*)$`, "u");
/** Attributes and modifiers with nothing after them yet, so the declaration or section continues on the next line. */
const declarationPrefix = new RegExp(String.raw`^(?:@\[[^\]]*\]\s*)+(?:${modifier}\s*)*$|^(?:${modifier}\s*)+$`, "u");
/** Whether an attribute list opened on this line is still unclosed. */
const openAttribute = (line: string) => /@\[[^\]]*$/u.test(line);
const exposes = (attributes: string) => /(?<![\w])expose\b/u.test(attributes);

/**
 * Every `def`, `instance` and `abbrev` with its attributes, including attributes and modifiers on the lines above its
 * keyword, and whether an enclosing `@[expose]` scope covers it. Indentation is ignored, because an indented command is
 * still a command.
 *
 * Scopes follow Lean v4.34.1: a section header is `@[expose]? public? noncomputable? meta? section name?`
 * (Lean/Parser/Command.lean:308), every `section`, `namespace` and `mutual` scope inherits its parent's attributes,
 * a dotted name opens and `end name` closes one scope per component (Lean/Elab/BuiltinCommand.lean:45-70). A line that
 * starts a section command outside that grammar throws, so a new spelling fails closed instead of reading as hidden.
 */
function declarations(source: string): Declaration[] {
  source = withoutComments(source);
  const exposed: boolean[] = [false];
  const open = (count: number, expose: boolean) => {
    for (let at = 0; at < count; at += 1) exposed.push(exposed.at(-1)! || expose);
  };
  const found: Declaration[] = [];
  // Attributes and modifiers that precede their keyword on earlier lines, joined until the declaration or section.
  let pending = "";
  for (const [index, raw] of source.split("\n").entries()) {
    if (raw.trim() === "") continue;
    const line = pending === "" ? raw.trim() : `${pending} ${raw.trim()}`;
    if (openAttribute(line) || declarationPrefix.test(line)) {
      pending = line;
      continue;
    }
    pending = "";
    const section = sectionHeader.exec(line);
    const namespace = /^namespace\s+(\S+)\s*$/u.exec(line);
    const end = /^end(?:\s+(\S+))?\s*$/u.exec(line);
    if (section !== null) open(section[2]?.split(".").length ?? 1, section[1] !== undefined);
    else if (sectionCommand.test(line)) throw new Error(`unrecognized section header: ${line}`);
    else if (namespace !== null) open(namespace[1]!.split(".").length, false);
    else if (/^mutual\s*$/u.test(line)) open(1, false);
    else if (end !== null) exposed.splice(Math.max(1, exposed.length - (end[1]?.split(".").length ?? 1)));
    const declaration = declarationLine.exec(line);
    if (declaration !== null) {
      const [, attributes = "", modifiers, keyword, rest] = declaration;
      found.push({ line: index, keyword: keyword!, name: declarationName(keyword!, rest!), attributes,
        isPrivate: /\bprivate\b/u.test(modifiers!), inExposedScope: exposed.at(-1)! });
    }
  }
  return found;
}

/** The source with every comment blanked out, keeping each line break so line indices still hold; block comments nest. */
function withoutComments(source: string): string {
  let depth = 0;
  let result = "";
  for (let at = 0; at < source.length; at += 1) {
    if (source.startsWith("/-", at)) {
      depth += 1;
      result += "  ";
      at += 1;
    } else if (depth > 0 && source.startsWith("-/", at)) {
      depth -= 1;
      result += "  ";
      at += 1;
    } else if (depth === 0 && source.startsWith("--", at)) {
      const end = source.indexOf("\n", at);
      result += " ".repeat((end === -1 ? source.length : end) - at);
      at = (end === -1 ? source.length : end) - 1;
    } else {
      result += depth > 0 && source[at] !== "\n" ? " " : source[at];
    }
  }
  return result;
}

/** A definition's short name; an anonymous instance is named by its class, as `instance : Repr Unit`. */
function declarationName(keyword: string, rest: string): string {
  const named = /^([^\s:(\[{]+)/u.exec(rest)?.[1];
  if (named !== undefined) return keyword === "instance" ? named : named.split(".").at(-1)!;
  return `instance : ${rest.replace(/^(?:\([^)]*\)\s*)?:\s*/u, "").replace(/\s*(?::=|where)[\s\S]*$/u, "").trim()}`;
}

/**
 * A module allowed more importers than the default, at most `bound`; the list only shrinks. A bound above a base
 * commit's states in `raised` why it rose and in `raisedFrom` the bound it rose from, as {@link unexplainedBoundRises}
 * requires.
 */
export type LeanFanoutBound = Readonly<{ module: string; bound: number; raised?: string; raisedFrom?: number }>;

/** The definitions each wide module may expose individually; `raised` states why names joined since a base commit. */
export type LeanExposureAllowance = Readonly<Record<string, Readonly<{ names: ReadonlyArray<string>; raised?: string }>>>;

/**
 * The entries of `current` that rise above a base commit's bounds without a stated reason: a higher bound, or a new
 * entry above the base's default, whose `raised` is blank or whose `raisedFrom` is missing.
 */
export function unexplainedBoundRises(previous: ReadonlyArray<LeanFanoutBound>, current: ReadonlyArray<LeanFanoutBound>,
  previousDefault: number): string[] {
  const before = new Map(previous.map(({ module, bound }) => [module, bound]));
  const recorded = (module: string) => before.get(module) ?? previousDefault;
  return current.filter(({ module, bound, raised, raisedFrom }) => bound > recorded(module) && (!raised?.trim() || raisedFrom === undefined))
    .map(({ module, bound }) => `${module}: bound ${bound} exceeds the base's ${recorded(module)} without a stated reason and the bound it rose from`);
}

/**
 * The modules whose stated reason explains no rise: their bound has fallen back to `raisedFrom`, or the reason never
 * recorded where it rose from.
 */
export function needlessRaises(current: ReadonlyArray<LeanFanoutBound>): string[] {
  return current.filter(({ bound, raised, raisedFrom }) => raised !== undefined && (raisedFrom === undefined || bound <= raisedFrom))
    .map(({ module }) => module);
}

/**
 * The entries of `current` that break a debt record against a base commit: one the base records as risen whose
 * reason or starting bound is gone while its bound still exceeds that start, or a new rise whose `raisedFrom` is not
 * the base's bound.
 */
export function brokenDebtRecords(previous: ReadonlyArray<LeanFanoutBound>, current: ReadonlyArray<LeanFanoutBound>,
  previousDefault: number): string[] {
  const before = new Map(previous.map((entry) => [entry.module, entry]));
  return current.flatMap(({ module, bound, raised, raisedFrom }) => {
    const base = before.get(module);
    if (base?.raised !== undefined && base.raisedFrom !== undefined && bound > base.raisedFrom
      && (raisedFrom !== base.raisedFrom || !raised?.trim())) {
      return [`${module}: drops the record of its rise from ${base.raisedFrom} while its bound stays at ${bound}`];
    }
    const recorded = base?.bound ?? previousDefault;
    return bound > recorded && raisedFrom !== undefined && raisedFrom !== recorded
      ? [`${module}: records a rise from ${raisedFrom}, but the base's bound is ${recorded}`] : [];
  });
}

/** The allowance entries that admit a name a base commit's allowance lacked, without a stated reason. */
export function unexplainedAllowanceRises(previous: LeanExposureAllowance, current: LeanExposureAllowance): string[] {
  return Object.entries(current).flatMap(([module, { names, raised }]) => {
    const before = new Set(previous[module]?.names ?? []);
    const added = names.filter((name) => !before.has(name));
    return added.length > 0 && !raised?.trim() ? [`${module}: allows ${added.join(", ")} beyond the base without a stated reason`] : [];
  });
}

/**
 * The `import all` and `meta import` lines of the given sources: each opens the imported module's hidden part, so each
 * widens what a body edit of that module rebuilds.
 */
export function leanOpeningImportLines(sources: LeanSources): number {
  return sources.reduce((total, { source }) =>
    total + leanHeader(source).imports.filter(({ importsAll, isMeta }) => importsAll || isMeta).length, 0);
}

/**
 * The ratchet's findings: a recorded module above its bound, a recorded module that the default already covers
 * (its entry must go, so the list only shrinks), a recorded name that is no scanned module, and an unlisted module
 * above the default. Recorded findings come in list order, unlisted ones after them in fanout order.
 *
 * A `kernel` module is exempt, as item 6 of the build modularity specification declares: every module imports
 * the kernel types, so their fanout grows with the library by design. A kernel module carrying a bound, or a
 * kernel name that is no scanned module, is reported after the bounds' findings.
 */
export function leanFanoutViolations(fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  bounds: ReadonlyArray<LeanFanoutBound>, defaultBound: number, kernel: ReadonlyArray<string> = [],
  unit = "importers"): string[] {
  const exempt = new Set(kernel);
  const recorded = new Set([...bounds.map(({ module }) => module), ...kernel]);
  const listed = bounds.flatMap(({ module, bound }) => {
    const count = fanouts.get(module)?.length;
    if (exempt.has(module)) return [`${module}: a kernel module needs no recorded bound`];
    if (count === undefined) return [`${module}: recorded but not a scanned module`];
    if (count > bound) return [`${module}: ${count} ${unit} exceed its recorded bound ${bound}`];
    if (count <= defaultBound) return [`${module}: ${count} ${unit} fit the default bound ${defaultBound}, so its entry must go`];
    return [];
  });
  const unlisted = [...fanouts].filter(([module, importers]) => !recorded.has(module) && importers.length > defaultBound)
    .map(([module, importers]) => `${module}: ${importers.length} ${unit} exceed the default bound ${defaultBound} without a recorded bound`);
  const kernelFindings = kernel.filter((module) => !fanouts.has(module))
    .map((module) => `${module}: declared kernel but not a scanned module`);
  return [...listed, ...kernelFindings, ...unlisted];
}
