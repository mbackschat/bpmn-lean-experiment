import { GatewayDirection } from "@bpmn-lean/semantic-core";

type DeclaredGatewayDirection = GatewayDirection | "unspecified" | "mixed";

export function decodeDeclaredGatewayDirection(
  value: unknown,
): DeclaredGatewayDirection | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  switch (value) {
    case "Unspecified":
      return "unspecified";
    case "Converging":
      return GatewayDirection.Converging;
    case "Diverging":
      return GatewayDirection.Diverging;
    case "Mixed":
      return "mixed";
    default:
      return undefined;
  }
}

export function declaredGatewayDirectionMatches(
  value: unknown,
  direction: GatewayDirection,
): boolean {
  if (value === undefined) {
    return true;
  }
  const declared = decodeDeclaredGatewayDirection(value);
  return declared === direction || declared === "unspecified";
}
