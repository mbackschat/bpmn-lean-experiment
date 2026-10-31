import { leanHeader, type LeanHeader } from "./lean-source-analysis.ts";

type LeanSources = ReadonlyArray<Readonly<{ path: string; source: string }>>;

/**
 * A module whose public `.olean` carries lemmas Lean generated for a hidden definition of `ownerModule`, as the
 * olean-level check `scripts/lean-realized-leaks.lean` records them in `scripts/lean-realized-leaks.tsv`.
 */
export type RealizedLeak = Readonly<{ module: string; ownerModule: string }>;

/** The recorded leaks of a `scripts/lean-realized-leaks.tsv` text: `<module>\t<owner module>\t<owner>` per line. */
export function parseRealizedLeaks(text: string): RealizedLeak[] {
  return text.split("\n").filter((line) => line !== "").map((line) => {
    const [module, ownerModule, owner] = line.split("\t");
    if (owner === undefined) throw new Error(`a recorded leak needs three tab-separated fields: ${line}`);
    return { module: module!, ownerModule: ownerModule! };
  });
}

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
  // What a module's public import trace covers: itself, what its public imports re-export and, for an exported
  // `meta import`, that import's whole closure, which Lake mixes into the trace (Lake v4.34.1 Build/Module.lean:366-374).
  const reexports = new Map<string, Set<string>>();
  const reexported = (module: string): Set<string> => {
    const known = reexports.get(module);
    if (known !== undefined) return known;
    const visible = new Set([module]);
    reexports.set(module, visible);
    const header = headers.get(module)!;
    for (const { module: imported, isPublic, isMeta } of header.imports) {
      if (!headers.has(imported) || !(isPublic || !header.isModule)) continue;
      for (const reached of reexported(imported)) visible.add(reached);
      if (isPublic && isMeta) for (const reached of closure(imported)) visible.add(reached);
    }
    return visible;
  };
  return { headers, closure, reexported };
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
 * sorted by name: the static fanout that [the fanout ratchet](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#contract)
 * bounds.
 *
 * Lake rebuilds an importer from the artifacts of everything it loads. A module loads what it imports directly,
 * of any form, and whatever those re-export through `public import`; a private import stops there, which the
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#mechanism-observations-lean-v4341-2026-10-23)
 * record. An `import all` or `meta import` opens the imported module's private part, so it also loads everything
 * that module loads, private imports included: a private import of the family admission module into the profile
 * registry let an interface edit rebuild the registry's ten `import all` importers (pinned container, 2026-10-26).
 * A `public meta import` re-exports that whole closure as well, so its importer's loaders load it too.
 * A plain file loads its whole import closure and re-exports every import, so a hidden-body edit still rebuilds it.
 *
 * This is an upper bound: an importer whose own artifact comes out unchanged stops propagation in Lake, which a
 * graph scan cannot see. Imports of modules outside `sources`, such as Lean core, are ignored.
 */
export function leanFanouts(sources: LeanSources): Map<string, string[]> {
  const { headers, closure, reexported } = importGraph(sources);
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
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#mechanism-observations-lean-v4341-2026-10-23)).
 * A `public meta import` carries that compiled closure into the re-exporting module's public trace, so every module
 * loading the re-exporter rebuilds as well (the depth probe's row 5, pinned container, 2026-10-30).
 *
 * An `import all` importer that rewrites with one of the module's hidden definitions (`simp [f]`, `rw [f]` and
 * their siblings, or a named `f.eq_…` lemma) generates that definition's equation lemmas and exports them, so the
 * hidden body becomes part of its public interface and everything loading it rebuilds as well; `unfold f` exports
 * none. The module rewriting with its own hidden definition exports them the same way. A source scan cannot see which
 * rewrites survive elaboration, so every such rewrite counts, unless the rewriting module declares the definition's
 * equation lemmas privately first.
 *
 * Lean also exports the other lemmas it generates for a hidden body (a `match`'s equations, splitter and congruence
 * equations, a sparse case split's `else_eq`), private ones included (Lean v4.34.1 `Environment.lean:723`). A source
 * scan cannot see which proofs generate them, so `leaks` brings in what the built `.olean` files show: a rebuilt
 * module recorded as leaking the edited module's lemmas rebuilds its whole public cone as well.
 */
export function leanHiddenEditFanouts(sources: LeanSources, leaks: ReadonlyArray<RealizedLeak> = []): Map<string, string[]> {
  const { headers, closure, reexported } = importGraph(sources);
  const interfaceFanouts = leanFanouts(sources);
  const text = new Map(sources.map(({ path, source }) => [path.replace(/\.lean$/u, "").replaceAll("/", "."), source]));
  const candidates = rewriteCandidateCache();
  const leaking = new Map<string, Set<string>>();
  for (const { module, ownerModule } of leaks) leaking.set(ownerModule, (leaking.get(ownerModule) ?? new Set()).add(module));
  const hiddenLoaders = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  const plainReach = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  const compiledReexports = new Map<string, Set<string>>();
  const compiledReexported = (module: string): Set<string> => {
    const known = compiledReexports.get(module);
    if (known !== undefined) return known;
    const compiled = new Set<string>();
    for (const reexporter of reexported(module)) {
      for (const { module: imported, isPublic, isMeta } of headers.get(reexporter)!.imports) {
        if (isPublic && isMeta && headers.has(imported)) for (const reached of [imported, ...closure(imported)]) compiled.add(reached);
      }
    }
    compiledReexports.set(module, compiled);
    return compiled;
  };
  for (const [importer, header] of headers) {
    for (const { module: imported, importsAll, isMeta } of header.imports) {
      if (!headers.has(imported)) continue;
      if (importsAll) hiddenLoaders.get(imported)!.push(importer);
      if (isMeta) for (const reached of [imported, ...closure(imported)]) hiddenLoaders.get(reached)!.push(importer);
      for (const reached of compiledReexported(imported)) hiddenLoaders.get(reached)!.push(importer);
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
    for (const importer of [module, ...rebuilt]) {
      if (rewritesWith(candidates(text.get(importer)!), hidden) || leaking.get(module)?.has(importer)) {
        for (const loader of interfaceFanouts.get(importer)!) rebuilt.add(loader);
      }
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
  const definitions = new Map<string, HiddenDefinition[]>();
  if (!leanHeader(source).isModule) return { names, recursive, definitions };
  const lines = source.split("\n");
  for (const declaration of leanDeclarations(source)) {
    if (bodyExported(declaration)) continue;
    const { line: index, name, qualifiedName, attributes } = declaration;
    names.add(name);
    definitions.set(name, [...definitions.get(name) ?? [], { qualifiedName, reducible: /(?<![\w])reducible\b/u.test(attributes) }]);
    const end = lines.findIndex((next, at) => at > index && /^[^\s|]/u.test(next) && !/^(?:termination_by|decreasing_by)\b/u.test(next));
    const block = lines.slice(index, end === -1 ? lines.length : end).join("\n");
    if ((block.match(nameToken(name)) ?? []).length > 1) recursive.add(name);
  }
  return { names, recursive, definitions };
}

type HiddenDefinition = Readonly<{ qualifiedName: string; reducible: boolean }>;

/** `definitions` maps each short name to the hidden definitions carrying it. */
type HiddenDefinitions = Readonly<{ names: ReadonlySet<string>; recursive: ReadonlySet<string>;
  definitions: ReadonlyMap<string, ReadonlyArray<HiddenDefinition>> }>;

/**
 * The full names of the definitions whose equation lemmas a module declares as ordinary private declarations with
 * `privateEquations` (BpmnSemantics/PrivateEquationLemmas.lean): each listed name appended to the call's scope, as the
 * helper appends them. Lean reuses a lemma already present under its expected name (Lean/Meta/Eqns.lean:225), so a
 * later rewrite realizes and exports none, and the helper fails when a rewrite realized one before the call.
 */
function privatelyDeclaredEquations(source: string): Set<string> {
  const declared = new Set<string>();
  for (const [, scope, list] of source.matchAll(/\bprivateEquations\s+`([^\s#]+)\s+#\[([^\]]*)\]/gu)) {
    for (const name of list!.split(",")) declared.add(`${scope}.${name.trim().replace(/^`/u, "")}`);
  }
  return declared;
}

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
 * A tactic whose lemma list realizes the equation lemmas of a definition it names, with what may stand between it and
 * the list: `?` or `!`, then `+option` flags, parenthesized configuration or discharger and `only` in Lean's order
 * (`Init/Tactics.lean:685`) or any other, then occurrence numbers. `dsimp` is absent: it only marks a named definition
 * to unfold (`Lean/Elab/Tactic/Simp.lean:281-282`).
 */
const rewritingTactic = new RegExp(String.raw`(?<![\w.'])(simp|simp_all|simpa|simp_arith|rw|rwa|rewrite|erw|rw_mod_cast|`
  + String.raw`nth_rewrite|nth_rw|push_cast|norm_cast|norm_num|field_simp|grind)[?!]?`
  + String.raw`(?:\s+only|\s+[+-][\w.]+|\s*\((?:[^()]|\([^()]*\))*\))*(?:\s+\d+)*\s*$`, "u");

/**
 * Every bracketed argument list of a rewriting tactic, with its top-level elements: the lemma lists of `simp`, `rw`,
 * `grind` and their siblings, wherever the list starts. A list a term applies a function to, such as
 * `withHandlers [a, b]`, realizes nothing; counting those reported 450 sites in the converted tree where the leak oracle
 * found 3 leaking definitions (2026-10-29).
 */
function argumentLists(source: string): Array<Readonly<{ index: number; tactic: string; elements: string[] }>> {
  const lists: Array<Readonly<{ index: number; tactic: string; elements: string[] }>> = [];
  for (let at = source.indexOf("["); at !== -1; at = source.indexOf("[", at + 1)) {
    const tactic = rewritingTactic.exec(source.slice(Math.max(0, at - 200), at))?.[1];
    if (tactic === undefined) continue;
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
    lists.push({ index: at, tactic, elements });
  }
  return lists;
}

/** Whether a source's candidates rewrite with any of `hidden` through a tactic that generates equation lemmas. */
function rewritesWith(candidates: RewriteCandidates, hidden: HiddenDefinitions): boolean {
  return hiddenRewriteSites(candidates, hidden).length > 0;
}

/**
 * What a source writes that may realize equation lemmas, whichever module's hidden definitions it turns out to name:
 * each written name with whether `simp` or a sibling wrote it and whether its enclosing declaration binds it, in
 * source order, then each named equation lemma's definition with its suffix, then the `unfold` and induction names. `bound` is asked only of a name that denotes a hidden
 * definition and answered once, because {@link boundIn} compiles its patterns per call.
 */
type RewriteCandidates = Readonly<{ declared: ReadonlySet<string>; prefixes: ReadonlyArray<string>;
  realizing: ReadonlyArray<Readonly<{ written: string; bySimp: boolean; bound: () => boolean }>>;
  lemmas: ReadonlyArray<Readonly<{ written: string; suffix: string }>>;
  unfolded: ReadonlyArray<string>; induction: ReadonlyArray<string> }>;

/**
 * {@link rewriteCandidates} cached by source text for one fan-out computation, which filters an importer's candidates
 * once per module it opens: extracting them again per module took 255 s for the hidden-edit fan-outs of the converted
 * tree (2026-10-29).
 */
function rewriteCandidateCache(): (text: string) => RewriteCandidates {
  const cache = new Map<string, RewriteCandidates>();
  return (text) => {
    const cached = cache.get(text) ?? rewriteCandidates(text);
    cache.set(text, cached);
    return cached;
  };
}

// A dotted name starts only after a character that cannot continue one, so a scan does not restart inside each name.
const equationLemma = /(?<![A-Za-z0-9_'?!.])((?:[A-Za-z0-9_'?!]+\.)*[A-Za-z0-9_'?!]+)\.(eq_(?:\d+|def|unfold))\b/gu;
const inductionPrinciple = /(?<![A-Za-z0-9_'?!.])((?:[A-Za-z0-9_'?!]+\.)*[A-Za-z0-9_'?!]+)\.(?:induct|fun_cases)\b/gu;

/** The {@link RewriteCandidates} of one source. */
function rewriteCandidates(text: string): RewriteCandidates {
  const source = withoutComments(text);
  let declarations_: number[] | undefined;
  const enclosing = (at: number) => {
    declarations_ ??= [...source.matchAll(declarationStart)].map(({ index }) => index);
    const begin = declarations_.findLast((start) => start <= at) ?? 0;
    return source.slice(begin, declarations_.find((start) => start > at) ?? source.length);
  };
  // `(f ·)` and `@f` name `f` itself: simp unfolds a cdot alias (Lean/Elab/Tactic/Simp.lean:235).
  const head = (element: string) => /^[\s←↓↑=<\-(@]*([\p{L}_][\w'.?!]*)/u.exec(element)?.[1];
  const unbound = () => false;
  const arguments_ = argumentLists(source).flatMap(({ index, tactic, elements }) => elements.flatMap((element) => {
    const written = head(element);
    if (written === undefined) return [];
    let bound: boolean | undefined;
    return [{ written, bySimp: !rewritesRegardless.has(tactic),
      bound: () => bound ??= boundIn(enclosing(index), written.split(".")[0]!) }];
  }));
  const attributed = [...source.matchAll(/^attribute\s*\[[^\]]*\bsimp\b[^\]]*\]([^\n]*)/gmu)]
    .flatMap(([, list]) => list!.trim().split(/\s+/u)).map((written) => ({ written, bySimp: true, bound: unbound }));
  const lemmas = [...source.matchAll(equationLemma)].map(([, written, suffix]) => ({ written: written!, suffix: suffix! }));
  return {
    declared: privatelyDeclaredEquations(source),
    prefixes: resolutionPrefixes(source),
    realizing: [...arguments_, ...attributed],
    lemmas,
    unfolded: [...source.matchAll(/\bunfold\b([^\n;)]*)/gu)].flatMap(([, list]) => list!.split(/\s+at\s+/u)[0]!.trim().split(/\s+/u)),
    // Functional induction principles are realized on demand like equation lemmas, so they count as well.
    induction: [
      ...[...source.matchAll(inductionPrinciple)].map(([, name]) => name!),
      ...[...source.matchAll(/\bfun_(?:induction|cases)\s+([^\s;)]+)/gu)].map(([, name]) => name!),
    ],
  };
}

/**
 * The name each rewrite with a hidden definition uses, once per occurrence: an element of an argument list, a local
 * `simp` attribute, a named `f.eq_…` or functional-induction lemma, or an `unfold` of a recursive one. A definition
 * whose equation lemmas the source declares privately is a site only through a lemma `privateEquations` does not
 * declare: its functional induction principle, its `eq_unfold`, and its `eq_def` unless it is recursive (Lean v4.34.1
 * Meta/Eqns.lean:307-312).
 */
function hiddenRewriteSites({ declared, prefixes, realizing, lemmas, unfolded, induction }: RewriteCandidates,
  { names, recursive, definitions }: HiddenDefinitions): string[] {
  if (names.size === 0) return [];
  // The definitions a written name can denote: those it resolves to under one of the source's namespaces.
  const denoted = (written: string) => {
    const rooted = written.startsWith("_root_.");
    const path = written.replace(/^_root_\./u, "");
    return (definitions.get(path.split(".").at(-1)!) ?? [])
      .filter(({ qualifiedName }) => qualifiedName === path || (!rooted && prefixes.some((prefix) => qualifiedName === `${prefix}.${path}`)));
  };
  // A site realizes lemmas when one denoted definition lacks privately declared ones; `simp` and its siblings unfold
  // a reducible definition without them (Lean/Meta/Tactic/Simp/SimpTheorems.lean:534).
  const realizes = (written: string, bySimp: boolean) => denoted(written)
    .some(({ qualifiedName, reducible }) => !declared.has(qualifiedName) && !(bySimp && reducible));
  return [
    ...realizing.filter(({ written, bySimp, bound }) => realizes(written, bySimp) && !bound()).map(({ written }) => written),
    ...lemmas.filter(({ written, suffix }) => /^eq_\d+$/u.test(suffix) || (suffix === "eq_def" && recursive.has(written.split(".").at(-1)!))
      ? realizes(written, false) : denoted(written).length > 0).map(({ written }) => written),
    ...unfolded.filter((name) => recursive.has(name.split(".").at(-1)!) && realizes(name, false)),
    ...induction.filter((name) => denoted(name).length > 0),
  ].map((name) => name.split(".").at(-1)!);
}

/**
 * The namespaces a source resolves a written name against, ignoring where each applies so that it never yields too
 * few: every enclosing namespace and its prefixes, the namespace of every declaration's own name, every opened
 * namespace, and every opened namespace inside an enclosing one.
 */
function resolutionPrefixes(source: string): string[] {
  const enclosing = new Set<string>();
  const scopes: string[] = [];
  const opened: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    const namespace = /^namespace\s+(\S+)/u.exec(line);
    const section = /^(?:@\[[^\]]*\]\s*)?(?:(?:public|noncomputable|meta)\s+)*section(?:\s+(\S+))?\s*$/u.exec(line);
    const end = /^end(?:\s+(\S+))?\s*$/u.exec(line);
    if (namespace !== null) scopes.push(...namespace[1]!.split("."));
    else if (section !== null) scopes.push(...(section[1]?.split(".") ?? [""]).map(() => ""));
    else if (end !== null) scopes.splice(Math.max(0, scopes.length - (end[1]?.split(".").length ?? 1)));
    const path = scopes.filter((component) => component !== "");
    for (let length = 1; length <= path.length; length += 1) enclosing.add(path.slice(0, length).join("."));
    const open = /^open\s+(.*?)(?:\s+in)?$/u.exec(line);
    if (open !== null) opened.push(...open[1]!.replace(/\([^)]*\)/gu, " ").split(/\s+/u)
      .filter((word) => /^[\p{L}_][\w.'?!]*$/u.test(word) && !["scoped", "hiding", "renaming", "in"].includes(word)));
  }
  for (const { qualifiedName } of leanDeclarations(source, ["theorem", "lemma", "def", "abbrev", "instance", "structure", "inductive"])) {
    const parts = qualifiedName.split(".").slice(0, -1);
    for (let length = 1; length <= parts.length; length += 1) enclosing.add(parts.slice(0, length).join("."));
  }
  return [...enclosing, ...opened, ...[...enclosing].flatMap((outer) => opened.map((name) => `${outer}.${name}`))];
}

/** The rewriting tactics that request a definition's equation lemmas even when it is reducible. */
const rewritesRegardless = new Set(["rw", "rwa", "rewrite", "erw", "rw_mod_cast", "nth_rewrite", "nth_rw", "grind"]);

/**
 * Every rewrite with a hidden definition of a module imported with `import all`, or of the rewriting module itself, as
 * `Module.definition` per occurrence and keyed by the rewriting module, which item 2 of
 * [the build modularity specification](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#contract) forbids: each one
 * exports the definition's equation lemmas, so a body edit changes the rewriting module's public interface.
 */
export function leanHiddenRewrites(sources: LeanSources): Map<string, string[]> {
  const { headers } = importGraph(sources);
  const text = new Map(sources.map(({ path, source }) => [path.replace(/\.lean$/u, "").replaceAll("/", "."), source]));
  const hidden = new Map([...headers.keys()].map((module) => [module, hiddenDefinitions(text.get(module)!)]));
  const candidates = rewriteCandidateCache();
  const rewrites = new Map<string, string[]>();
  for (const [importer, header] of headers) {
    const opened = header.imports.filter(({ module, importsAll }) => importsAll && headers.has(module)).map(({ module }) => module);
    const sites = [importer, ...opened]
      .flatMap((module) => hiddenRewriteSites(candidates(text.get(importer)!), hidden.get(module)!).map((name) => `${module}.${name}`));
    rewrites.set(importer, sites.sort());
  }
  return rewrites;
}

/**
 * Every module that an edit to one of a module's hidden definition bodies rebuilds, keyed by that module and sorted by
 * name: the cost the [build modularity specification](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#problem) set out to bound.
 *
 * A body in an `@[expose]` section is part of the public interface, so in a module with such a section every body
 * edit rebuilds the whole interface fanout; otherwise a body edit rebuilds only the hidden-edit fanout. One
 * `@[expose] public section` therefore turns every body edit of a module into an interface edit: a body edit to
 * `NestedScopeData` rebuilt exactly the 61 modules of its public cone that one target loads, as this model predicts
 * (pinned container, 2026-10-27). A definition exposed on its own is an interface edit by necessity and is named by
 * {@link leanExposedDefinitions} instead.
 */
export function leanBodyEditFanouts(sources: LeanSources, leaks: ReadonlyArray<RealizedLeak> = []): Map<string, string[]> {
  const interfaceFanouts = leanFanouts(sources);
  const hiddenFanouts = leanHiddenEditFanouts(sources, leaks);
  return new Map(sources.map(({ path, source }) => {
    const module = path.replace(/\.lean$/u, "").replaceAll("/", ".");
    const hidden = hiddenFanouts.get(module)!;
    if (!exposedSectionDefinitions(source)) return [module, hidden];
    return [module, [...new Set([...interfaceFanouts.get(module)!, ...hidden])].sort()];
  }));
}

/**
 * The definitions each module exposes individually, keyed by module: an `@[expose]` definition, an `abbrev`, and an
 * `instance`, unless marked `@[no_expose]`; Lean also hides an instance whose type is a proposition
 * (Lean/Elab/MutualDef.lean:1349), so counting every instance over-approximates. Each one's body edit rebuilds the module's whole interface fanout, so a wide
 * module names every such definition in a reviewed allowance.
 */
export function leanExposedDefinitions(sources: LeanSources): Map<string, string[]> {
  return new Map(sources.map(({ path, source }) => {
    const names = leanHeader(source).isModule ? leanDeclarations(source).filter((declaration) =>
      !declaration.isPrivate && !exposedBySection(declaration) && bodyExported(declaration)).map(({ name }) => name) : [];
    return [path.replace(/\.lean$/u, "").replaceAll("/", "."), names.sort()];
  }));
}

/**
 * Whether a module exposes a body through a section: a non-private `def` that an `@[expose]` section exports, or a plain
 * file. An abbrev or instance there is exported without the section too, and a `@[no_expose]` def is not, so neither
 * makes every body edit an interface edit; {@link leanExposedDefinitions} names the former instead.
 */
function exposedSectionDefinitions(source: string): boolean {
  return !leanHeader(source).isModule || leanDeclarations(source).some((declaration) =>
    !declaration.isPrivate && exposedBySection(declaration) && bodyExported(declaration));
}

/**
 * Whether a declaration is a `def` inside an `@[expose]` section whose export the section rather than the def decides:
 * its own `@[expose]` or `@[no_expose]` overrides the section (Elab/MutualDef.lean:1346-1384).
 */
function exposedBySection({ keyword, inExposedScope, attributes }: LeanDeclaration): boolean {
  return keyword === "def" && inExposedScope && !/(?<![\w])(?:no_)?expose\b/u.test(attributes);
}

/**
 * A declaration as {@link leanDeclarations} reads it. `inPublicScope` holds inside a `public section`, where a module's
 * declarations are public unless marked `private`; outside one a module's declarations are private by default.
 */
export type LeanDeclaration = Readonly<{ line: number; keyword: string; name: string; qualifiedName: string; attributes: string;
  isPrivate: boolean; inExposedScope: boolean; inPublicScope: boolean }>;

const sectionHeader = /^(@\[expose\]\s+)?(public\s+)?(?:noncomputable\s+)?(?:meta\s+)?section(?:\s+(\S+))?\s*$/u;
const sectionCommand = /^(?:@\[[^\]]*\]\s*|(?:public|private|protected|noncomputable|meta)\s+)*section\b/u;
const modifier = String.raw`(?:private|protected|noncomputable|partial|public|unsafe|nonrec|meta)`;
const declarationLine = (keywords: ReadonlyArray<string>) =>
  new RegExp(String.raw`^((?:@\[[^\]]*\]\s*)*)((?:${modifier}\s+)*)(${keywords.join("|")})\b\s*(.*)$`, "u");
const definitionKeywords = ["def", "instance", "abbrev"];
/** Attributes and modifiers with nothing after them yet, so the declaration or section continues on the next line. */
const declarationPrefix = new RegExp(String.raw`^(?:@\[[^\]]*\]\s*)+(?:${modifier}\s*)*$|^(?:${modifier}\s*)+$`, "u");
/** Whether an attribute list opened on this line is still unclosed. */
const openAttribute = (line: string) => /@\[[^\]]*$/u.test(line);
/**
 * Whether a declaration's body is exported, as Lean 4.34.1 decides it (Elab/MutualDef.lean:1346-1384): `@[no_expose]`
 * hides it, `@[expose]` exports it, and otherwise an abbrev, an instance or a def in an `@[expose]` section is exported.
 * A Prop-valued instance is hidden too, which this reading of the source cannot tell, so it counts as exported.
 */
function bodyExported({ keyword, attributes, inExposedScope }: LeanDeclaration): boolean {
  if (/\bno_expose\b/u.test(attributes)) return false;
  return /(?<![\w])expose\b/u.test(attributes) || keyword !== "def" || inExposedScope;
}

/**
 * Every declaration introduced by one of `keywords`, by default every `def`, `instance` and `abbrev`, with its
 * attributes, including attributes and modifiers on the lines above its keyword, its full name, and whether an
 * enclosing `@[expose]` or `public` scope covers it. Indentation is ignored, because an indented command is still a
 * command.
 *
 * Scopes follow Lean v4.34.1: a section header is `@[expose]? public? noncomputable? meta? section name?`
 * (Lean/Parser/Command.lean:308), every `section`, `namespace` and `mutual` scope inherits its parent's attributes,
 * a dotted name opens and `end name` closes one scope per component (Lean/Elab/BuiltinCommand.lean:45-70). A line that
 * starts a section command outside that grammar throws, so a new spelling fails closed instead of reading as hidden.
 */
export function leanDeclarations(source: string, keywords: ReadonlyArray<string> = definitionKeywords): LeanDeclaration[] {
  source = withoutComments(source);
  const startsDeclaration = declarationLine(keywords);
  // One entry per open scope after the file's root: a namespace component, or "" for a section or mutual block.
  const scopes: Array<Readonly<{ component: string; exposed: boolean; isPublic: boolean }>> = [];
  const enclosing = () => scopes.at(-1) ?? { component: "", exposed: false, isPublic: false };
  const open = (components: ReadonlyArray<string>, expose: boolean, isPublic: boolean) => {
    for (const component of components) {
      scopes.push({ component, exposed: enclosing().exposed || expose, isPublic: enclosing().isPublic || isPublic });
    }
  };
  const found: LeanDeclaration[] = [];
  // Attributes and modifiers that precede their keyword on earlier lines, joined until the declaration or section.
  let pending = "";
  const lines = source.split("\n");
  for (const [index, raw] of lines.entries()) {
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
    if (section !== null) open((section[3]?.split(".") ?? [""]).map(() => ""), section[1] !== undefined, section[2] !== undefined);
    else if (sectionCommand.test(line)) throw new Error(`unrecognized section header: ${line}`);
    else if (namespace !== null) open(namespace[1]!.split("."), false, false);
    else if (/^mutual\s*$/u.test(line)) open([""], false, false);
    else if (end !== null) scopes.splice(Math.max(0, scopes.length - (end[1]?.split(".").length ?? 1)));
    const declaration = startsDeclaration.exec(line);
    if (declaration !== null) {
      const [, attributes = "", modifiers, keyword, rest] = declaration;
      const name = declarationName(keyword!, declarationHeader(rest!, lines.slice(index + 1)));
      const written = /^([^\s:(\[{]+)/u.exec(rest!)?.[1] ?? name;
      const qualifiedName = written.startsWith("_root_.") ? written.slice("_root_.".length)
        : [...scopes.map(({ component }) => component).filter((component) => component !== ""), written].join(".");
      found.push({ line: index, keyword: keyword!, name, qualifiedName, attributes,
        isPrivate: /\bprivate\b/u.test(modifiers!), inExposedScope: enclosing().exposed, inPublicScope: enclosing().isPublic });
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
/**
 * A declaration's short name, or for an anonymous instance `instance : <class>`: Lean's generated name cannot be
 * derived here, so the class, without the binders before it, stands in. `header` is the text after the keyword, joined
 * across lines up to the body.
 */
function declarationName(keyword: string, header: string): string {
  const named = /^([^\s:(\[{⦃]+)/u.exec(header)?.[1];
  if (named !== undefined) return keyword === "instance" ? named : named.split(".").at(-1)!;
  const type = withoutLeadingBinders(header).replace(/^:\s*/u, "").replace(/\s*(?::=|\bwhere\b)[\s\S]*$/u, "");
  return `instance : ${type.replace(/\s+/gu, " ").trim()}`;
}

const binderClosers: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", "⦃": "⦄" };

/** `text` after its leading bracketed binder groups, each skipped with its nested brackets. */
function withoutLeadingBinders(text: string): string {
  let at = 0;
  for (;;) {
    while (/\s/u.test(text[at] ?? "")) at += 1;
    if (binderClosers[text[at] ?? ""] === undefined) return text.slice(at);
    let depth = 0;
    do {
      if (binderClosers[text[at]!] !== undefined) depth += 1;
      else if (Object.values(binderClosers).includes(text[at]!)) depth -= 1;
      at += 1;
    } while (depth > 0 && at < text.length);
  }
}

/** The declaration header from `rest` on, joined with the following lines until the body starts (`:=`, `where`, `|`). */
function declarationHeader(rest: string, following: ReadonlyArray<string>): string {
  const ended = (text: string) => /:=|\bwhere\b/u.test(withoutLeadingBinders(text));
  let header = rest;
  for (const line of following) {
    if (ended(header) || /^\s*\|/u.test(line)) break;
    header = `${header} ${line.trim()}`;
  }
  return header;
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
 * reason or starting bound is gone while its bound still exceeds that start, one rising further than the base's bound
 * with the base's reason, or a new rise whose `raisedFrom` is not the base's bound. A further rise keeps the base's
 * `raisedFrom`, because its debt still starts where the main line's bound was.
 */
export function brokenDebtRecords(previous: ReadonlyArray<LeanFanoutBound>, current: ReadonlyArray<LeanFanoutBound>,
  previousDefault: number): string[] {
  const before = new Map(previous.map((entry) => [entry.module, entry]));
  return current.flatMap(({ module, bound, raised, raisedFrom }) => {
    const base = before.get(module);
    if (base?.raised !== undefined && base.raisedFrom !== undefined && bound > base.raisedFrom) {
      if (raisedFrom !== base.raisedFrom || !raised?.trim()) {
        return [`${module}: drops the record of its rise from ${base.raisedFrom} while its bound stays at ${bound}`];
      }
      return bound > base.bound && raised === base.raised
        ? [`${module}: rises further from ${base.bound} to ${bound} with the reason of its earlier rise`] : [];
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
 * An owner's decision that a default bound or total `setting` may rise from `from` to at most `to`; `decision` names
 * the decision, its date and its reason.
 */
export type LeanOwnerDecidedRise = Readonly<{ setting: string; from: number; to: number; decision: string }>;

/**
 * The rises of a default or total, each `[setting, base value, current value]`, that no owner decision allows: one
 * with no decision for its starting value, one beyond the decision's `to`, or one whose decision `committed`, the
 * last commit's decisions, lacks, so that the decision lands in its own commit before the rise it allows.
 */
export function undecidedSettingRises(rises: ReadonlyArray<readonly [string, number, number]>,
  decided: ReadonlyArray<LeanOwnerDecidedRise>, committed: ReadonlyArray<LeanOwnerDecidedRise>): string[] {
  return rises.flatMap(([setting, before, after]) => {
    if (after <= before) return [];
    const decision = decided.find((entry) => entry.setting === setting && entry.from === before && entry.decision.trim());
    if (decision === undefined) return [`${setting}: ${after} exceeds the base's ${before}; a default or total rises only by owner decision`];
    if (after > decision.to) return [`${setting}: ${after} exceeds the base's ${before} beyond the owner decision's ${decision.to}`];
    return committed.some((entry) => entry.setting === setting && entry.from === before && entry.to === decision.to
      && entry.decision === decision.decision) ? []
      : [`${setting}: the owner decision for its rise from ${before} must be committed before the rise`];
  });
}

/** The decisions whose rise the main line, given as its recorded settings, already carries, so their record must go. */
export function settledOwnerDecisions(decided: ReadonlyArray<LeanOwnerDecidedRise>,
  mainLine: Readonly<Record<string, unknown>>): string[] {
  return decided.flatMap(({ setting, to }) => {
    const value = mainLine[setting];
    return typeof value === "number" && value >= to
      ? [`${setting}: the main line already carries the owner decision's ${to}, so its record must go`] : [];
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
 * the kernel types, so their fanout grows with the library by design. Only the interface ratchet passes a kernel,
 * since an operation-body edit need not rebuild every family. A kernel module carrying a bound, or a kernel name
 * that is no scanned module, is reported after the bounds' findings.
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
