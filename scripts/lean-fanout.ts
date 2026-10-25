import { leanHeader } from "./lean-source-analysis.ts";

/**
 * Every module whose build an edit to a module's public interface can invalidate, keyed by that module and
 * sorted by name: the static fanout that [the fanout ratchet](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract)
 * bounds.
 *
 * Lake rebuilds an importer from the artifacts of everything it loads. A module loads what it imports directly,
 * of any form, and whatever those re-export through `public import`; a private import stops there, which the
 * [mechanism observations](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#mechanism-observations-lean-v4341-2026-10-23)
 * record. A plain file loads its whole import closure and re-exports every import, so a hidden-body edit
 * still rebuilds it.
 *
 * This is an upper bound: an importer whose own artifact comes out unchanged stops propagation in Lake, which a
 * graph scan cannot see. Imports of modules outside `sources`, such as Lean core, are ignored.
 */
export function leanFanouts(sources: ReadonlyArray<Readonly<{ path: string; source: string }>>): Map<string, string[]> {
  const moduleOf = (path: string) => path.replace(/\.lean$/u, "").replaceAll("/", ".");
  const headers = new Map(sources.map(({ path, source }) => [moduleOf(path), leanHeader(source)] as const));
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
  const closure = (module: string, seen: Set<string>): Set<string> => {
    for (const { module: imported } of headers.get(module)!.imports) {
      if (headers.has(imported) && !seen.has(imported)) closure(imported, seen.add(imported));
    }
    return seen;
  };
  const fanouts = new Map([...headers.keys()].map((module) => [module, [] as string[]]));
  for (const [importer, header] of headers) {
    const loaded = header.isModule ? new Set<string>() : closure(importer, new Set());
    for (const { module: imported } of header.imports) {
      if (headers.has(imported)) for (const reached of reexported(imported)) loaded.add(reached);
    }
    loaded.delete(importer);
    for (const module of loaded) fanouts.get(module)!.push(importer);
  }
  for (const importers of fanouts.values()) importers.sort();
  return fanouts;
}

/** A module allowed more importers than the default, at most `bound`; the list only shrinks. */
export type LeanFanoutBound = Readonly<{ module: string; bound: number }>;

/**
 * The ratchet's findings: a recorded module above its bound, a recorded module that the default already covers
 * (its entry must go, so the list only shrinks), a recorded name that is no scanned module, and an unlisted module
 * above the default. Recorded findings come in list order, unlisted ones after them in fanout order.
 */
export function leanFanoutViolations(fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  bounds: ReadonlyArray<LeanFanoutBound>, defaultBound: number): string[] {
  const recorded = new Set(bounds.map(({ module }) => module));
  const listed = bounds.flatMap(({ module, bound }) => {
    const count = fanouts.get(module)?.length;
    if (count === undefined) return [`${module}: recorded but not a scanned module`];
    if (count > bound) return [`${module}: ${count} importers exceed its recorded bound ${bound}`];
    if (count <= defaultBound) return [`${module}: ${count} importers fit the default bound ${defaultBound}, so its entry must go`];
    return [];
  });
  const unlisted = [...fanouts].filter(([module, importers]) => !recorded.has(module) && importers.length > defaultBound)
    .map(([module, importers]) => `${module}: ${importers.length} importers exceed the default bound ${defaultBound} without a recorded bound`);
  return [...listed, ...unlisted];
}
