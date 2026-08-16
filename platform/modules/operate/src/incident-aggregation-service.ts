import { comparePublicIncidents } from "@bpmn-lean/platform-contracts";

import type {
  CurrentIncident,
  IncidentOperationsGateway,
  IncidentSnapshot,
  OperateProcessRegistration,
} from "./incident-contracts.js";
import { IncidentSnapshotUnavailableError } from "./incident-contracts.js";
import type { ProcessInstanceRepository } from "./contracts.js";
import {
  requirePositiveSafeInteger,
  snapshotObservationResult,
} from "./incident-values.js";

const defaultMaxRegistrations = 100;
const defaultMaxIncidents = 1_000;

export type IncidentAggregationServiceOptions = Readonly<{
  repository: ProcessInstanceRepository;
  gateway: Pick<IncidentOperationsGateway, "observeIncidents">;
  maxRegistrations?: number;
  maxIncidents?: number;
}>;

/** Freshly projects one complete current snapshot over every nonclosed registration. */
export class IncidentAggregationService {
  readonly #repository: ProcessInstanceRepository;
  readonly #gateway: Pick<IncidentOperationsGateway, "observeIncidents">;
  readonly #maxRegistrations: number;
  readonly #maxIncidents: number;

  constructor(options: IncidentAggregationServiceOptions) {
    this.#repository = options.repository;
    this.#gateway = options.gateway;
    this.#maxRegistrations = requirePositiveSafeInteger(
      options.maxRegistrations ?? defaultMaxRegistrations,
      "maxRegistrations",
    );
    this.#maxIncidents = requirePositiveSafeInteger(
      options.maxIncidents ?? defaultMaxIncidents,
      "maxIncidents",
    );
  }

  async currentSnapshot(): Promise<IncidentSnapshot> {
    const registrations = await this.#repository.listNonclosed(
      this.#maxRegistrations + 1,
    );
    if (registrations.length > this.#maxRegistrations) {
      throw new IncidentSnapshotUnavailableError();
    }
    const incidents: CurrentIncident[] = [];
    let incomplete = false;
    let firstCause: unknown;
    for (const registration of registrations) {
      try {
        const result = snapshotObservationResult(
          await this.#gateway.observeIncidents({
            locator: registration.locator,
            hostingProcessInstanceId: registration.instance.processInstanceId,
          }),
          registration.instance.processInstanceId,
        );
        switch (result.status) {
          case "observed":
            await this.#repository.recordObservation(
              registration.instance.processInstanceId,
              "active",
            );
            for (const published of result.incidents) {
              incidents.push({
                hostingInstance: structuredClone(registration.instance),
                incident: structuredClone(published.incident),
                availableInteractions: structuredClone(published.interactions),
              });
            }
            break;
          case "closed":
            await this.#repository.recordObservation(
              registration.instance.processInstanceId,
              "closed",
            );
            break;
          case "unknown":
          case "unavailable":
            await this.#repository.recordObservation(
              registration.instance.processInstanceId,
              "indeterminate",
            );
            incomplete = true;
            break;
        }
      } catch (error: unknown) {
        await this.#repository.recordObservation(
          registration.instance.processInstanceId,
          "indeterminate",
        );
        incomplete = true;
        firstCause ??= error;
      }
    }
    if (incidents.length > this.#maxIncidents || incomplete) {
      throw new IncidentSnapshotUnavailableError(firstCause);
    }
    incidents.sort(comparePublicIncidents);
    return { incidents };
  }

  async registration(
    processInstanceId: string,
  ): Promise<OperateProcessRegistration | null> {
    const registration = await this.#repository.getRegistration(processInstanceId);
    return registration === null ? null : structuredClone(registration);
  }
}
