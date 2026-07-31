import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const documentRoots = [
  "contracts",
  "docs",
  "packages",
  "profiles",
  "runners",
  "scenarios",
];

async function markdownFiles(
  relativeRoot: string,
): Promise<ReadonlyArray<string>> {
  const entries = await readdir(path.join(projectRoot, relativeRoot), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.flatMap((entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory() && relativePath !== "docs/reference") {
        return [markdownFiles(relativePath)];
      }
      return entry.isFile() && entry.name.endsWith(".md")
        ? [Promise.resolve<ReadonlyArray<string>>([relativePath])]
        : [];
    }),
  );
  return nested.flat();
}

/**
 * Reference checkouts recorded in `docs/SOURCES.md` live beside this
 * repository, so their relative links resolve only on a host that has cloned
 * them. See the reference and source discipline in `CLAUDE.md`.
 */
const referenceCheckoutRoot = path.resolve(projectRoot, "../oss");

const LinkScope = {
  Repository: "repository",
  ReferenceCheckout: "referenceCheckout",
  Foreign: "foreign",
} as const;
type LinkScope = (typeof LinkScope)[keyof typeof LinkScope];

function contains(root: string, resolved: string): boolean {
  const relative = path.relative(root, resolved);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function linkScope(resolved: string): LinkScope {
  if (contains(projectRoot, resolved)) {
    return LinkScope.Repository;
  }
  return contains(referenceCheckoutRoot, resolved)
    ? LinkScope.ReferenceCheckout
    : LinkScope.Foreign;
}

/**
 * Whether an unresolvable target is a defect.
 *
 * A missing reference checkout is an absent research input, which every clean
 * checkout and CI run has; a target that escapes this repository without
 * landing in the reference tree is a broken link, including a relative path
 * with one `..` too many.
 */
function requiresResolution(scope: LinkScope): boolean {
  switch (scope) {
    case LinkScope.Repository:
      return true;
    case LinkScope.ReferenceCheckout:
      return false;
    case LinkScope.Foreign:
      return true;
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

/** The leading `split` segment, or the whole value when no separator occurs. */
function firstSegment(value: string, separator: string | RegExp): string {
  const [first] = value.split(separator);
  return first ?? value;
}

function localLinkTargets(markdown: string): ReadonlyArray<string> {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1].trim()]))
    .filter(
      (target) =>
        !target.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(target),
    )
    .map((target) => {
      const withoutTitle = target.startsWith("<")
        ? target.slice(1, target.indexOf(">"))
        : firstSegment(target, /\s+/u);
      return decodeURIComponent(firstSegment(withoutTitle, "#"));
    })
    .filter(Boolean);
}

test("keeps project-authored local Markdown links resolvable", async () => {
  const files = [
    "README.md",
    "CLAUDE.md",
    ...(await Promise.all(documentRoots.map(markdownFiles))).flat(),
  ];
  const missing: string[] = [];
  const absentReferences: string[] = [];

  for (const relativeDocumentPath of files) {
    const documentPath = path.join(projectRoot, relativeDocumentPath);
    const markdown = await readFile(documentPath, "utf8");
    for (const target of localLinkTargets(markdown)) {
      const resolved = path.resolve(path.dirname(documentPath), target);
      try {
        await access(resolved);
      } catch {
        const scope = linkScope(resolved);
        const finding = `${relativeDocumentPath} -> ${target}`;
        if (requiresResolution(scope)) {
          missing.push(finding);
        } else {
          absentReferences.push(finding);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
  if (absentReferences.length > 0) {
    // Announced rather than silent: this run verified fewer links than a host
    // with the recorded reference checkouts present.
    console.log(
      `MARKDOWN_LINK_CHECK: ${absentReferences.length} reference-checkout links unverified because ${referenceCheckoutRoot} is absent`,
    );
  }
});

test("link resolution separates repository links from reference checkouts", () => {
  assert.equal(
    linkScope(path.join(projectRoot, "docs/PLAN.md")),
    LinkScope.Repository,
  );
  // The exact form `docs/SOURCES.md` records, which a clean checkout and CI
  // cannot resolve.
  assert.equal(
    linkScope(
      path.resolve(path.join(projectRoot, "docs"), "../../oss/cibseven/cibseven"),
    ),
    LinkScope.ReferenceCheckout,
  );
  // One `..` too many escapes the repository without reaching the reference
  // tree, so it stays a broken link rather than an absent research input.
  assert.equal(
    linkScope(path.resolve(projectRoot, "../PLAN.md")),
    LinkScope.Foreign,
  );

  assert.equal(requiresResolution(LinkScope.Repository), true);
  assert.equal(requiresResolution(LinkScope.ReferenceCheckout), false);
  assert.equal(requiresResolution(LinkScope.Foreign), true);
});

test("keeps maintained documentation indexed and role-named", async () => {
  const documentationFiles = await markdownFiles("docs");
  const registryPath = path.join(projectRoot, "docs/README.md");
  const registry = await readFile(registryPath, "utf8");
  const indexedFiles = new Set(
    localLinkTargets(registry).map((target) =>
      path.relative(
        projectRoot,
        path.resolve(path.dirname(registryPath), target),
      ),
    ),
  );
  const unindexedFiles = documentationFiles
    .filter((relativePath) => relativePath !== "docs/README.md")
    .filter((relativePath) => !indexedFiles.has(relativePath))
    .sort();

  assert.deepEqual(unindexedFiles, []);

  const reservedSingletons = new Set([
    "DOC-DISCIPLINE.md",
    "PLAN.md",
    "PROJECT-DESIGN.md",
    "README.md",
    "SOURCES.md",
  ]);
  const roleSuffix =
    /-(?:DECISION|EXPERIMENT|GAPS|GUIDE|HANDOFF|LEDGER|MAP|POLICY|PROPOSAL|REGISTER|RESEARCH|SPEC|TARGET|WALKTHROUGH)\.md$/u;
  const roleViolations = documentationFiles
    .filter(
      (relativePath) =>
        !reservedSingletons.has(path.basename(relativePath)) &&
        !roleSuffix.test(path.basename(relativePath)),
    )
    .sort();

  assert.deepEqual(roleViolations, []);
});
