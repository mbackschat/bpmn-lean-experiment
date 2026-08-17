const maximumWorkAuditDeliveryBatchSize = 1_000;

export function requireWorkAuditDeliveryLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumWorkAuditDeliveryBatchSize) {
    throw new RangeError(
      `Work audit delivery limit must be an integer from 1 through ${maximumWorkAuditDeliveryBatchSize}`,
    );
  }
  return limit;
}
