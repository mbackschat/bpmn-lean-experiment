/**
 * The classified disagreements between the kernel and retained CIB evidence: each entry names one evidence file, the
 * location where its classified difference begins (`firstDifference`, from `disagreementLocation`: the first differing
 * field in the comparators' run order, such as `trace[7].openWaits[0].detail.dueMs`) and its owners, every row or
 * relation whose account the scenario witnesses. An open or held coverage row owns an answer CIB gave before the row's
 * code exists (PLAN order gate: rows turn red to green against an answer fixed before the code); a registered CIB
 * relation owns a difference the standards profile keeps on purpose. The oracle requires the disagreeing evidence to
 * equal the ledger exactly, each at its recorded location: an unlisted disagreement fails; so does a listed one whose
 * first difference moved, earlier because a step before the classified one now differs, which no owner accounts for,
 * or later because the classified difference changed; and so does a listed one that now agrees, which forces its
 * removal when its row lands. Everything before the recorded location is thus held to CIB; nothing after it is.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { compareCanonicalStrings } from "@bpmn-lean/differential";

export type LedgerEntry = Readonly<{ evidence: string; firstDifference: string; owners: ReadonlyArray<string> }>;

/** A listed disagreement whose first difference is no longer where the ledger records it. */
export type MovedDisagreement = Readonly<{ evidence: string; recorded: string; actual: string }>;

export type LedgerViolations = Readonly<{
  /** Disagreeing evidence the ledger does not list. */
  unlisted: ReadonlyArray<string>;
  /** Listed disagreeing evidence whose first difference differs from the recorded one. */
  moved: ReadonlyArray<MovedDisagreement>;
  /** Listed evidence that now agrees with the kernel. */
  agreeing: ReadonlyArray<string>;
  /** Listed evidence that is no longer retained. */
  orphaned: ReadonlyArray<string>;
}>;

const ledgerPath = "packages/differential/test/cib-disagreement-ledger.json";
const rowOwner = /^PC-[A-Z]+-[0-9]{2}$/u;

/** `disagreeing` maps each disagreeing evidence file to the location of its first difference. */
export function ledgerViolations(
  disagreeing: ReadonlyMap<string, string>,
  retained: ReadonlySet<string>,
  ledger: ReadonlyArray<LedgerEntry>,
): LedgerViolations {
  const listed = new Set(ledger.map(({ evidence }) => evidence));
  return {
    unlisted: [...disagreeing.keys()].filter((evidence) => !listed.has(evidence)).sort(compareCanonicalStrings),
    moved: ledger.flatMap(({ evidence, firstDifference }) => {
      const actual = disagreeing.get(evidence);
      return actual === undefined || actual === firstDifference ? [] : [{ evidence, recorded: firstDifference, actual }];
    }),
    agreeing: [...listed].filter((evidence) => retained.has(evidence) && !disagreeing.has(evidence)),
    orphaned: [...listed].filter((evidence) => !retained.has(evidence)),
  };
}

/**
 * Faults of the ledger itself: an entry without a recorded first difference or an owner, an owner that is neither a
 * coverage row nor a registered relation, and an entry listed twice or out of order. `rows` maps each coverage row to
 * its status cell; a row whose status starts with `done` cannot own a disagreement, because a done row's acceptance
 * holds on the retained evidence.
 */
export function ledgerOwnerFaults(
  ledger: ReadonlyArray<LedgerEntry>,
  rows: ReadonlyMap<string, string>,
  register: ReadonlySet<string>,
): ReadonlyArray<string> {
  const faults: string[] = [];
  const seen = new Set<string>();
  for (const [index, { evidence, firstDifference, owners }] of ledger.entries()) {
    if (typeof firstDifference !== "string" || firstDifference === "") faults.push(`${evidence}: records no first difference`);
    if (owners.length === 0) faults.push(`${evidence}: names no owner`);
    for (const owner of owners) {
      const status = rowOwner.test(owner) ? rows.get(owner) : undefined;
      if (status?.startsWith("done") === true) faults.push(`${evidence}: owner ${owner} is done`);
      else if (status === undefined && !register.has(owner)) {
        faults.push(`${evidence}: owner ${owner} is no open row or registered relation`);
      }
    }
    if (seen.has(evidence)) faults.push(`${evidence}: listed twice`);
    else if (index > 0 && compareCanonicalStrings(ledger[index - 1]!.evidence, evidence) > 0) {
      faults.push(`${evidence}: out of order`);
    }
    seen.add(evidence);
  }
  return faults;
}

/** The status cell of each row of the coverage target's delivery task list. */
async function coverageRows(projectRoot: string): Promise<ReadonlyMap<string, string>> {
  const target = await readFile(path.join(projectRoot, "docs/PRACTICAL-CIB7-COVERAGE-TARGET.md"), "utf8");
  return new Map(Array.from(target.matchAll(/^\| `(PC-[A-Z]+-[0-9]{2})` \|.*\| ([^|]+) \|$/gmu),
    (match) => [match[1]!, match[2]!.trim()] as const));
}

async function registeredRelations(projectRoot: string): Promise<ReadonlySet<string>> {
  const register = await readFile(path.join(projectRoot, "docs/CIB-BPMN-RELATION-REGISTER.md"), "utf8");
  return new Set(Array.from(register.matchAll(/^### (CIB-(?:AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4})\b/gmu),
    (match) => match[1]!));
}

/** The retained ledger, refused when any entry fails `ledgerOwnerFaults`. */
export async function readCibDisagreementLedger(projectRoot: string): Promise<ReadonlyArray<LedgerEntry>> {
  const ledger = JSON.parse(await readFile(path.join(projectRoot, ledgerPath), "utf8")) as ReadonlyArray<LedgerEntry>;
  const faults = ledgerOwnerFaults(ledger, await coverageRows(projectRoot), await registeredRelations(projectRoot));
  if (faults.length > 0) throw new Error(`${ledgerPath}:\n${faults.join("\n")}`);
  return ledger;
}
