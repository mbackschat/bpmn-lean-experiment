/**
 * The profile data and the CIB-BPMN register agree on which relationships a profile selects. A relationship selects
 * behaviour only through a profile's relationship list (`kernelProfileOptions` reads nothing else), so a register entry
 * that calls itself selected while no profile lists it claims behaviour the kernel does not run. The class was found
 * three times in wave 1 (CIB-INT-0012, -0015, -0016, CIB-LIM-0007; CIB-INT-0017; CIB-LIM-0014 and -0015 landing after
 * their behaviour), which makes it a guard. Wave 2 found it again behind a "Recorded" prefix (CIB-INT-0023 to -0025), so
 * a selection claim anywhere in the status counts.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type SelectionInputs = Readonly<{
  register: string;
  profiles: ReadonlyMap<string, ReadonlySet<string>>;
  optionSource: string;
}>;

/** Every register entry heading with its status line. */
export function registerStatuses(register: string): ReadonlyMap<string, string> {
  const statuses = new Map<string, string>();
  const pattern = /^### (CIB-[A-Z]+-\d{4})\b[^\n]*\n\n\*\*Status:\*\*([^\n]*)/gmu;
  for (const match of register.matchAll(pattern)) statuses.set(match[1]!, match[2]!.trim());
  return statuses;
}

/** Whether a status claims that some profile selects its entry; "not selected", "selected by no profile" and "no … selected" do not. */
export function claimsSelection(status: string): boolean {
  return /\bselected\b/iu.test(status) && !/\bnot selected\b|\bselected by no profile\b|\bno\b[^;]*\bselected\b/iu.test(status);
}

/** The violations of the selection contract; empty when the profile data and the register agree. */
export function selectionViolations(inputs: SelectionInputs): string[] {
  const statuses = registerStatuses(inputs.register);
  const violations: string[] = [];
  const listedBy = (id: string) => [...inputs.profiles].filter(([, ids]) => ids.has(id)).map(([profile]) => profile);
  for (const [id, status] of statuses) {
    if (claimsSelection(status) && listedBy(id).length === 0) {
      violations.push(`${id}: status says selected, but no profile lists it`);
    }
    for (const link of status.matchAll(/\.\.\/profiles\/([^/)]+)\/profile\.json/gu)) {
      const profile = link[1]!;
      if (!inputs.profiles.get(profile)?.has(id)) violations.push(`${id}: status names profile ${profile}, which does not list it`);
    }
  }
  for (const read of inputs.optionSource.matchAll(/selects\("(CIB-[A-Z]+-\d{4})"\)/gu)) {
    if (!statuses.has(read[1]!)) violations.push(`${read[1]}: an option reads an unregistered relationship`);
  }
  return violations;
}

export function readSelectionInputs(projectRoot: string): SelectionInputs {
  const profiles = new Map<string, ReadonlySet<string>>();
  for (const entry of readdirSync(path.join(projectRoot, "profiles"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profile = JSON.parse(readFileSync(path.join(projectRoot, "profiles", entry.name, "profile.json"), "utf8")) as {
      bpmn: { relationships: string[] };
    };
    profiles.set(entry.name, new Set(profile.bpmn.relationships));
  }
  return {
    register: readFileSync(path.join(projectRoot, "docs/CIB-BPMN-RELATION-REGISTER.md"), "utf8"),
    profiles,
    optionSource: readFileSync(path.join(projectRoot, "packages/bpmn-source/src/kernel-reader/wire.ts"), "utf8"),
  };
}
