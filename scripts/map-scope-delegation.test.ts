/**
 * A capsule that says the implementation map owns its scope must have a section there that does.
 *
 * Three specifications delegate their implemented and absent scope to
 * [the map](../docs/IMPLEMENTATION-MAP.md) rather than restating it, because copied absence lists in
 * them had gone stale. The delegation is only sound while the map carries the content, and the
 * `#current-claim` anchor keeps resolving after the content behind it is gone, so the link guard
 * cannot see the failure.
 *
 * This replaces a formulation that missed the class twice over. It detected delegation by the exact
 * phrase `recorded in [IMPLEMENTATION-MAP.md]`, so it saw one of the three while its own comment said
 * two; the other two write *owned by* and *stays in*. And it accepted the capsule filename occurring
 * anywhere in the map, which both undetected filenames already do under `Nearest unsupported claim`,
 * so their whole status sections could have been deleted with the gate green.
 *
 * Three changes follow from that. Delegation is detected by the claim rather than the verb — a line
 * that links the map and says the scope is not *restated* — because the claim is what creates the
 * obligation and a synonym for it is a different sentence, not a different phrasing. The capsule must
 * name the exact section it delegates to, since all three pointed at `#current-claim`, which owns
 * nothing about any of them and resolves anyway. And that section must link back to the capsule and
 * carry real content, so passing requires the status to exist rather than the filename to appear
 * somewhere — without the anchor the 7800-word surfaces section satisfies any capsule it mentions.
 *
 * A lexical residual survives all three: `restated` is still a word someone could replace with *not
 * duplicated here*, which would drop that capsule from the detected set silently. That is the failure
 * this guard exists to prevent, so it is closed by direction rather than by matching more synonyms.
 * Every capsule linking the map must be either detected as delegating or listed below as not, so a
 * new phrasing fails as an unclassified mention instead of passing as a non-delegation.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { detailMapContracts } from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const capsuleDirectory = path.join(projectRoot, "docs/capsules");
const mapPaths = new Map(
  detailMapContracts.map((contract) => [
    contract.file,
    path.join(projectRoot, "docs", contract.file),
  ]),
);

/**
 * Words below which a section states a heading rather than a scope.
 *
 * A floor rather than a target: the three current sections run from 167 to 350 words, and the point
 * is to reject a section emptied to a sentence, not to prescribe how long a status should be.
 */
const minimumStatusWords = 100;

/**
 * Both halves a status section must state, since a scope is what is implemented *and* what is not.
 *
 * A length floor alone does not reach this. An audit deleted the whole `Absent` half of one section
 * and the remainder still cleared 100 words, so the half the delegation exists to carry was the half
 * no check could see. These markers are the map's own convention for the two halves.
 *
 * This is a shape check and nothing more. Whether the section is *accurate* is not machine-decidable
 * from the repository, and the same audit found three wrong claims inside a section that satisfied
 * every mechanical rule here; reading it against the capsule remains a review obligation.
 */
const statusHalves: ReadonlyArray<string> = ["Implemented", "Absent"];

/**
 * Capsules that link the map for a reason other than delegating their scope to it.
 *
 * Enumerated rather than inferred, so that adding a capsule here is a visible act while forgetting one
 * is a failing gate.
 *
 * The distinction is narrower than *these do not mention scope*, and stating it loosely once already
 * produced a false claim in this comment. Four of them do say the map owns their exact evidence
 * status. What separates them from a delegation is that each still carries its own scope-bearing
 * section, so a map section going silent costs precision rather than orphaning the capsule, while the
 * three delegating capsules say they deliberately do not restate and leave the map as sole owner.
 * A capsule here that later drops its own scope section becomes a delegation and belongs above.
 */
const nonDelegatingMentions: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ["BOUNDARY-ERROR-SPEC.md", ["## Required scope", "## Excluded scope"]],
  ["COMMITTED-EXECUTION-PUBLICATION-SPEC.md", ["## Required, optional, and excluded functionality"]],
  ["CREATE-DOCUMENT-DATA-SPEC.md", ["## Required scope", "## Excluded scope"]],
  ["SCOPED-DATA-SPEC.md", ["## Required scope", "## Excluded scope"]],
  ["SERVICE-TASK-EFFECT-SPEC.md", ["## Required scope", "## Excluded scope"]],
  ["SUBPROCESS-ERROR-PROPAGATION-SPEC.md", ["## Implemented and excluded surface"]],
  ["USER-TASK-COMPLETION-DATA-SPEC.md", ["## Data contract", "## Explicit exclusions"]],
]);

