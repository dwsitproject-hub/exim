"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can, isAdminRole } from "@/lib/permissions";
import { Card } from "@/components/cards";
import { Badge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/navigation";
import { LoadingSkeleton } from "@/components/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/tables";
import { useToast } from "@/components/providers/ToastProvider";
import { isApiError } from "@/types/api";
import type { DhmSyncHealth, MasterCatalog, MasterCatalogCompany } from "@/types/masters";
import { getDhmSyncHealth, getMasterCatalog, triggerDhmSync } from "@/services/masters-service";
import styles from "./MasterDataPage.module.css";

type TabId = "companies" | "sites" | "plants" | "rates";

const VIEW_SHIPMENTS = "VIEW_SHIPMENTS";
const VIEW_PO_INTAKE = "VIEW_PO_INTAKE";

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query);
}

function formatRate(rate: number): string {
  return Number(rate).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function MasterDataPage() {
  const { user, accessToken } = useAuth();
  const { pushToast } = useToast();
  const allowed = can(user, VIEW_SHIPMENTS) || can(user, VIEW_PO_INTAKE);
  const isAdmin = isAdminRole(user);

  const [catalog, setCatalog] = useState<MasterCatalog | null>(null);
  const [health, setHealth] = useState<DhmSyncHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("companies");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    if (!accessToken || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const catalogReq = getMasterCatalog(accessToken);
    const healthReq = isAdmin ? getDhmSyncHealth(accessToken) : Promise.resolve(null);
    Promise.all([catalogReq, healthReq])
      .then(([catalogRes, healthRes]) => {
        if (isApiError(catalogRes)) {
          setError(catalogRes.message);
          setCatalog(null);
          return;
        }
        setCatalog(catalogRes.data ?? { companies: [], exchange_rates: [] });
        setError(null);
        if (healthRes && !isApiError(healthRes)) {
          setHealth(healthRes.data ?? []);
        }
      })
      .catch(() => setError("Failed to load master data"))
      .finally(() => setLoading(false));
  }, [accessToken, allowed, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    if (!accessToken) return;
    setSyncing(true);
    const res = await triggerDhmSync(undefined, accessToken);
    setSyncing(false);
    if (isApiError(res)) {
      pushToast(res.message, "error");
      return;
    }
    pushToast("DHM sync completed. Reloading master data.", "success");
    load();
  }

  const q = query.trim().toLowerCase();

  const filteredCompanies = useMemo(() => {
    const companies = catalog?.companies ?? [];
    if (!q) return companies;
    return companies.filter((company) => {
      const companyHit = [company.name, company.dhm_code, company.short_name, company.company_code_sap, company.country]
        .filter(Boolean)
        .some((v) => matchesQuery(String(v), q));
      if (companyHit) return true;
      return company.sites.some((site) => {
        if (matchesQuery(`${site.name} ${site.dhm_code} ${site.address ?? ""}`, q)) return true;
        return site.plants.some((plant) =>
          matchesQuery(`${plant.name} ${plant.dhm_code} ${plant.plant_code ?? ""}`, q)
        );
      });
    });
  }, [catalog, q]);

  const flatSites = useMemo(() => {
    return filteredCompanies.flatMap((company) =>
      company.sites.map((site) => ({ company, site }))
    );
  }, [filteredCompanies]);

  const flatPlants = useMemo(() => {
    return filteredCompanies.flatMap((company) =>
      company.sites.flatMap((site) => site.plants.map((plant) => ({ company, site, plant })))
    );
  }, [filteredCompanies]);

  const filteredRates = useMemo(() => {
    const rates = catalog?.exchange_rates ?? [];
    if (!q) return rates;
    return rates.filter((rate) =>
      matchesQuery(`${rate.from_currency} ${rate.to_currency} ${rate.code}`, q)
    );
  }, [catalog, q]);

  function toggleCompany(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!allowed) {
    return (
      <section>
        <PageHeader title="Master data" backHref="/dashboard" backLabel="Dashboard" />
        <p className={styles.denied}>You do not have permission to view master data.</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <PageHeader
        title="Master data"
        backHref="/dashboard"
        backLabel="Dashboard"
        subtitle="EOS replica of DHM company, site, plant, and exchange rate. Used as PT / Plant options and Syncera filters."
      />

      {isAdmin ? (
        <Card className={styles.healthCard}>
          <div className={styles.healthHeader}>
            <h2 className={styles.subheading}>DHM sync</h2>
            <button type="button" className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          {health.length === 0 ? (
            <p className={styles.hint}>No sync has run yet. Enable DHM and click Sync now.</p>
          ) : (
            <div className={styles.healthGrid}>
              {health.map((row) => (
                <div key={row.entity_type} className={styles.healthItem}>
                  <div className={styles.healthTitle}>{row.entity_type}</div>
                  <div className={styles.healthMeta}>
                    {row.last_record_count} records · {formatWhen(row.last_synced_at)}
                  </div>
                  {row.last_error ? <div className={styles.healthError}>{row.last_error}</div> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="Master data type">
            {(
              [
                ["companies", "Companies"],
                ["sites", "Sites"],
                ["plants", "Plants"],
                ["rates", "Exchange rates"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name, code, site, plant…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search master data"
          />
        </div>

        {error ? <p role="alert">{error}</p> : null}
        {loading ? (
          <LoadingSkeleton />
        ) : tab === "companies" ? (
          <CompaniesPanel companies={filteredCompanies} expanded={expanded} onToggle={toggleCompany} />
        ) : tab === "sites" ? (
          <SitesPanel rows={flatSites} />
        ) : tab === "plants" ? (
          <PlantsPanel rows={flatPlants} />
        ) : (
          <RatesPanel rates={filteredRates} />
        )}
      </Card>
    </section>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

function CompaniesPanel({
  companies,
  expanded,
  onToggle,
}: {
  companies: MasterCatalogCompany[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (companies.length === 0) {
    return <EmptyState title="No companies" description="Run a DHM sync or try another search." />;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell className={styles.expandCol} />
          <TableHeaderCell>Company</TableHeaderCell>
          <TableHeaderCell>DHM code</TableHeaderCell>
          <TableHeaderCell>SAP</TableHeaderCell>
          <TableHeaderCell>Country</TableHeaderCell>
          <TableHeaderCell>Sites</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {companies.map((company) => {
          const open = expanded.has(company.id);
          return (
            <CompanyBlock key={company.id} company={company} open={open} onToggle={onToggle} />
          );
        })}
      </TableBody>
    </Table>
  );
}

function CompanyBlock({
  company,
  open,
  onToggle,
}: {
  company: MasterCatalogCompany;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <TableRow className={company.is_active ? undefined : styles.inactive}>
        <TableCell>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => onToggle(company.id)}
            aria-expanded={open}
            aria-label={open ? "Collapse sites" : "Expand sites"}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </TableCell>
        <TableCell>
          <div className={styles.primaryName}>{company.name}</div>
          {company.short_name ? <div className={styles.muted}>{company.short_name}</div> : null}
        </TableCell>
        <TableCell>{company.dhm_code || "—"}</TableCell>
        <TableCell>{company.company_code_sap || "—"}</TableCell>
        <TableCell>{company.country || "—"}</TableCell>
        <TableCell>{company.sites.length}</TableCell>
        <TableCell>
          <StatusPill active={company.is_active} />
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={7}>
            {company.sites.length === 0 ? (
              <p className={styles.hint}>No sites for this company.</p>
            ) : (
              <div className={styles.nested}>
                {company.sites.map((site) => (
                  <div key={site.id} className={styles.siteBlock}>
                    <div className={styles.siteHead}>
                      <strong>{site.name}</strong>
                      <span className={styles.muted}>{site.dhm_code}</span>
                      <StatusPill active={site.is_active} />
                    </div>
                    {site.address ? <div className={styles.muted}>{site.address}</div> : null}
                    {site.plants.length === 0 ? (
                      <div className={styles.muted}>No plants</div>
                    ) : (
                      <ul className={styles.plantList}>
                        {site.plants.map((plant) => (
                          <li key={plant.id}>
                            {plant.name}
                            {plant.plant_code ? ` (${plant.plant_code})` : ""}
                            {!plant.is_active ? " — inactive" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function SitesPanel({
  rows,
}: {
  rows: { company: MasterCatalogCompany; site: MasterCatalogCompany["sites"][number] }[];
}) {
  if (rows.length === 0) {
    return <EmptyState title="No sites" description="Run a DHM sync or try another search." />;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Site</TableHeaderCell>
          <TableHeaderCell>Company</TableHeaderCell>
          <TableHeaderCell>DHM code</TableHeaderCell>
          <TableHeaderCell>Address</TableHeaderCell>
          <TableHeaderCell>Plants</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(({ company, site }) => (
          <TableRow key={site.id} className={site.is_active ? undefined : styles.inactive}>
            <TableCell>{site.name}</TableCell>
            <TableCell>{company.name}</TableCell>
            <TableCell>{site.dhm_code || "—"}</TableCell>
            <TableCell>{site.address || "—"}</TableCell>
            <TableCell>{site.plants.length}</TableCell>
            <TableCell>
              <StatusPill active={site.is_active} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PlantsPanel({
  rows,
}: {
  rows: {
    company: MasterCatalogCompany;
    site: MasterCatalogCompany["sites"][number];
    plant: MasterCatalogCompany["sites"][number]["plants"][number];
  }[];
}) {
  if (rows.length === 0) {
    return <EmptyState title="No plants" description="Run a DHM sync or try another search." />;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Plant</TableHeaderCell>
          <TableHeaderCell>SAP code</TableHeaderCell>
          <TableHeaderCell>Site</TableHeaderCell>
          <TableHeaderCell>Company</TableHeaderCell>
          <TableHeaderCell>DHM code</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(({ company, site, plant }) => (
          <TableRow key={plant.id} className={plant.is_active ? undefined : styles.inactive}>
            <TableCell>{plant.name}</TableCell>
            <TableCell>{plant.plant_code || "—"}</TableCell>
            <TableCell>{site.name}</TableCell>
            <TableCell>{company.name}</TableCell>
            <TableCell>{plant.dhm_code || "—"}</TableCell>
            <TableCell>
              <StatusPill active={plant.is_active} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RatesPanel({
  rates,
}: {
  rates: NonNullable<MasterCatalog["exchange_rates"]>;
}) {
  if (rates.length === 0) {
    return <EmptyState title="No exchange rates" description="Run a DHM sync for exchange_rate." />;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Pair</TableHeaderCell>
          <TableHeaderCell>Rate</TableHeaderCell>
          <TableHeaderCell>Date</TableHeaderCell>
          <TableHeaderCell>Code</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rates.map((rate) => (
          <TableRow key={rate.code}>
            <TableCell>
              {rate.from_currency}/{rate.to_currency}
            </TableCell>
            <TableCell>{formatRate(Number(rate.rate))}</TableCell>
            <TableCell>{rate.rate_date}</TableCell>
            <TableCell>{rate.code}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
