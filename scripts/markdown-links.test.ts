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

  for (const relativeDocumentPath of files) {
    const documentPath = path.join(projectRoot, relativeDocumentPath);
    const markdown = await readFile(documentPath, "utf8");
    for (const target of localLinkTargets(markdown)) {
      const resolved = path.resolve(path.dirname(documentPath), target);
      try {
        await access(resolved);
      } catch {
        missing.push(`${relativeDocumentPath} -> ${target}`);
      }
    }
  }

  assert.deepEqual(missing, []);
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
