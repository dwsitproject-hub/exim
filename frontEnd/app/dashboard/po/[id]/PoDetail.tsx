"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  getPoDetail,
  getPoActivityLog,
  takeOwnership,
  createShipmentFromPo,
  couplePoToShipment,
} from "@/services/po-service";
import { Card } from "@/components/cards";
import { LoadingSkeleton } from "@/components/feedback";
import { Badge } from "@/components/badges";
import { Modal } from "@/components/overlays";
import { PageHeader } from "@/components/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from "@/components/tables";
import { Button } from "@/components/forms";
import { useToast } from "@/components/providers/ToastProvider";
import { intakeStatusToBadgeVariant, statusToBadgeVariant, formatStatusLabel } from "@/lib/status-badge";
import { formatPoStatusLabel } from "@/lib/po-status-label";
import { formatDecimal, formatPoUnitPrice } from "@/lib/format-number";
import { formatPoLineQtyDisplay } from "@/lib/po-line-qty";
import { formatDateTime, formatDayMonthYear } from "@/lib/format-date";
import { ActivityLogRibbonIcon } from "@/components/icons/ActivityLogRibbonIcon";
import { formatYesNoOrLegacy } from "@/lib/yes-no-field";
import { can } from "@/lib/permissions";
import { anyLinkedShipmentBlocksPoEdit, PO_EDIT_BLOCKED_BY_SHIPMENT_MESSAGE } from "@/lib/po-shipment-edit-lock";
import { isApiError } from "@/types/api";
import type { PoDetail as PoDetailType, PoIntakeActivityItem } from "@/types/po";
import { listShipments, softDeleteShipment } from "@/services/shipments-service";
import type { ShipmentListItem } from "@/types/shipments";
import styles from "./PoDetail.module.css";

function poActivityTypeLabel(type: PoIntakeActivityItem["type"]): string {
  switch (type) {
    case "po_created":
      return "Created";
    case "po_claimed":
      return "Claimed";
    case "couple_shipment":
      return "Shipment linked";
    case "decouple_shipment":
      return "Shipment unlinked";
    case "po_updated":
      return "Update";
    default:
      return "Activity";
  }
}

