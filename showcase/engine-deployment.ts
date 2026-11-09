/**
 * The engine deployment a showcase platform runs against (`PLATFORM_ENGINE_DEPLOYMENT_JSON`, decoded by
 * `platform/foundation/engine-gateway/src/engine-deployment.ts`).
 *
 * A showcase starts its own host Worker, so the deployment describes that Worker rather than an operator's: the
 * repository's complete profile catalog, each profile selecting the relations its `profile.json` names, and every
 * capability served, because the host Workflow serves Timers, Messages, effects and User Tasks itself and runs Call
 * Activities inside the one kernel instance. Only the module's location ties it to the repository's `profiles/`.
 */
import { readFileSync, readdirSync } from "node:fs";

const profilesDirectory = new URL("../profiles/", import.meta.url);

/** The Activity start-to-close bound; it exceeds the showcase Workers' 5 s Script Task bound. */
const effectStartToCloseMs = 30_000;

export type ShowcaseEngineDeployment = Readonly<{
  profiles: Readonly<Record<string, readonly string[]>>;
  servedRequirements: Readonly<Record<"timers" | "messages" | "effects" | "userTasks" | "calls", boolean>>;
  effectStartToCloseMs: number;
}>;

export function showcaseEngineDeployment(): ShowcaseEngineDeployment {
  const profiles: Record<string, readonly string[]> = {};
  for (const entry of readdirSync(profilesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profile: unknown = JSON.parse(readFileSync(new URL(`${entry.name}/profile.json`, profilesDirectory), "utf8"));
    profiles[entry.name] = profileRelations(profile, entry.name);
  }
  return {
    profiles,
    servedRequirements: { timers: true, messages: true, effects: true, userTasks: true, calls: true },
    effectStartToCloseMs,
  };
}

/** The platform's environment variable carrying {@link showcaseEngineDeployment}. */
export function showcaseEngineDeploymentEnvironment(): Readonly<{ PLATFORM_ENGINE_DEPLOYMENT_JSON: string }> {
  return { PLATFORM_ENGINE_DEPLOYMENT_JSON: JSON.stringify(showcaseEngineDeployment()) };
}

function profileRelations(profile: unknown, directory: string): readonly string[] {
  const record = profile as { id?: unknown; bpmn?: { relationships?: unknown } } | null;
  const relationships = record?.bpmn?.relationships;
  if (
    record?.id !== directory || !Array.isArray(relationships) ||
    !relationships.every((relation): relation is string => typeof relation === "string")
  ) {
    throw new TypeError(`profiles/${directory}/profile.json must name its directory and list its relations`);
  }
  return relationships;
}