/** A non-delegating mention stays classified only while its own scope headings remain exact. */
function retainsOwnScope(capsule: string, markdown: string): boolean {
  const headings = nonDelegatingMentions.get(capsule);
  if (headings === undefined) {
    return false;
  }
  const lines = new Set(markdown.split("\n"));
  return headings.every((heading) => lines.has(heading));
}

/** Capsules that link the map, claim no delegation, and are not recorded as doing so deliberately. */
function unclassifiedMentions(
  documents: ReadonlyMap<string, string>,
  delegated: ReadonlyArray<Delegation>,
): ReadonlyArray<string> {
  const delegating = new Set(delegated.map(({ capsule }) => capsule));
  return [...documents]
    .filter(([capsule, markdown]) =>
      markdown.includes("IMPLEMENTATION-MAP.md") &&
      !delegating.has(capsule) &&
      !retainsOwnScope(capsule, markdown)
    )
    .map(([capsule]) => capsule)
    .sort();
}

/** One capsule's delegation: the file that makes it and the map anchor it names as its owner. */
type Delegation = Readonly<{
  capsule: string;
  mapFile: string | undefined;
  anchor: string | undefined;
}>;

/**
 * The map anchor a delegating line names, or `undefined` when it names none.
 *
 * A line delegates when it points at the map and says the scope is not *restated*. That claim is what
 * creates the obligation; the verb carrying it is incidental and has already varied three ways.
 */
