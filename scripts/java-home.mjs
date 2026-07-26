import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveJavaHome(options = {}) {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const javaMajorVersion =
    options.javaMajorVersion ?? defaultJavaMajorVersion;
  const resolveMacJavaHome =
    options.resolveMacJavaHome ?? defaultMacJavaHome;
  const resolvePathJava =
    options.resolvePathJava ?? defaultPathJava;

  const configured = environment.BPMN_JAVA_HOME;
  if (configured !== undefined && configured.length > 0) {
    requireJavaHome(
      configured,
      "BPMN_JAVA_HOME",
      exists,
      javaMajorVersion,
    );
    return configured;
  }

  const hostJavaHome = environment.JAVA_HOME;
  if (
    hostJavaHome !== undefined &&
    hostJavaHome.length > 0 &&
    isJava21Home(hostJavaHome, exists, javaMajorVersion)
  ) {
    return hostJavaHome;
  }

  if (platform === "darwin") {
    const discovered = resolveMacJavaHome();
    if (
      discovered !== undefined &&
      isJava21Home(discovered, exists, javaMajorVersion)
    ) {
      return discovered;
    }
  }

  const platformCandidates =
    platform === "darwin"
      ? [
          "/opt/homebrew/opt/openjdk@21",
          "/usr/local/opt/openjdk@21",
        ]
      : [
          "/usr/lib/jvm/java-21-openjdk-amd64",
          "/usr/lib/jvm/java-21-openjdk-arm64",
        ];
  const candidate = platformCandidates.find(
    (home) => isJava21Home(home, exists, javaMajorVersion),
  );
  if (candidate !== undefined) {
    return candidate;
  }

  const javaExecutable = resolvePathJava();
  if (javaExecutable !== undefined) {
    const derived = path.dirname(path.dirname(javaExecutable));
    if (isJava21Home(derived, exists, javaMajorVersion)) {
      return derived;
    }
  }

  throw new Error(
    "Java 21 home was not found; set BPMN_JAVA_HOME or JAVA_HOME",
  );
}

function requireJavaHome(
  home,
  variable,
  exists,
  javaMajorVersion,
) {
  if (!exists(path.join(home, "bin", "java"))) {
    throw new Error(`${variable} does not contain bin/java: ${home}`);
  }
  const majorVersion = javaMajorVersion(home);
  if (majorVersion !== 21) {
    throw new Error(
      `${variable} must identify Java 21, found ${majorVersion ?? "unknown"}: ${home}`,
    );
  }
}

function isJava21Home(home, exists, javaMajorVersion) {
  return (
    exists(path.join(home, "bin", "java")) &&
    javaMajorVersion(home) === 21
  );
}

function defaultMacJavaHome() {
  try {
    return execFileSync(
      "/usr/libexec/java_home",
      ["-v", "21"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return undefined;
  }
}

function defaultPathJava() {
  try {
    const executable = execFileSync(
      "/usr/bin/env",
      ["sh", "-c", "command -v java"],
      { encoding: "utf8" },
    ).trim();
    return executable.length === 0
      ? undefined
      : realpathSync(executable);
  } catch {
    return undefined;
  }
}

function defaultJavaMajorVersion(home) {
  const result = spawnSync(
    path.join(home, "bin", "java"),
    ["-version"],
    { encoding: "utf8" },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = /version "(?:1\.)?(\d+)/u.exec(output);
  return match === null
    ? undefined
    : Number.parseInt(match[1], 10);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${resolveJavaHome()}\n`);
}
