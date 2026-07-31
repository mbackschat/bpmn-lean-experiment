import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

export const externalCreateDocumentSha256 =
  "77d1c5c5f0d5ffb901e5a1cdad463fd6cb7c8c89e8b762540b2f22548711564a";

type BoundaryFile = {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly symlinkTarget?: string;
};

const dependencyManifestNames = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pom.xml",
]);

const inspectedExtensions = new Set([
  ".bpmn",
  ".cjs",
  ".gradle",
  ".java",
  ".js",
  ".json",
  ".kt",
  ".kts",
  ".lean",
  ".mjs",
  ".properties",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
]);

const lowerSemanticRoots = [
  "BpmnSemantics/",
  "packages/semantic-core/",
  "packages/temporal-adapter/",
];

const downstreamBeanIdentities = [
  "createDocumentDelegate",
  "createRelationshipLinkDelegate",
  "deleteRelationshipLinkDelegate",
  "exportDocumentDelegate",
  "relinkDocumentDelegate",
  "sendEmailDelegate",
  "setDocumentFieldDelegate",
  "setStatusDelegate",
  "syncAvailableFieldsDelegate",
];

const a12SourceHeaderPatterns = [
  new RegExp(
    ["SPDX-License-Identifier:", "\\s*EUPL-1\\.2"].join(""),
    "iu",
  ),
  new RegExp(
    ["This source file is part of the mgm ", "A12 Platform"].join(""),
    "iu",
  ),
  new RegExp(
    ["European Union Public Licen[cs]e,", "\\s*version 1\\.2"].join(""),
    "iu",
  ),
];

function isDependencyManifest(relativePath: string): boolean {
  const basename = path.posix.basename(relativePath);
  return (
    dependencyManifestNames.has(basename) ||
    basename.endsWith(".gradle") ||
    basename.endsWith(".gradle.kts")
  );
}

function isInspectedFile(relativePath: string): boolean {
  return (
    isDependencyManifest(relativePath) ||
    inspectedExtensions.has(path.posix.extname(relativePath))
  );
}

function containsA12SourceHeader(source: string): boolean {
  return a12SourceHeaderPatterns.some((pattern) => pattern.test(source));
}

function containsA12Coordinate(source: string): boolean {
  return (
    /@com\.mgmtp\.a12(?:[./-]|\b)/u.test(source) ||
    /\bcom\.mgmtp\.a12(?:[.:/-]|\b)/u.test(source)
  );
}

function isLowerSemanticFile(relativePath: string): boolean {
  return lowerSemanticRoots.some((root) => relativePath.startsWith(root));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assessA12Boundary(
  files: ReadonlyArray<BoundaryFile>,
): ReadonlyArray<string> {
  const violations: string[] = [];

  for (const file of files) {
    const source = Buffer.from(file.bytes).toString("utf8");

    if (
      path.posix.extname(file.path) !== ".md" &&
      containsA12SourceHeader(source)
    ) {
      violations.push(`${file.path}: A12/EUPL source header`);
    }
    if (isDependencyManifest(file.path) && containsA12Coordinate(source)) {
      violations.push(`${file.path}: A12 package or build coordinate`);
    }
    if (
      file.path.endsWith(".bpmn") &&
      sha256(file.bytes) === externalCreateDocumentSha256
    ) {
      violations.push(
        `${file.path}: exact external A12 CreateDocument fixture bytes`,
      );
    }
    if (
      file.symlinkTarget !== undefined &&
      /(?:a12-workflows|a12-full-stack)/u.test(file.symlinkTarget)
    ) {
      violations.push(`${file.path}: link into an external A12 checkout`);
    }
    if (isLowerSemanticFile(file.path)) {
      for (const beanIdentity of downstreamBeanIdentities) {
        if (source.includes(beanIdentity)) {
          violations.push(
            `${file.path}: downstream A12 bean identity ${beanIdentity}`,
          );
        }
      }
    }
  }

  return violations.sort();
}

function repositoryPaths(projectRoot: string): Promise<ReadonlyArray<string>> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: projectRoot,
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(
          Buffer.from(stdout)
            .toString("utf8")
            .split("\0")
            .filter(Boolean)
            .sort(),
        );
      },
    );
  });
}

export async function repositoryBoundaryFiles(
  projectRoot: string,
): Promise<ReadonlyArray<BoundaryFile>> {
  const candidates = (
    await Promise.all(
      (await repositoryPaths(projectRoot)).map(async (relativePath) => {
        const fileStatus = await lstat(path.join(projectRoot, relativePath));
        return fileStatus.isSymbolicLink() || isInspectedFile(relativePath)
          ? [{ relativePath, isSymbolicLink: fileStatus.isSymbolicLink() }]
          : [];
      }),
    )
  ).flat();

  return Promise.all(
    candidates.map(async ({ relativePath, isSymbolicLink }) => {
      const absolutePath = path.join(projectRoot, relativePath);
      if (isSymbolicLink) {
        return {
          path: relativePath,
          bytes: Buffer.alloc(0),
          symlinkTarget: await readlink(absolutePath),
        };
      }
      return {
        path: relativePath,
        bytes: await readFile(absolutePath),
      };
    }),
  );
}
