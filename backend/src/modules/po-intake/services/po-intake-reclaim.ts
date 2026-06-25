/**
 * Pure eligibility check extracted for re-claim hotfix (used by PoIntakeService.takeOwnership).
 */

export function evaluatePoIntakeReclaimEligibility(input: {
  intakeStatus: string;
  linkedShipments: { current_status: string }[];
  totalPoQty: number;
  totalReceived: number;
}): { allowed: boolean } {
  if (input.intakeStatus === "NEW_PO_DETECTED") {
    return { allowed: true };
  }

  const allDelivered =
    input.linkedShipments.length > 0 &&
    input.linkedShipments.every((s) => s.current_status === "DELIVERED");
  const hasRemaining = input.totalPoQty > 0 && input.totalReceived < input.totalPoQty;

  return { allowed: allDelivered && hasRemaining };
}
