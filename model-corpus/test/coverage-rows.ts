/**
 * The coverage-row view of the corpus: each row of the kernel status map's Row status table with the scenarios it
 * links, the retained models those scenarios bind, the capabilities the models claim and the restriction rows the
 * scenarios exhibit. Everything is read from the status map, the coverage target, the discovered scenarios and the
 * corpus report; no mapping is written by hand.
 */
import path from "node:path";

import type { CoverageRowView, ExecutableModelCorpusManifest, ExecutableModelCorpusReport } from "../../scripts/executable-model-corpus.ts";
import { compareCanonicalStrings } from "../../scripts/strict-json.ts";

const statusMapRowForm = /^\| (PC-[A-Z]+-\d{2}) \| ([^|]+) \| ([^|]+) \| [^|]+ \|$/;
const statusMapLinkForm = /\]\((\.\.\/\.\.\/[^)\s]+)\)/g;

export type StatusMapRow = Readonly<{ kernel: string; links: ReadonlyArray<string> }>;

/**
 * Each coverage row of the status map's "Row status" table, by row ID in table order: its kernel cell, and what its
 * "Kernel scenario evidence" cell links as repository-relative paths. A scenario `README.md` stands for its directory
 * (a trailing `/`), any other link, such as a differential fixture, for that file alone. Rows are the lines under the
 * table header up to its first blank line; any such line that is not in the table's form fails.
 */
export function parseStatusMapRows(markdown: string): ReadonlyMap<string, StatusMapRow> {
  const lines = markdown.split("\n");
  const section = lines.findIndex((line) => line === "## Row status");
  const header = lines.findIndex((line, index) => index > section && line === "| Row | Kernel | Kernel scenario evidence | Open proof lanes |");
  if (section < 0 || header < 0) throw new Error("KERNEL-STATUS-MAP.md has no Row status table with the expected header");
  const rows = new Map<string, StatusMapRow>();
  for (const line of lines.slice(header + 2)) {
    if (line === "") break;
    const match = statusMapRowForm.exec(line);
    if (match === null) throw new Error(`Row status line does not match the table's form: ${line}`);
    const row = match[1]!;
    if (rows.has(row)) throw new Error(`Row status lists ${row} twice`);
    rows.set(row, {
      kernel: match[2]!.trim(),
      links: [...match[3]!.matchAll(statusMapLinkForm)].map((link) => {
        const target = path.posix.join("docs/kernel", link[1]!);
        return path.posix.basename(target) === "README.md" ? `${path.posix.dirname(target)}/` : target;
      }),
    });
  }
  if (rows.size === 0) throw new Error("KERNEL-STATUS-MAP.md Row status table has no rows");
  return rows;
}

/** The scenario links of each row, by row ID. */
export function rowLinks(rows: ReadonlyMap<string, StatusMapRow>): ReadonlyMap<string, ReadonlyArray<string>> {
  return new Map([...rows].map(([row, { links }]) => [row, links]));
}

/** The State column of each task of the coverage target's delivery task list, by row ID. */
export function parseTargetStates(markdown: string): ReadonlyMap<string, string> {
  const states = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const cells = line.split("|");
    const id = /^ `(PC-[A-Z]+-\d{2})` $/.exec(cells[1] ?? "")?.[1];
    if (id !== undefined && cells.length >= 6) states.set(id, cells[cells.length - 2]!.trim());
  }
  return states;
}

/**
 * The rows a target task closed as `done` and the status map calls `accepted` although the map links no scenario, so
 * nothing witnesses the acceptance.
 */
export function acceptedWithoutScenario(
  rows: ReadonlyMap<string, StatusMapRow>,
  targetStates: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  return [...rows]
    .filter(([row, { kernel, links }]) => kernel === "accepted" && links.length === 0 && (targetStates.get(row) ?? "").startsWith("done"))
    .map(([row]) => row);
}

/** The row IDs each retained model witnesses, in ascending order: its scenario lies inside a directory the row links. */
export function bindModelRows(
  manifest: ExecutableModelCorpusManifest,
  links: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyMap<string, ReadonlyArray<string>> {
  return new Map(manifest.models.map((model) => {
    const modelPath = model.source.kind === "retainedScenario" ? model.source.scenarioRelativePath : null;
    const rows = modelPath === null ? [] : [...links]
      .filter(([, rowLinks]) => rowLinks.some((link) => link.endsWith("/") ? modelPath.startsWith(link) : modelPath === link))
      .map(([row]) => row).sort();
    return [model.id, rows];
  }));
}

/** The discovered scenario paths one row links: a directory link the scenarios under it, a file link that file. */
function linkedScenarios(links: ReadonlyArray<string>, discoveredPaths: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(links.flatMap((link) => link.endsWith("/") ? discoveredPaths.filter((found) => found.startsWith(link)) : [link]))];
}

/**
 * One row of the view per status-map row, in table order. `exhibitedBy` gives the restriction refusal codes a
 * scenario's sources are refused with, which is how the corpus guard decides that a scenario exhibits a restriction.
 */
export async function coverageRowView(
  rows: ReadonlyMap<string, StatusMapRow>,
  rowsByModel: ReadonlyMap<string, ReadonlyArray<string>>,
  report: ExecutableModelCorpusReport,
  discoveredPaths: ReadonlyArray<string>,
  exhibitedBy: (scenarioPath: string) => Promise<ReadonlyArray<string>>,
): Promise<ReadonlyArray<CoverageRowView>> {
  const view: CoverageRowView[] = [];
  for (const [row, { kernel, links }] of rows) {
    const scenarioPaths = linkedScenarios(links, discoveredPaths);
    const models = report.models.filter(({ id }) => rowsByModel.get(id)?.includes(row) === true);
    const restrictions = new Set<string>();
    for (const scenarioPath of scenarioPaths) for (const code of await exhibitedBy(scenarioPath)) restrictions.add(code);
    view.push({
      row,
      kernel,
      scenarios: scenarioPaths.length,
      models: models.map(({ id }) => id).sort(compareCanonicalStrings),
      capabilities: [...new Set(models.flatMap(({ capabilities }) => capabilities))].sort(compareCanonicalStrings),
      restrictions: [...restrictions].sort(compareCanonicalStrings),
    });
  }
  return view;
}
