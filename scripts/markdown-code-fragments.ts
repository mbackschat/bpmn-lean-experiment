import {
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Inputs for one fragment pass.
 *
 * Omitting `markdownFiles` discovers `README.md` plus every `docs` Markdown
 * file outside the ignored normative reference corpus.
 */
export type MarkdownCodeFragmentRequest = Readonly<{
  projectRoot: string;
  markdownFiles?: ReadonlyArray<string>;
}>;

export type MarkdownCodeFragmentResult = Readonly<{
  fragmentCount: number;
  changedFiles: ReadonlyArray<string>;
}>;

type FragmentReplacement = Readonly<{
  start: number;
  end: number;
  body: string;
}>;

const documentFragmentPattern =
  /<!-- source-fragment: ([A-Za-z0-9_./-]+)#([A-Za-z0-9_.-]+) -->[ \t]*\r?\n```([A-Za-z0-9_+-]+)\r?\n([\s\S]*?)\r?\n```/dgu;

export async function checkMarkdownCodeFragments(
  request: MarkdownCodeFragmentRequest,
): Promise<MarkdownCodeFragmentResult> {
  return processMarkdownCodeFragments(request, false);
}

export async function syncMarkdownCodeFragments(
  request: MarkdownCodeFragmentRequest,
): Promise<MarkdownCodeFragmentResult> {
  return processMarkdownCodeFragments(request, true);
}

async function processMarkdownCodeFragments(
  { projectRoot, markdownFiles }: MarkdownCodeFragmentRequest,
  write: boolean,
): Promise<MarkdownCodeFragmentResult> {
  const normalizedRoot = path.resolve(projectRoot);
  const files =
    markdownFiles ?? await discoverMarkdownFiles(normalizedRoot);
  const changedFiles: string[] = [];
  const drift: string[] = [];
  let fragmentCount = 0;

  for (const markdownFile of files) {
    const original = await readFile(markdownFile, "utf8");
    const replacements: FragmentReplacement[] = [];
    const fragments = [...original.matchAll(documentFragmentPattern)];
    const markerCount =
      original.match(/<!-- source-fragment:/gu)?.length ?? 0;
    if (fragments.length !== markerCount) {
      throw new TypeError(
        `${relativePath(normalizedRoot, markdownFile)} contains a malformed source-fragment marker or fence`,
      );
    }

    for (const fragment of fragments) {
      fragmentCount += 1;
      const sourceReference = capturedGroup(fragment, 1);
      const fragmentId = capturedGroup(fragment, 2);
      const documentBody = normalizeFragment(capturedGroup(fragment, 4));
      const sourcePath = resolveSourcePath(
        normalizedRoot,
        sourceReference,
      );
      const sourceBody = normalizeFragment(
        extractTaggedRegion(
          await readFile(sourcePath, "utf8"),
          fragmentId,
          sourceReference,
        ),
      );
      if (sourceBody === documentBody) {
        continue;
      }
      const identity = `${sourceReference}#${fragmentId}`;
      if (!write) {
        drift.push(identity);
        continue;
      }
      const bodyIndices = fragment.indices?.[4];
      if (bodyIndices === undefined) {
        throw new TypeError(`Cannot locate the fence body for ${identity}`);
      }
      replacements.push({
        start: bodyIndices[0],
        end: bodyIndices[1],
        body: sourceBody,
      });
    }

    if (replacements.length > 0) {
      let synchronized = original;
      for (const replacement of replacements.toReversed()) {
        synchronized =
          synchronized.slice(0, replacement.start) +
          replacement.body +
          synchronized.slice(replacement.end);
      }
      await writeFile(markdownFile, synchronized);
      changedFiles.push(relativePath(normalizedRoot, markdownFile));
    }
  }

  if (drift.length > 0) {
    throw new TypeError(
      `Markdown code fragment ${drift.join(", ")} has drifted from its tagged source region. Run \`./scripts/pnpm.sh run sync:doc-fragments\`.`,
    );
  }

  return { fragmentCount, changedFiles };
}

/**
 * Reads a capture group that the fragment pattern always fills.
 *
 * Every group in `documentFragmentPattern` is mandatory, so an absent group is
 * a pattern defect rather than a document defect.
 */
function capturedGroup(match: RegExpExecArray, group: number): string {
  const value = match[group];
  if (value === undefined) {
    throw new TypeError(
      `The source-fragment pattern did not capture group ${group}`,
    );
  }
  return value;
}

function resolveSourcePath(
  projectRoot: string,
  sourceReference: string,
): string {
  const sourcePath = path.resolve(projectRoot, sourceReference);
  if (
    sourcePath === projectRoot ||
    !sourcePath.startsWith(`${projectRoot}${path.sep}`)
  ) {
    throw new TypeError(
      `Source fragment path ${sourceReference} must stay inside the project root`,
    );
  }
  return sourcePath;
}

function extractTaggedRegion(
  source: string,
  fragmentId: string,
  sourceReference: string,
): string {
  const escapedId = escapeRegularExpression(fragmentId);
  const startPattern = new RegExp(
    `^\\s*(?://|--|#)\\s*tag::${escapedId}\\[\\]\\s*$`,
    "u",
  );
  const endPattern = new RegExp(
    `^\\s*(?://|--|#)\\s*end::${escapedId}\\[\\]\\s*$`,
    "u",
  );
  const lines = source.split(/\r?\n/u);
  const starts: number[] = [];
  const ends: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (startPattern.test(line)) {
      starts.push(index);
    }
    if (endPattern.test(line)) {
      ends.push(index);
    }
  }
  const start = starts[0];
  const end = ends[0];
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    end <= start
  ) {
    throw new TypeError(
      `${sourceReference} must contain exactly one ordered tag::${fragmentId}[] / end::${fragmentId}[] region`,
    );
  }
  return lines.slice(start + 1, end).join("\n");
}

function normalizeFragment(fragment: string): string {
  const lines = fragment.split(/\r?\n/u);
  while (lines[0]?.trim().length === 0) {
    lines.shift();
  }
  while (lines.at(-1)?.trim().length === 0) {
    lines.pop();
  }
  const indentation = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */u)?.[0].length ?? 0);
  const commonIndentation =
    indentation.length === 0 ? 0 : Math.min(...indentation);
  return lines
    .map((line) =>
      line.trim().length === 0
        ? ""
        : line.slice(commonIndentation).trimEnd()
    )
    .join("\n");
}

async function discoverMarkdownFiles(projectRoot: string): Promise<string[]> {
  const files = [path.join(projectRoot, "README.md")];
  await collectMarkdownFiles(
    path.join(projectRoot, "docs"),
    files,
    new Set(["reference"]),
  );
  return files;
}

async function collectMarkdownFiles(
  directory: string,
  files: string[],
  excludedDirectories: ReadonlySet<string>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        await collectMarkdownFiles(
          entryPath,
          files,
          excludedDirectories,
        );
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function relativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (
    arguments_.length > 1 ||
    (arguments_.length === 1 && arguments_[0] !== "--write")
  ) {
    throw new TypeError(
      "Usage: node scripts/markdown-code-fragments.ts [--write]",
    );
  }
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = arguments_[0] === "--write"
    ? await syncMarkdownCodeFragments({ projectRoot })
    : await checkMarkdownCodeFragments({ projectRoot });
  const action = arguments_[0] === "--write" ? "Synchronized" : "Checked";
  process.stdout.write(
    `${action} ${result.fragmentCount} Markdown code fragments` +
    `${result.changedFiles.length === 0 ? "" : ` in ${result.changedFiles.join(", ")}`}.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