function renderPoActivityValue(value: string | null | undefined): string {
  if (value == null) return "—";
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

function normalizeGroupField(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function lineTotalAmount(qty: number | null | undefined, valuePerUnit: number | null | undefined): number | null {
  if (qty == null || valuePerUnit == null) return null;
  const n = qty * valuePerUnit;
  return Number.isFinite(n) ? n : null;
}

export function PoDetail({ id }: { id: string }) {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [detail, setDetail] = useState<PoDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [coupleModal, setCoupleModal] = useState(false);
  const [coupleShipmentId, setCoupleShipmentId] = useState("");
  const [coupling, setCoupling] = useState(false);
  const [coupleShipmentsList, setCoupleShipmentsList] = useState<ShipmentListItem[]>([]);
  const [coupleShipmentsLoading, setCoupleShipmentsLoading] = useState(false);
  const [coupleShipmentsError, setCoupleShipmentsError] = useState<string | null>(null);
  const [creatingAnotherShipment, setCreatingAnotherShipment] = useState(false);
  const [createAnotherConfirmOpen, setCreateAnotherConfirmOpen] = useState(false);
  const [removeShipmentId, setRemoveShipmentId] = useState<string | null>(null);
  const [removingShipment, setRemovingShipment] = useState(false);
  const [expandedLinkedShipmentIds, setExpandedLinkedShipmentIds] = useState<Set<string>>(() => new Set());
  const [portalMounted, setPortalMounted] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<PoIntakeActivityItem[]>([]);
  const { pushToast } = useToast();

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const fetchActivityLog = useCallback(async () => {
    if (!accessToken || !id) return;
    setActivityLoading(true);
    setActivityError(null);
    const res = await getPoActivityLog(id, accessToken);
    if (isApiError(res)) {
      setActivityError(res.message);
      setActivityItems([]);
    } else {
      setActivityItems(res.data?.items ?? []);
    }
    setActivityLoading(false);
  }, [accessToken, id]);

  const openActivityPanel = useCallback(() => {
    setActivityPanelOpen(true);
    void fetchActivityLog();
  }, [fetchActivityLog]);

  const closeActivityPanel = useCallback(() => {
    setActivityPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!activityPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActivityPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activityPanelOpen, closeActivityPanel]);

  function toggleLinkedShipmentLines(shipmentId: string) {
    setExpandedLinkedShipmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  }

  const load = useCallback(() => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    getPoDetail(id, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setError(res.message);
          return;
        }
        setDetail(res.data ?? null);
      })
      .catch(() => setError("Failed to load Purchase Order"))
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!coupleModal || !accessToken) return;
    let cancelled = false;
    setCoupleShipmentsLoading(true);
    setCoupleShipmentsError(null);
    listShipments({ limit: 100 }, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (isApiError(res)) {
          setCoupleShipmentsError(res.message);
          setCoupleShipmentsList([]);
          return;
        }
        setCoupleShipmentsList(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setCoupleShipmentsError("Failed to load shipments");
          setCoupleShipmentsList([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCoupleShipmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coupleModal, accessToken]);

  const eligibleCoupleShipments = useMemo(() => {
    if (!detail) return [];
    const linkedIds = new Set((detail.linked_shipments ?? []).map((s) => s.shipment_id));
    const poInco = normalizeGroupField(detail.incoterm_location);
    const poCur = normalizeGroupField(detail.currency);
    return coupleShipmentsList.filter((s) => {
      if (s.closed_at) return false;
      if (linkedIds.has(s.id)) return false;
      if (normalizeGroupField(s.incoterm) !== poInco) return false;
      const firstCur = normalizeGroupField(s.linked_pos[0]?.currency);
      if (!s.linked_pos.length || firstCur !== poCur) return false;
      for (const lp of s.linked_pos) {
        if (normalizeGroupField(lp.currency) !== poCur) return false;
      }
      return true;
    });
  }, [detail, coupleShipmentsList]);

  function handleTakeOwnership() {
    if (!accessToken || !id) return;
    if (!can(user, "TAKE_OWNERSHIP") || !can(user, "CREATE_SHIPMENT")) return;
    setActionError(null);
    setTaking(true);
    takeOwnership(id, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return null;
        }
        if (res.data) setDetail(res.data);
        pushToast("Purchase Order claimed.", "success");
        return createShipmentFromPo(id, accessToken);
      })
      .then((shipRes) => {
        if (!shipRes) return;
        if (isApiError(shipRes)) {
          setActionError(shipRes.message);
          pushToast(shipRes.message, "error");
          return;
        }
        const data = shipRes.data as { shipment_id?: string };
        if (data?.shipment_id) {
          pushToast("Shipment created from Purchase Order.", "success");
          router.push(`/dashboard/shipments/${data.shipment_id}`);
        } else {
          pushToast("Shipment created.", "success");
          load();
        }
      })
      .finally(() => setTaking(false));
  }

  function handleCoupleToShipment() {
    if (!accessToken || !id || !coupleShipmentId.trim()) return;
    if (!can(user, "COUPLE_DECOUPLE_PO")) return;
    setActionError(null);
    setCoupling(true);
    couplePoToShipment(id, coupleShipmentId.trim(), accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        setCoupleModal(false);
        setCoupleShipmentId("");
        pushToast("Purchase Order coupled to shipment.", "success");
        load();
      })
      .finally(() => setCoupling(false));
  }

  function handleConfirmRemoveLinkedShipment() {
    if (!accessToken || !removeShipmentId) return;
    const shipmentId = removeShipmentId;
    setRemovingShipment(true);
    setActionError(null);
    softDeleteShipment(shipmentId, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("Shipment removed from the active list. Linked Purchase Orders were detached.", "success");
        setExpandedLinkedShipmentIds((prev) => {
          const next = new Set(prev);
          next.delete(shipmentId);
          return next;
        });
        load();
      })
      .finally(() => {
        setRemovingShipment(false);
        setRemoveShipmentId(null);
      });
  }

  function handleCreateAnotherShipment() {
    if (!accessToken || !id) return;
    if (!can(user, "CREATE_SHIPMENT")) return;
    setCreateAnotherConfirmOpen(false);
    setActionError(null);
    setCreatingAnotherShipment(true);
    createShipmentFromPo(id, accessToken)
      .then((res) => {
        if (isApiError(res)) {
          setActionError(res.message);
          pushToast(res.message, "error");
          return;
        }
        pushToast("New shipment created and linked to this Purchase Order.", "success");
        const data = res.data as { shipment_id?: string };
        if (data?.shipment_id) {
          router.push(`/dashboard/shipments/${data.shipment_id}`);
        } else {
          load();
        }
      })
      .finally(() => setCreatingAnotherShipment(false));
  }

  if (loading) return <LoadingSkeleton lines={6} className={styles.loading} />;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!detail) return null;

  const linkedShipments = detail.linked_shipments ?? [];
  const poEditLockedByShipment = anyLinkedShipmentBlocksPoEdit(linkedShipments);
  const canEditPoIntake = can(user, "UPDATE_PO_INTAKE") && !poEditLockedByShipment;
  const allShipmentsDelivered =
    linkedShipments.length > 0 &&
    linkedShipments.every((s) => s.current_status === "DELIVERED");
  const hasRemainingQty = (detail.items ?? []).some(
    (i) => (i.remaining_qty ?? 0) > 0
  );
  const st = detail.intake_status;
  const canTakeAgain = allShipmentsDelivered && hasRemainingQty;
  const canTake = st === "NEW_PO_DETECTED" || canTakeAgain;
  /** Create / couple from PO page without requiring claim first (grouping can start while status is NEW_PO_DETECTED). */
  const canCreateOrCouple = st !== "FULFILLED";
  /** Matches POST /po/:id/take then POST /po/:id/create-shipment (both permissions required for current flow). */
  const canClaimAndCreateShipment =
    can(user, "TAKE_OWNERSHIP") && can(user, "CREATE_SHIPMENT");
  const canCoupleToShipment = can(user, "COUPLE_DECOUPLE_PO");
  /** Second (or later) new shipment while links already exist — same API as first leg after Claim. */
  const canCreateAnotherShipment =
    canCreateOrCouple && can(user, "CREATE_SHIPMENT") && linkedShipments.length > 0;
  const canRemoveLinkedShipment = can(user, "UPDATE_SHIPMENT");

  /** Same field as Create PO / API `currency` (e.g. USD, IDR) — not the per-line rate. */
  const poCurrency = detail.currency?.trim() || null;

  return (
    <section className={styles.section}>
      <PageHeader
        title={detail.po_number}
        titleAddon={
          <>
            <Badge
              variant={intakeStatusToBadgeVariant(detail.intake_status)}
              className={styles.headerStatusBadge}
              data-tour="po-status-badge"
            >
              {formatPoStatusLabel(detail.intake_status)}
            </Badge>
            {st === "FULFILLED" && detail.overshipped && (
              <Badge variant="warning" className={styles.headerOvershipBadge}>
                Over-shipped
              </Badge>
            )}
          </>
        }
        subtitle={detail.supplier_name}
        backHref="/dashboard/po"
        backLabel="Purchase Order"
        sticky
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Purchase Order", href: "/dashboard/po" },
          { label: detail.po_number },
        ]}
      />

      {actionError && <p className={styles.error}>{actionError}</p>}

      <Card className={styles.cardSpacing}>
        <h2 className={styles.sectionTitle}>General information</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>PO number</span>
            <span className={styles.infoValue}>{detail.po_number}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>PT (Entity)</span>
            <span className={styles.infoValue}>{detail.pt ?? "—"}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Plant</span>
            <span className={styles.infoValue}>{detail.plant ?? "—"}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Supplier</span>
            <span className={styles.infoValue}>{detail.supplier_name}</span>
          </div>

          <div className={`${styles.infoField} ${styles.infoFieldDelivery}`}>
            <span className={styles.infoLabel}>Delivery location</span>
            <span className={`${styles.infoValue} ${styles.infoValueMultiline}`}>
              {detail.delivery_location?.trim() ? detail.delivery_location : "—"}
            </span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Incoterms</span>
            <span className={styles.infoValue}>{detail.incoterm_location ?? "—"}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Kawasan berikat</span>
            <span className={styles.infoValue}>{formatYesNoOrLegacy(detail.kawasan_berikat)}</span>
          </div>

          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Currency</span>
            <span className={styles.infoValue}>{poCurrency ?? "—"}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Detected at</span>
            <span className={styles.infoValue}>{formatDateTime(detail.created_at)}</span>
          </div>
          {detail.taken_by_name && (
            <div className={styles.infoField}>
              <span className={styles.infoLabel}>Claimed by</span>
              <span className={styles.infoValue}>{detail.taken_by_name}</span>
            </div>
          )}
        </div>

        <div className={styles.actions} data-tour="po-primary-actions">
          {can(user, "UPDATE_PO_INTAKE") && poEditLockedByShipment && (
            <p className={styles.editLockedNote}>{PO_EDIT_BLOCKED_BY_SHIPMENT_MESSAGE}</p>
          )}
          <Link href="/dashboard/po/new" className={styles.actionOutline}>
            Create Purchase Order
          </Link>
          {canTake && canClaimAndCreateShipment && (
            <Button
              type="button"
              variant="primary"
              onClick={handleTakeOwnership}
              disabled={taking}
              className={styles.actionPrimary}
            >
              {taking ? "Claiming & creating shipment…" : canTakeAgain ? "Claim again" : "Claim"}
            </Button>
          )}
          {canEditPoIntake && (
            <Link href={`/dashboard/po/${id}/edit`} className={styles.actionOutline}>
              <Pencil size={18} strokeWidth={2} aria-hidden className={styles.actionOutlineIcon} />
              Edit Purchase Order
            </Link>
          )}
          {canCreateAnotherShipment && (
            <button
              type="button"
              className={styles.actionOutline}
              data-tour="po-create-another-shipment"
              title="Split cargo or start a second voyage while the first shipment is still in progress."
              onClick={() => setCreateAnotherConfirmOpen(true)}
              disabled={creatingAnotherShipment || taking}
            >
              {creatingAnotherShipment ? "Creating shipment…" : "Create another shipment"}
            </button>
          )}
          {canCreateOrCouple && canCoupleToShipment && (
            <button
              type="button"
              className={styles.actionOutline}
              onClick={() => {
                setCoupleShipmentId("");
                setCoupleModal(true);
              }}
            >
              Couple to shipment
            </button>
          )}
          {canCreateAnotherShipment && (
            <p className={styles.multiAllocationHint}>
              This PO can stay on several active shipments at the same time—for example split cargo or a second
              booking while the first is still underway. If ship mode is Bulk on those shipments, delivered quantities
              count together toward each line&apos;s limit. To use an existing open shipment instead, choose Couple to
              shipment.
            </p>
          )}
          {canTakeAgain && (
            <span className={styles.claimAgainHint}>
              All linked shipments are delivered and there is remaining quantity. Claim again to create or couple
              another shipment.
            </span>
          )}
        </div>
      </Card>

      {detail.items.length > 0 && (
        <Card className={styles.cardSpacing}>
          <h2 className={styles.sectionTitle}>Items</h2>
          <Table wrapperClassName={styles.itemsTableSurface} className={styles.poItemsTable}>
            <TableHead>
              <TableRow>
                <TableHeaderCell className={styles.thLeft}>#</TableHeaderCell>
                <TableHeaderCell className={styles.thDesc}>Description</TableHeaderCell>
                <TableHeaderCell className={styles.thRight}>Qty</TableHeaderCell>
                <TableHeaderCell
                  className={`${styles.thRight} ${styles.thRemaining}`}
                  data-tour="po-items-remaining-header"
                >
                  Remaining qty
                </TableHeaderCell>
                <TableHeaderCell className={styles.thLeft}>Unit</TableHeaderCell>
                <TableHeaderCell className={styles.thRight}>
                  Price per unit{poCurrency ? ` (${poCurrency})` : ""}
                </TableHeaderCell>
                <TableHeaderCell className={styles.thRight}>Total amount</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.items.map((item) => {
                const hasOverReceipt = item.over_received_pct != null && item.over_received_pct > 0;
                const totalAmt = lineTotalAmount(item.qty, item.value);
                return (
                  <TableRow key={item.id} className={hasOverReceipt ? styles.rowOverReceived : undefined}>
                    <TableCell className={styles.tdLeft}>{item.line_number}</TableCell>
                    <TableCell className={styles.tdDesc}>{item.item_description ?? "—"}</TableCell>
                    <TableCell className={styles.tdRight}>{formatPoLineQtyDisplay(item.qty)}</TableCell>
                    <TableCell className={`${styles.tdRight} ${styles.tdRemaining}`}>
                      {formatPoLineQtyDisplay(item.remaining_qty)}
                      {hasOverReceipt && item.over_received_pct != null && (
                        <span className={styles.overReceivedBadge} title="Delivered more than PO quantity">
                          +{formatDecimal(item.over_received_pct)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={styles.tdLeft}>{item.unit ?? "—"}</TableCell>
                    <TableCell className={styles.tdRight}>{item.value != null ? formatPoUnitPrice(item.value) : "—"}</TableCell>
                    <TableCell className={styles.tdRight}>{totalAmt != null ? formatDecimal(totalAmt) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {(detail.linked_shipments ?? []).length > 0 && (
        <Card className={styles.cardSpacing}>
          <h2 className={styles.sectionTitle}>Shipments linked to this Purchase Order</h2>
          <p className={styles.linkedShipmentsHint}>
            One PO can link to several shipments at once. Expand a row to see quantity delivered on that shipment, by
            line.
          </p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className={styles.expandCol} aria-label="Expand line items" />
                <TableHeaderCell>Shipment</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Taken by</TableHeaderCell>
                <TableHeaderCell>Coupled at</TableHeaderCell>
                <TableHeaderCell>Actual time departure</TableHeaderCell>
                <TableHeaderCell>Actual time arrival</TableHeaderCell>
                <TableHeaderCell>Delivered at</TableHeaderCell>
                {canRemoveLinkedShipment && <TableHeaderCell className={styles.linkedShipmentActionsCol}>Actions</TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {(detail.linked_shipments ?? []).map((ship) => {
                const expanded = expandedLinkedShipmentIds.has(ship.shipment_id);
                const lines = ship.lines_received ?? [];
                return (
                  <Fragment key={ship.shipment_id}>
                    <TableRow>
                      <TableCell className={styles.expandCol}>
                        <button
                          type="button"
                          className={styles.expandLinesBtn}
                          onClick={() => toggleLinkedShipmentLines(ship.shipment_id)}
                          aria-expanded={expanded}
                          aria-controls={`po-linked-shipment-lines-${ship.shipment_id}`}
                          aria-label={
                            expanded
                              ? `Hide line items for ${ship.shipment_number}`
                              : `Show line items for ${ship.shipment_number}`
                          }
                        >
                          <span className={styles.expandLinesIcon} data-expanded={expanded}>
                            ▶
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/shipments/${ship.shipment_id}`} className={styles.shipmentLink}>
                          {ship.shipment_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusToBadgeVariant(ship.current_status)}>
                          {formatStatusLabel(ship.current_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{ship.coupled_by ?? "—"}</TableCell>
                      <TableCell>{ship.coupled_at ? formatDateTime(ship.coupled_at) : "—"}</TableCell>
                      <TableCell>{formatDayMonthYear(ship.atd)}</TableCell>
                      <TableCell>{formatDayMonthYear(ship.ata)}</TableCell>
                      <TableCell>{formatDayMonthYear(ship.delivered_at)}</TableCell>
                      {canRemoveLinkedShipment && (
                        <TableCell className={styles.linkedShipmentActionsCol}>
                          <button
                            type="button"
                            className={styles.removeLinkedShipmentBtn}
                            onClick={() => setRemoveShipmentId(ship.shipment_id)}
                          >
                            Remove
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                    {expanded && (
                      <TableRow className={styles.nestedLinesRow}>
                        <TableCell colSpan={canRemoveLinkedShipment ? 9 : 8}>
                          <div
                            id={`po-linked-shipment-lines-${ship.shipment_id}`}
                            className={styles.nestedLinesPanel}
                          >
                            {lines.length === 0 ? (
                              <p className={styles.nestedLinesEmpty}>No line quantities recorded for this shipment.</p>
                            ) : (
                              <Table wrapperClassName={styles.nestedLinesTableWrap}>
                                <TableHead>
                                  <TableRow>
                                    <TableHeaderCell>Line</TableHeaderCell>
                                    <TableHeaderCell>Description</TableHeaderCell>
                                    <TableHeaderCell>Qty delivered</TableHeaderCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {lines.map((line) => (
                                    <TableRow key={`${ship.shipment_id}-${line.item_id}`}>
                                      <TableCell>{line.line_number}</TableCell>
                                      <TableCell>{line.item_description ?? "—"}</TableCell>
                                      <TableCell>{formatPoLineQtyDisplay(line.received_qty)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal
        open={removeShipmentId != null}
        onClose={() => {
          if (!removingShipment) setRemoveShipmentId(null);
        }}
        title="Remove this shipment?"
        footer={
          <>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmRemoveLinkedShipment}
              disabled={removingShipment}
              className={styles.removeShipmentConfirmBtn}
            >
              {removingShipment ? "Removing…" : "Yes, remove shipment"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => !removingShipment && setRemoveShipmentId(null)}
              disabled={removingShipment}
            >
              Cancel
            </Button>
          </>
        }
      >
        {removeShipmentId != null && (
          <p className={styles.coupleModalHint}>
            You are about to remove this shipment. This will disconnect it from its Purchase Orders and hide it from your
            workspace. You will not be able to restore this shipment later.
          </p>
        )}
      </Modal>

      <Modal
        open={createAnotherConfirmOpen}
        onClose={() => setCreateAnotherConfirmOpen(false)}
        title="Create another shipment?"
        footer={
          <>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreateAnotherShipment}
              disabled={creatingAnotherShipment || taking}
            >
              {creatingAnotherShipment ? "Creating…" : "Create shipment"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCreateAnotherConfirmOpen(false)} disabled={creatingAnotherShipment}>
              Cancel
            </Button>
          </>
        }
      >
        <p className={styles.coupleModalHint}>
          This will generate a new shipment record linked to this Purchase Order. Use this for split cargo or secondary
          bookings.
        </p>
      </Modal>

      <Modal
        open={coupleModal}
        onClose={() => {
          setCoupleModal(false);
          setCoupleShipmentId("");
        }}
        title="Couple to shipment"
        footer={
          <>
            <Button
              type="button"
              variant="primary"
              onClick={handleCoupleToShipment}
              disabled={coupling || !coupleShipmentId.trim()}
            >
              {coupling ? "Coupling…" : "Couple"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCoupleModal(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <p className={styles.coupleModalHint}>
          Shipments below match this PO&apos;s incoterm ({detail.incoterm_location ?? "—"}) and currency (
          {poCurrency ?? "—"}), are not closed, and are not already linked to this PO — same rules as grouping
          on the server.
        </p>
        {coupleShipmentsLoading && <p className={styles.fieldValue}>Loading shipments…</p>}
        {coupleShipmentsError && <p className={styles.error}>{coupleShipmentsError}</p>}
        {!coupleShipmentsLoading && !coupleShipmentsError && eligibleCoupleShipments.length === 0 && (
          <p className={styles.fieldValue}>
            No matching open shipments found. Use Create another shipment on this PO page, paste a shipment UUID below,
            or use Claim if you have not created a shipment yet.
          </p>
        )}
        {eligibleCoupleShipments.length > 0 && (
          <ul className={styles.coupleCandidateList} aria-label="Shipments available to couple">
            {eligibleCoupleShipments.map((s) => {
              const poLabels = s.linked_pos.map((p) => p.po_number).join(", ");
              const hasNew = s.linked_pos.some((p) => p.intake_status === "NEW_PO_DETECTED");
              const selected = coupleShipmentId === s.id;
              return (
                <li key={s.id} className={styles.coupleCandidateRow}>
                  <div className={styles.coupleCandidateMain}>
                    <span className={styles.shipmentNumber}>{s.shipment_number}</span>
                    <Badge variant={statusToBadgeVariant(s.current_status)}>{formatStatusLabel(s.current_status)}</Badge>
                    {hasNew && (
                      <Badge variant="neutral" className={styles.coupleNewBadge}>
                        Includes new PO
                      </Badge>
                    )}
                  </div>
                  <div className={styles.coupleCandidatePoLines}>PO on shipment: {poLabels || "—"}</div>
                  <button
                    type="button"
                    className={selected ? styles.couplePickBtnSelected : styles.couplePickBtn}
                    onClick={() => setCoupleShipmentId(s.id)}
                  >
                    {selected ? "Selected" : "Use this shipment"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Shipment ID (UUID) — optional if you pick above</span>
          <input
            type="text"
            className={styles.input}
            value={coupleShipmentId}
            onChange={(e) => setCoupleShipmentId(e.target.value)}
            placeholder="Paste shipment ID"
          />
        </label>
      </Modal>

      <button
        type="button"
        className={styles.activityRibbonTrigger}
        onClick={openActivityPanel}
        aria-expanded={activityPanelOpen}
        aria-controls="po-activity-panel"
        title="Activity log"
      >
        <ActivityLogRibbonIcon className={styles.activityRibbonIcon} />
        <span className={styles.activityRibbonLabel}>Activity</span>
      </button>
      {activityPanelOpen &&
        portalMounted &&
        createPortal(
          <>
            <div className={styles.activityPanelBackdrop} aria-hidden onClick={closeActivityPanel} />
            <aside
              id="po-activity-panel"
              className={styles.activityPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="po-activity-title"
            >
              <div className={styles.activityPanelHeader}>
                <h2 id="po-activity-title" className={styles.activityPanelTitle}>
                  Activity log
                </h2>
                <Button type="button" variant="secondary" onClick={closeActivityPanel}>
                  Close
                </Button>
              </div>
              <p className={styles.activityPanelHint}>
                When the PO was recorded, claimed, linked to a shipment, unlinked, and field updates — with time and user.
              </p>
              <div className={styles.activityPanelBody} role="feed" aria-busy={activityLoading}>
                {activityLoading && <p className={styles.activityPanelState}>Loading…</p>}
                {!activityLoading && activityError && <p className={styles.error}>{activityError}</p>}
                {!activityLoading && !activityError && activityItems.length === 0 && (
                  <p className={styles.activityPanelState}>No activity yet.</p>
                )}
                {!activityLoading && !activityError && activityItems.length > 0 && (
                  <ul className={styles.activityList}>
                    {activityItems.map((item) => (
                      <li key={item.id} className={styles.activityListItem}>
                        <div className={styles.activityListMeta}>
                          <span className={styles.activityTypeTag}>{poActivityTypeLabel(item.type)}</span>
                          <time className={styles.activityTime} dateTime={item.occurred_at}>
                            {formatDateTime(item.occurred_at)}
                          </time>
                        </div>
                        <p className={styles.activityTitle}>{item.title}</p>
                        {item.detail ? <p className={styles.activityDetail}>{item.detail}</p> : null}
                        {item.field_changes && item.field_changes.length > 0 ? (
                          <div className={styles.activityFieldChanges}>
                            {item.field_changes.map((change, idx) => (
                              <div key={`${item.id}-change-${idx}`} className={styles.activityFieldChangeRow}>
                                <span className={styles.activityFieldChangeLabel}>{change.label}</span>
                                <span className={styles.activityFieldChangeValue}>
                                  {renderPoActivityValue(change.before)} {" → "} {renderPoActivityValue(change.after)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <p className={styles.activityActor}>
                          <span className={styles.activityActorLabel}>By</span> {item.actor}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </>,
          document.body
        )}
    </section>
  );
}
