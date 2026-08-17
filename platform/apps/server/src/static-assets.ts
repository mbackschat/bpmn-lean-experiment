import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { PlatformHttpRoute } from "./http-adapter.js";

const immutableAssetPattern = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/u;

const contentTypes = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

/** Creates a terminal GET/HEAD route for one immutable web build directory. */
export function createStaticAssetsRoute(rootDirectory: string): PlatformHttpRoute {
  if (rootDirectory.length === 0) {
    throw new TypeError("static asset root must be a nonempty path");
  }
  const configuredRoot = resolve(rootDirectory);
  const realRoot = realpath(configuredRoot);

  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return null;
    const pathname = decodePathname(request.url);
    if (pathname === null || isApiPath(pathname)) return null;

    const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
    const direct = await readContainedFile(realRoot, requestedPath);
    if (direct !== null) return fileResponse(request.method, requestedPath, direct);
    if (!isSpaPath(pathname)) return null;

    const index = await readContainedFile(realRoot, "index.html");
    return index === null ? null : fileResponse(request.method, "index.html", index);
  };
}

function decodePathname(url: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    if (
      !pathname.startsWith("/")
      || pathname.includes("\0")
      || pathname.includes("\\")
    ) {
      return null;
    }
    const segments = pathname.split("/");
    return segments.some((segment) => segment === "." || segment === "..")
      ? null
      : pathname;
  } catch {
    return null;
  }
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isSpaPath(pathname: string): boolean {
  if (pathname === "/assets" || pathname.startsWith("/assets/")) return false;
  return pathname === "/" || extname(pathname) === "";
}

async function readContainedFile(
  realRoot: Promise<string>,
  relativePath: string,
): Promise<Buffer | null> {
  try {
    const root = await realRoot;
    const candidate = resolve(root, relativePath);
    if (!isContained(root, candidate)) return null;
    const resolvedFile = await realpath(candidate);
    if (!isContained(root, resolvedFile)) return null;
    const metadata = await stat(resolvedFile);
    return metadata.isFile() ? await readFile(resolvedFile) : null;
  } catch (error: unknown) {
    if (isMissingOrNotDirectory(error)) return null;
    throw error;
  }
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
}

function isMissingOrNotDirectory(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

function fileResponse(
  method: string,
  relativePath: string,
  contents: Buffer,
): Response {
  const headers = new Headers({
    "cache-control": cacheControl(relativePath),
    "content-length": String(contents.byteLength),
    "content-type": contentTypes.get(extname(relativePath).toLowerCase())
      ?? "application/octet-stream",
  });
  return new Response(method === "HEAD" ? null : contents, { headers });
}

function cacheControl(relativePath: string): string {
  return relativePath.startsWith("assets/")
    && immutableAssetPattern.test(basename(relativePath))
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}
