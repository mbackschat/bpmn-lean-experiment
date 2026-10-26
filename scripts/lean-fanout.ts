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
 * sorted by name: the static fanout that [the fanout ratchet](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract)
 * bounds.
 *
 * Lake rebuilds an importer from the artifacts of everything it loads. A module loads what it imports directly,
 * of any form, and whatever those re-export through `public import`; a private import stops there, which the
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#mechanism-observations-lean-v4341-2026-10-23)
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
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#mechanism-observations-lean-v4341-2026-10-23)).
 */
export function leanHiddenEditFanouts(sources: LeanSources): Map<string, string[]> {
  const { headers, closure } = importGraph(sources);
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
    for (const importer of plainReach.get(module)!) rebuilt.add(importer);
    rebuilt.delete(module);
    return [module, [...rebuilt].sort()];
  }));
}

/** A module allowed more importers than the default, at most `bound`; the list only shrinks. */
export type LeanFanoutBound = Readonly<{ module: string; bound: number }>;

/**
 * The ratchet's findings: a recorded module above its bound, a recorded module that the default already covers
 * (its entry must go, so the list only shrinks), a recorded name that is no scanned module, and an unlisted module
 * above the default. Recorded findings come in list order, unlisted ones after them in fanout order.
 *
 * A `kernel` module is exempt, as required item 6 of the build modularity proposal declares: every module imports
 * the kernel types, so their fanout grows with the library by design. A kernel module carrying a bound, or a
 * kernel name that is no scanned module, is reported after the bounds' findings.
 */
export function leanFanoutViolations(fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  bounds: ReadonlyArray<LeanFanoutBound>, defaultBound: number, kernel: ReadonlyArray<string> = []): string[] {
  const exempt = new Set(kernel);
  const recorded = new Set([...bounds.map(({ module }) => module), ...kernel]);
  const listed = bounds.flatMap(({ module, bound }) => {
    const count = fanouts.get(module)?.length;
    if (exempt.has(module)) return [`${module}: a kernel module needs no recorded bound`];
    if (count === undefined) return [`${module}: recorded but not a scanned module`];
    if (count > bound) return [`${module}: ${count} importers exceed its recorded bound ${bound}`];
    if (count <= defaultBound) return [`${module}: ${count} importers fit the default bound ${defaultBound}, so its entry must go`];
    return [];
  });
  const unlisted = [...fanouts].filter(([module, importers]) => !recorded.has(module) && importers.length > defaultBound)
    .map(([module, importers]) => `${module}: ${importers.length} importers exceed the default bound ${defaultBound} without a recorded bound`);
  const kernelFindings = kernel.filter((module) => !fanouts.has(module))
    .map((module) => `${module}: declared kernel but not a scanned module`);
  return [...listed, ...kernelFindings, ...unlisted];
}
