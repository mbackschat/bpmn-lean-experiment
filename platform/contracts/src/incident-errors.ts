import { PublicApiErrorCode } from "./definitions.js";
import type { PublicApiErrorResponse } from "./definitions.js";

export const IncidentSnapshotUnavailableMessage =
  "The current incident snapshot is unavailable.";

export type IncidentListApiErrorCode =
  | typeof PublicApiErrorCode.InvalidRequest
  | typeof PublicApiErrorCode.MethodNotAllowed
  | typeof PublicApiErrorCode.Forbidden
  | typeof PublicApiErrorCode.IncidentSnapshotUnavailable
  | typeof PublicApiErrorCode.InternalFailure;

export const IncidentListApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.IncidentSnapshotUnavailable,
  PublicApiErrorCode.InternalFailure,
] as const satisfies readonly IncidentListApiErrorCode[];

export type IncidentDetailApiErrorCode =
  | IncidentListApiErrorCode
  | typeof PublicApiErrorCode.NotFound;

export const IncidentDetailApiErrorCodes = [
  ...IncidentListApiErrorCodes,
  PublicApiErrorCode.NotFound,
] as const satisfies readonly IncidentDetailApiErrorCode[];

export type IncidentActionApiErrorCode =
  | typeof PublicApiErrorCode.InvalidRequest
  | typeof PublicApiErrorCode.MethodNotAllowed
  | typeof PublicApiErrorCode.UnsupportedMediaType
  | typeof PublicApiErrorCode.PayloadTooLarge
  | typeof PublicApiErrorCode.Conflict
  | typeof PublicApiErrorCode.Forbidden
  | typeof PublicApiErrorCode.IncidentSnapshotUnavailable
  | typeof PublicApiErrorCode.InternalFailure;

export const IncidentActionApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.UnsupportedMediaType,
  PublicApiErrorCode.PayloadTooLarge,
  PublicApiErrorCode.Conflict,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.IncidentSnapshotUnavailable,
  PublicApiErrorCode.InternalFailure,
] as const satisfies readonly IncidentActionApiErrorCode[];

export type IncidentAuditApiErrorCode =
  | typeof PublicApiErrorCode.InvalidRequest
  | typeof PublicApiErrorCode.MethodNotAllowed
  | typeof PublicApiErrorCode.Forbidden
  | typeof PublicApiErrorCode.InternalFailure;

export const IncidentAuditApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.InternalFailure,
] as const satisfies readonly IncidentAuditApiErrorCode[];

export type IncidentListApiErrorResponse =
  PublicApiErrorResponse<IncidentListApiErrorCode>;
export type IncidentDetailApiErrorResponse =
  PublicApiErrorResponse<IncidentDetailApiErrorCode>;
export type IncidentActionApiErrorResponse =
  PublicApiErrorResponse<IncidentActionApiErrorCode>;
export type IncidentAuditApiErrorResponse =
  PublicApiErrorResponse<IncidentAuditApiErrorCode>;
