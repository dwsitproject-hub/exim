"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/cards";
import { EmptyState, PageHeader } from "@/components/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/tables";
import { LoadingSkeleton } from "@/components/feedback";
import { isApiError } from "@/types/api";
import type { SynceraIntegrationEventItem, SynceraIntegrationOutcome, SynceraPollRunItem } from "@/types/po";
import { listSynceraIntegrationEvents, listSynceraPollRuns } from "@/services/po-service";
import styles from "./SynceraIntegrationPage.module.css";

const OUTCOME_OPTIONS: { value: "" | SynceraIntegrationOutcome; label: string }[] = [
  { value: "", label: "All outcomes" },
  { value: "ingested", label: "Ingested (new PO)" },
  { value: "updated", label: "Updated (amended)" },
  { value: "unchanged", label: "Unchanged" },
  { value: "skipped_invalid", label: "Skipped — invalid data" },
  { value: "skipped_conflict", label: "Skipped — conflict" },
  { value: "skipped_locked_amendment", label: "Skipped — shipment lock" },
  { value: "skipped_unknown_pt", label: "Skipped — unknown PT" },
  { value: "skipped_non_id_country", label: "Skipped — non-ID company" },
  { value: "failed", label: "Failed" },
];

function formatYyyymmddRange(from: string, to: string): string {
  if (from === "00000000" && to === "00000000") return "—";
  return `${from} → ${to}`;
}

function outcomeBadgeClass(outcome: SynceraIntegrationOutcome): string {
  if (outcome === "ingested" || outcome === "updated") return styles.badgeSuccess;
  if (outcome === "unchanged") return styles.badgeNeutral;
  if (outcome.startsWith("skipped_")) return styles.badgeWarn;
  return styles.badgeError;
}

function outcomeLabel(outcome: SynceraIntegrationOutcome): string {
  return outcome.replaceAll("_", " ");
}

function runStatusLabel(status: SynceraPollRunItem["status"]): string {
  if (status === "SUCCESS") return "Success";
  if (status === "FAILED") return "Failed";
  return "Running";
}

