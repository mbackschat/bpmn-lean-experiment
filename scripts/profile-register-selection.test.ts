import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readSelectionInputs, selectionViolations } from "./profile-register-selection.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const entry = (id: string, status: string) => `### ${id} — title\n\n**Status:** ${status}\n\nBody.\n`;

test("the repository's profiles list every relationship the register calls selected", () => {
  assert.deepEqual(selectionViolations(readSelectionInputs(projectRoot)), []);
});

test("refuses a selected entry no profile lists, a named profile that omits it, and an unregistered option read", () => {
  const register = [
    entry("CIB-INT-0001", "Selected bounded interpretation"),
    entry("CIB-EXT-0002", "Recorded extension; selected through the [cumulative profile](../profiles/cib/profile.json)"),
    entry("CIB-EXT-0003", "Recorded extension; not selected by any profile"),
  ].join("\n");
  const violations = selectionViolations({
    register,
    profiles: new Map([["cib", new Set(["CIB-EXT-0003"])]]),
    optionSource: 'x: selects("CIB-EXT-0003") ? 1 : 2, y: selects("CIB-EXT-0099") ? 1 : 2',
  });
  assert.deepEqual(violations, [
    "CIB-INT-0001: status says selected, but no profile lists it",
    "CIB-EXT-0002: status says selected, but no profile lists it",
    "CIB-EXT-0002: status names profile cib, which does not list it",
    "CIB-EXT-0099: an option reads an unregistered relationship",
  ]);
});

test("accepts entries whose profiles list them", () => {
  const register = entry("CIB-INT-0001", "Selected through the [cumulative profile](../profiles/cib/profile.json)");
  assert.deepEqual(selectionViolations({
    register, profiles: new Map([["cib", new Set(["CIB-INT-0001"])]]), optionSource: 'selects("CIB-INT-0001")',
  }), []);
});

// Wave 2 recorded three statuses that claimed selection after a "Recorded" prefix (CIB-INT-0023 to -0025), which a
// prefix check missed; a status that says it is not selected, or selected by no profile, claims nothing.
test("refuses a selection claim anywhere in the status and accepts an explicit non-selection", () => {
  const register = [
    entry("CIB-INT-0023", "Recorded bounded interpretation from the pinned source; selected by every profile"),
    entry("CIB-LIM-0022", "Profile limitation selected by the cibseven profiles (`MessageNames.addresses`)"),
    entry("CIB-EXT-0037", "Optional CIB extension; selected by no profile"),
    entry("CIB-EXT-0003", "Recorded extension; not selected by any profile"),
    entry("CIB-AGR-0011", "Reviewed bounded agreement; no Multi-Instance compatibility profile selected"),
  ].join("\n");
  assert.deepEqual(selectionViolations({ register, profiles: new Map([["cib", new Set<string>()]]), optionSource: "" }), [
    "CIB-INT-0023: status says selected, but no profile lists it",
    "CIB-LIM-0022: status says selected, but no profile lists it",
  ]);
});
