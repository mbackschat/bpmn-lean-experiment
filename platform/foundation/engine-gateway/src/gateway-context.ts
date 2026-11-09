/**
 * What every gateway collaborator shares: the source limits, the engine host of the deployment, and the profile
 * catalog that turns a stored profile identifier into the relation identifiers the engine compiles with.
 */
import type {
  EngineBinding,
  EngineDefinitionIdentity,
  EngineHost,
  EngineLimits,
  EngineProfile,
  EngineSourceIdentity,
  EngineSourceOverlayIdentity,
} from "@bpmn-lean/engine-api";
import type {
  ExactPublicSourceIdentity,
  PublicationDefinitionIdentity,
  VariableBinding as PlatformVariableBinding,
} from "@bpmn-lean/platform-contracts";

/** The relation identifiers of a profile, `null` for a profile the deployment's catalog does not hold. */
export type ProfileRelations = (profileId: string) => readonly string[] | null;

export type GatewayContext = Readonly<{
  limits: EngineLimits;
  host: EngineHost;
  profileRelations: ProfileRelations;
}>;

export type GatewayLimits = Readonly<{ maxSourceBytes: number; parserDeadlineMs: number }>;

export function gatewayContext(limits: GatewayLimits, host: EngineHost, profileRelations: ProfileRelations): GatewayContext {
  requirePositiveSafeInteger(limits.maxSourceBytes, "maxSourceBytes");
  requirePositiveSafeInteger(limits.parserDeadlineMs, "parserDeadlineMs");
  return {
    limits: { maxBytes: limits.maxSourceBytes, parserDeadlineMs: limits.parserDeadlineMs },
    host,
    profileRelations,
  };
}

/** The profile as data, or `null` when the catalog does not hold it. */
export function resolveProfile(context: GatewayContext, profileId: string): EngineProfile | null {
  const relations = context.profileRelations(profileId);
  return relations === null ? null : { id: profileId, relations: [...relations] };
}

/** A stored definition names its profile; one missing from the catalog is a deployment fault, not a verdict. */
export function storedProfile(context: GatewayContext, profileId: string): EngineProfile {
  const profile = resolveProfile(context, profileId);
  if (profile === null) throw new TypeError(`The profile catalog does not hold ${profileId}`);
  return profile;
}

/** Product 2's view of a definition's identity. */
export type DefinitionIdentity = Readonly<{
  processId: string;
  semanticProfile: string;
  sourceOverlay: EngineSourceOverlayIdentity | null;
}>;

export function platformIdentity(identity: EngineDefinitionIdentity): DefinitionIdentity {
  return { processId: identity.ref.definitionKey, semanticProfile: identity.profile, sourceOverlay: identity.sourceOverlay };
}

/** Product 2's record of the exact source bytes the engine compiled. */
export function platformSource(source: EngineSourceIdentity): ExactPublicSourceIdentity {
  return {
    kind: "bpmnSource",
    id: source.id,
    sha256: source.sha256,
    byteLength: source.byteLength,
    declaredEncoding: source.declaredEncoding,
    decodedAs: source.decodedAs,
  };
}

/** The engine identity a publication names: Product 2 carries the engine's identity shape unchanged. */
export function engineDefinitionIdentity(identity: PublicationDefinitionIdentity): EngineDefinitionIdentity {
  return {
    ref: { definitionKey: identity.ref.definitionKey, version: identity.ref.version, sha256: identity.ref.sha256 },
    profile: identity.profile,
    sourceOverlay: identity.sourceOverlay === null ? null : { id: identity.sourceOverlay.id, sha256: identity.sourceOverlay.sha256 },
  };
}

/** Product 2's value arms are a subset of the engine's, in the same wire form. */
export function engineBindings(bindings: readonly PlatformVariableBinding[]): readonly EngineBinding[] {
  return bindings.map(({ name, value }) => ({ name, value: structuredClone(value) as EngineBinding["value"] }));
}

export function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}

export function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must not be empty`);
}