export function SynceraIntegrationPage() {
  const { accessToken } = useAuth();
  const [runs, setRuns] = useState<SynceraPollRunItem[]>([]);
  const [events, setEvents] = useState<SynceraIntegrationEventItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<"" | SynceraIntegrationOutcome>("");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fetchRuns = useCallback(() => {
    if (!accessToken) {
      setLoadingRuns(false);
      return;
    }
    setLoadingRuns(true);
    listSynceraPollRuns(accessToken, 40)
      .then((res) => {
        if (isApiError(res)) {
          setRunsError(res.message);
          return;
        }
        setRuns(res.data ?? []);
        setRunsError(null);
      })
      .catch(() => setRunsError("Failed to load poll runs"))
      .finally(() => setLoadingRuns(false));
  }, [accessToken]);

  const fetchEvents = useCallback(() => {
    if (!accessToken) {
      setLoadingEvents(false);
      return;
    }
    setLoadingEvents(true);
    listSynceraIntegrationEvents(accessToken, {
      runId: selectedRunId ?? undefined,
      outcome: outcomeFilter || undefined,
      limit: selectedRunId ? 2000 : 150,
    })
      .then((res) => {
        if (isApiError(res)) {
          setEventsError(res.message);
          return;
        }
        setEvents(res.data ?? []);
        setEventsError(null);
      })
      .catch(() => setEventsError("Failed to load integration events"))
      .finally(() => setLoadingEvents(false));
  }, [accessToken, selectedRunId, outcomeFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  function refreshAll() {
    fetchRuns();
    fetchEvents();
  }

  return (
    <section className={styles.page}>
      <PageHeader
        title="Syncera integration"
        subtitle="Audit trail for automated PO polling: each cycle, per-PO success, skips, and failures."
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <Card className={styles.card}>
        <div className={styles.toolbar}>
          <h2 className={styles.subheading}>Poll cycles</h2>
          <button type="button" className={styles.btnSecondary} onClick={refreshAll}>
            Refresh
          </button>
        </div>
        <p className={styles.hint}>
          Select a row to filter PO events to that poll. API line count is raw Syncera rows; mapped PO count is POs
          ready for upsert after grouping and validation.
        </p>
        {runsError && (
          <div className={styles.errorPanel} role="alert">
            <p className={styles.errorText}>{runsError}</p>
          </div>
        )}
        {loadingRuns ? (
          <LoadingSkeleton lines={4} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No poll runs yet"
            description="Runs appear here after PO polling is enabled and the backend completes at least one cycle."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Started</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Date window</TableHeaderCell>
                <TableHeaderCell>API lines</TableHeaderCell>
                <TableHeaderCell>Mapped POs</TableHeaderCell>
                <TableHeaderCell>New</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
                <TableHeaderCell>Unchanged</TableHeaderCell>
                <TableHeaderCell>Skipped</TableHeaderCell>
                <TableHeaderCell>Failed</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => {
                const skippedTotal =
                  run.skipped_invalid +
                  run.skipped_conflict +
                  run.skipped_locked_amendment +
                  (run.skipped_unknown_pt ?? 0) +
                  (run.skipped_non_id_country ?? 0);
                const isSelected = run.id === selectedRunId;
                return (
                  <TableRow
                    key={run.id}
                    className={`${styles.clickableRow} ${isSelected ? styles.runRowSelected : ""}`}
                    onClick={() => setSelectedRunId(isSelected ? null : run.id)}
                  >
                    <TableCell className={styles.smallCell}>
                      {new Date(run.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className={run.status === "FAILED" ? styles.badgeError : styles.badgeSuccess}>
                        {runStatusLabel(run.status)}
                      </span>
                      {run.error_message ? (
                        <div className={styles.hint} title={run.error_message}>
                          {run.error_message.length > 80
                            ? `${run.error_message.slice(0, 80)}…`
                            : run.error_message}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className={styles.smallCell}>
                      {formatYyyymmddRange(run.date_from, run.date_to)}
                    </TableCell>
                    <TableCell>{run.api_line_count}</TableCell>
                    <TableCell>{run.mapped_po_count}</TableCell>
                    <TableCell>{run.ingested}</TableCell>
                    <TableCell>{run.updated}</TableCell>
                    <TableCell>{run.unchanged}</TableCell>
                    <TableCell>{skippedTotal}</TableCell>
                    <TableCell>{run.failed}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={styles.card}>
        <div className={styles.toolbar}>
          <h2 className={styles.subheading}>PO integration events</h2>
          <label className={styles.toolbarLabel}>
            Outcome
            <select
              className={styles.select}
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value as "" | SynceraIntegrationOutcome)}
              aria-label="Filter by outcome"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {selectedRunId && (
            <button type="button" className={styles.btnSecondary} onClick={() => setSelectedRunId(null)}>
              Clear run filter
            </button>
          )}
        </div>
        <p className={styles.hint}>
          {selectedRun
            ? `Showing events for poll started ${new Date(selectedRun.started_at).toLocaleString()}.`
            : "Showing the most recent events across all polls (use outcome filter or select a poll above)."}
        </p>
        {eventsError && (
          <div className={styles.errorPanel} role="alert">
            <p className={styles.errorText}>{eventsError}</p>
          </div>
        )}
        {loadingEvents ? (
          <LoadingSkeleton lines={5} />
        ) : events.length === 0 ? (
          <EmptyState title="No events" description="No integration events match the current filters." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Time</TableHeaderCell>
                <TableHeaderCell>Outcome</TableHeaderCell>
                <TableHeaderCell>PO number</TableHeaderCell>
                <TableHeaderCell>PT</TableHeaderCell>
                <TableHeaderCell>External ID</TableHeaderCell>
                <TableHeaderCell>PO in EOS</TableHeaderCell>
                <TableHeaderCell>Message</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className={styles.smallCell}>{new Date(ev.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={outcomeBadgeClass(ev.outcome)}>{outcomeLabel(ev.outcome)}</span>
                  </TableCell>
                  <TableCell>{ev.po_number ?? "—"}</TableCell>
                  <TableCell>{ev.pt_code ?? "—"}</TableCell>
                  <TableCell className={styles.smallCell}>{ev.external_id ?? "—"}</TableCell>
                  <TableCell>
                    {ev.intake_id ? (
                      <Link className={styles.poLink} href={`/dashboard/po/${ev.intake_id}`}>
                        Open PO
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ev.message ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}