function delegatedTarget(
  line: string,
): Readonly<{ mapFile: string; anchor: string }> | undefined {
  if (!line.includes("IMPLEMENTATION-MAP.md") || !line.includes("restated")) {
    return undefined;
  }
  const target = /(?:\.\.\/)?([A-Z][A-Z-]*IMPLEMENTATION-MAP\.md)(?:#([a-z0-9-]+))?/u.exec(line);
  return {
    mapFile: target?.[1] ?? "",
    anchor: target?.[2] ?? "",
  };
}

function delegations(
  documents: ReadonlyMap<string, string>,
): ReadonlyArray<Delegation> {
  return [...documents]
    .flatMap(([capsule, markdown]) => {
      const targets = markdown.split("\n").map(delegatedTarget).filter((
        target,
      ): target is { mapFile: string; anchor: string } => target !== undefined);
      return targets.length === 0
        ? []
        : [{
          capsule,
          mapFile: targets.find((target) => target.mapFile !== "")?.mapFile,
          anchor: targets.find((target) => target.anchor !== "")?.anchor,
        }];
    })
    .sort((left, right) => left.capsule < right.capsule ? -1 : 1);
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces hyphenated. */
function headingAnchor(heading: string): string {
  return heading
    .replace(/^##\s+/u, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
}

/** Each level-two section of the map, as one string per section including its heading. */
function secondLevelSections(map: string): ReadonlyArray<string> {
  const lines = map.split("\n");
  const starts = lines.flatMap((line, index) =>
    line.startsWith("## ") ? [index] : []
  );
  return starts.map((start, order) =>
    lines.slice(start, starts[order + 1] ?? lines.length).join("\n")
  );
}

/** Capsules whose named map section is missing, silent about them, or emptied to a mention. */
function unansweredDelegations(
  maps: ReadonlyMap<string, string>,
  delegated: ReadonlyArray<Delegation>,
): ReadonlyArray<string> {
  return delegated
    .filter(({ capsule, mapFile, anchor }) => {
      const map = mapFile === undefined ? undefined : maps.get(mapFile);
      const sections = new Map(
        secondLevelSections(map ?? "").map((candidate) => [
          headingAnchor(candidate.split("\n")[0] ?? ""),
          candidate,
        ]),
      );
      const section = anchor === undefined ? undefined : sections.get(anchor);
      return section === undefined ||
        !section.includes(`capsules/${capsule}`) ||
        section.split(/\s+/u).filter(Boolean).length < minimumStatusWords ||
        !statusHalves.every((half) => section.includes(`**${half}`));
    })
    .map(({ capsule }) => capsule);
}

test("answers every delegating capsule with its own implementation-map section", async () => {
  const names = (await readdir(capsuleDirectory)).filter((name) =>
    name.endsWith("-SPEC.md")
  );
  const documents = new Map(
    await Promise.all(
      names.map(async (name): Promise<[string, string]> => [
        name,
        await readFile(path.join(capsuleDirectory, name), "utf8"),
      ]),
    ),
  );
  const delegated = delegations(documents);
  const maps = new Map(
    await Promise.all(
      [...mapPaths].map(async ([file, absolutePath]): Promise<[string, string]> => [
        file,
        await readFile(absolutePath, "utf8"),
      ]),
    ),
  );

  assert.deepEqual(
    {
      // A capsule set that delegates nothing would satisfy the finding list alone.
      delegatingCount: delegated.length > 0,
      // A delegation naming no section cannot be answered, so it is reported by name.
      anchorless: delegated.filter(({ mapFile, anchor }) =>
        mapFile === undefined || anchor === undefined
      ).map((
        { capsule },
      ) => capsule),
      unanswered: unansweredDelegations(maps, delegated),
      // A reworded delegation lands here rather than vanishing from the detected set.
      unclassified: unclassifiedMentions(documents, delegated),
    },
    { delegatingCount: true, anchorless: [], unanswered: [], unclassified: [] },
  );
});

/**
 * The detector and the answer check must each reject what they exist to reject.
 *
 * Both defects this guard replaces passed a green gate, so a live-corpus assertion alone would not
 * show that this formulation is any better. These cases are the two failures stated directly.
 */
test("rejects an unanswered delegation and a section emptied to a mention", () => {
  const filler = "word ".repeat(minimumStatusWords);
  const delegates =
    "Scope is owned by [the map](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#a-family) and not restated here.";

  assert.deepEqual(
    delegations(
      new Map([
        // The verb differs from every phrasing in the live corpus; the claim does not.
        ["A-SPEC.md", delegates],
        ["B-SPEC.md", "Scope lives in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md)."],
      ]),
    ),
    [{
      capsule: "A-SPEC.md",
      mapFile: "ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
      anchor: "a-family",
    }],
    "delegation must be detected by the not-restated claim rather than by one verb",
  );

  const named: ReadonlyArray<Delegation> = [
    {
      capsule: "A-SPEC.md",
      mapFile: "ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
      anchor: "a-family",
    },
  ];
  const mapName = "ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md";
  assert.deepEqual(
    unansweredDelegations(
      new Map([[mapName, `## Nearest unsupported claim\nSee [A](capsules/A-SPEC.md) for what stays open. ${filler}\n`]]),
      named,
    ),
    ["A-SPEC.md"],
    "a mention outside the named section must not satisfy its delegation",
  );

  assert.deepEqual(
    unansweredDelegations(new Map([[mapName, `## A family\n[A](capsules/A-SPEC.md) is implemented.\n`]]), named),
    ["A-SPEC.md"],
    "the named section emptied to a mention must not satisfy its delegation",
  );

  assert.deepEqual(
    unansweredDelegations(
      new Map([[mapName, `## A family\n[A](capsules/A-SPEC.md) **Implemented.** ${filler}\n`]]),
      named,
    ),
    ["A-SPEC.md"],
    "a section over the word floor with no absent half must not satisfy its delegation",
  );

  assert.deepEqual(
    unansweredDelegations(
      new Map([[mapName, `## A family\n[A](capsules/A-SPEC.md) **Implemented.** x **Absent.** y ${filler}\n`]]),
      named,
    ),
    [],
    "a substantive named section must satisfy it, or the checks above are vacuous",
  );

  assert.deepEqual(
    unansweredDelegations(
      new Map([[mapName, `## A family\n[A](capsules/A-SPEC.md) **Implemented.** x **Absent.** y ${filler}\n`]]),
      [{ capsule: "A-SPEC.md", mapFile: "IMPLEMENTATION-MAP.md", anchor: "a-family" }],
    ),
    ["A-SPEC.md"],
    "the root router cannot proxy a delegated detail-map section",
  );

  assert.deepEqual(
    unclassifiedMentions(
      new Map([["C-SPEC.md", "Scope is not duplicated here; see [the map](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#c)."]]),
      [],
    ),
    ["C-SPEC.md"],
    "a reworded delegation must fail as unclassified rather than pass as a non-delegation",
  );

  assert.deepEqual(
    unclassifiedMentions(
      new Map([[
        "BOUNDARY-ERROR-SPEC.md",
        "Current evidence is recorded in [the map](../IMPLEMENTATION-MAP.md).",
      ]]),
      [],
    ),
    ["BOUNDARY-ERROR-SPEC.md"],
    "a listed non-delegation must not stay classified after its own scope sections disappear",
  );
});
