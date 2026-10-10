import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { assertCanonicalRepositoryPath, documentSection, type OrderedWorkEntry } from "./document-control-plane.ts";
import { scanMarkdownLinks } from "./markdown-link-lexer.ts";

export const assuranceRegisterPath = "docs/ASSURANCE-IMPROVEMENT-REGISTER.md";

const dispositions = new Set(["open", "partial", "pending-acceptance", "deferred", "held"]);

export type AssuranceFinding = Readonly<{
  id: string;
  disposition: string;
  owners: ReadonlyArray<string>;
  trigger: string;
}>;

function tableRows(section: string): ReadonlyArray<ReadonlyArray<string>> {
  return section.split("\n").filter((line) => /^\|\s*(?:\[)?AA-\d+/u.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function ownerPath(destination: string): string {
  assert.doesNotMatch(destination, /^(?:[A-Za-z][A-Za-z0-9+.-]*:|#|\/)/u, "assurance owners must be repository links");
  const directory = destination.split("#")[0]?.endsWith("/") ?? false;
  const resolved = path.posix.normalize(path.posix.join("docs", destination.split("#")[0] ?? ""));
  assertCanonicalRepositoryPath(resolved.replace(/\/$/u, ""));
  return directory ? `${resolved.replace(/\/$/u, "")}/` : resolved;
}

/** Only declared Owner links bind paths; finding prose and historical evidence do not. */
export function parseAssuranceFindings(register: string): ReadonlyArray<AssuranceFinding> {
  const findings = tableRows(documentSection(register, "Active findings")).map((cells) => {
    assert.equal(cells.length, 4, "assurance index row needs Finding, Disposition, Owners and Trigger");
    const [identity = "", disposition = "", ownerCell = "", trigger = ""] = cells;
    const match = /^\[(AA-\d+)\]\(#aa-\d+\)$/u.exec(identity);
    const id = match?.[1];
    assert.ok(id !== undefined, `invalid assurance finding identity: ${identity}`);
    assert.equal(identity, `[${id}](#${id.toLowerCase()})`, `${id}: route must preserve its stable anchor`);
    assert.ok(dispositions.has(disposition), `${id}: invalid active disposition ${disposition}`);
    const owners = scanMarkdownLinks(ownerCell).map(({ destination }) => ownerPath(destination));
    assert.ok(owners.length > 0, `${id}: missing declared Owner link`);
    assert.ok(trigger.length > 0, `${id}: missing trigger`);
    return { id, disposition, owners, trigger };
  });
  const activeIds = findings.map(({ id }) => id);
  assert.equal(new Set(activeIds).size, activeIds.length, "duplicate active assurance ID");
  const sectionIds = [...register.matchAll(/^## (AA-\d+)$/gmu)].map((match) => match[1]);
  assert.deepEqual([...sectionIds].sort(), [...activeIds].sort(), "each active finding needs exactly one complete record");
  const resolvedIds = [...documentSection(register, "Resolved index").matchAll(/^### (AA-\d+)$/gmu)]
    .map((match) => match[1]);
  const allIds = [...activeIds, ...resolvedIds];
  assert.equal(new Set(allIds).size, allIds.length, "duplicate or active/resolved assurance ID");
  return findings;
}

export function assuranceBindingsFor(target: string, findings: ReadonlyArray<AssuranceFinding>): ReadonlyArray<AssuranceFinding> {
  assertCanonicalRepositoryPath(target);
  return findings.filter(({ owners }) => owners.some((owner) => owner.endsWith("/") ? target.startsWith(owner) : target === owner));
}

/** The assessment base remains fixed for the selected task, including after committing its changes. */
export function assuranceChangedPaths(root: string, plan: string): ReadonlyArray<string> {
  const base = /^Assurance base: `([0-9a-f]{40})`\.$/mu.exec(plan)?.[1];
  assert.ok(base !== undefined, "PLAN needs an immutable Assurance base for the selected task");
  const git = (args: ReadonlyArray<string>): string => execFileSync("git", [...args], {
    cwd: root, encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(git(["rev-parse", "--verify", `${base}^{commit}`]).trim(), base, "assurance base must resolve to its exact commit");
  git(["merge-base", "--is-ancestor", base, "HEAD"]);
  // Disable rename pairing so removal of a declared owner cannot lose its assessment obligation.
  const changed = git(["diff", "--name-only", "--no-renames", "-z", base, "--"]);
  const pending = git(["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set(`${changed}${pending}`.split("\0").filter(Boolean))].sort();
}

/** Requires recorded judgments for declared routes, without deciding whether their triggers are true. */
export function assuranceAssessmentFindings(
  plan: string,
  active: OrderedWorkEntry,
  findings: ReadonlyArray<AssuranceFinding>,
  changedPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const required = findings.filter((finding) => changedPaths.some((target) => assuranceBindingsFor(target, [finding]).length > 0));
  const rows = tableRows(documentSection(plan, "Ordered work"));
  const errors: string[] = [];
  if (rows.length > 0 && !plan.includes(`Assurance work ID: \`${active.id}\`.`)) {
    errors.push("assurance assessment must name the active work ID");
  }
  const assessments = new Map<string, ReadonlyArray<string>>();
  for (const cells of rows) {
    for (const id of (cells[0] ?? "").split(/,\s*/u)) {
      if (!findings.some((finding) => finding.id === id)) errors.push(`${id}: assessment names no active registered finding`);
      if (assessments.has(id)) errors.push(`${id}: duplicate trigger assessment`);
      assessments.set(id, cells);
    }
  }
  for (const finding of required) {
    const cells = assessments.get(finding.id);
    if (cells === undefined) {
      errors.push(`${finding.id}: missing trigger assessment for ${active.id}`);
      continue;
    }
    const [, result, reason = "", action = "", acceptance = ""] = cells;
    if (cells.length !== 5 || !["not-met", "met", "met-review"].includes(result ?? "") || reason === "" || reason === "—") {
      errors.push(`${finding.id}: assessment needs a closed result and reason`);
      continue;
    }
    if (result === "not-met") continue;
    if (action === "" || action === "—" || scanMarkdownLinks(acceptance).length === 0) {
      errors.push(`${finding.id}: met trigger needs a bounded action and linked acceptance`);
    }
    if ((finding.disposition === "held" || finding.disposition === "deferred") && result !== "met-review") {
      errors.push(`${finding.id}: ${finding.disposition} findings require met-review, preserving the reviewed decision or amendment boundary`);
    }
  }
  return errors;
}
