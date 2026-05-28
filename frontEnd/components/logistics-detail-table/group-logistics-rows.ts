import type {
  AirLogisticsRow,
  BulkLogisticsRow,
  FclLogisticsRow,
  FclSubType,
  GroupedAirRow,
  GroupedBulkRow,
  GroupedFclRow,
  GroupedLclRow,
  LclLogisticsRow,
  LogisticsDetailSourceRow,
  TransportTab,
} from "./types";

function groupKey(ptPlant: string, item: string): string {
  return `${ptPlant}\u0000${item}`;
}

export function groupAirRows(rows: AirLogisticsRow[]): GroupedAirRow[] {
  const map = new Map<
    string,
    { ptPlant: string; itemDescription: string; shipmentCount: number; forwarders: Set<string> }
  >();
  for (const r of rows) {
    const k = groupKey(r.ptPlant, r.itemDescription);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        ptPlant: r.ptPlant,
        itemDescription: r.itemDescription,
        shipmentCount: r.shipmentCount,
        forwarders: new Set([r.forwarder]),
      });
    } else {
      cur.shipmentCount += r.shipmentCount;
      cur.forwarders.add(r.forwarder);
    }
  }
  return [...map.values()]
    .map((v) => ({
      ptPlant: v.ptPlant,
      itemDescription: v.itemDescription,
      shipmentCount: v.shipmentCount,
      forwarder: [...v.forwarders].sort().join("; "),
    }))
    .sort((a, b) => a.ptPlant.localeCompare(b.ptPlant) || a.itemDescription.localeCompare(b.itemDescription));
}

export function groupLclRows(rows: LclLogisticsRow[]): GroupedLclRow[] {
  const map = new Map<
    string,
    {
      ptPlant: string;
      itemDescription: string;
      packages: number;
      packageKind: string;
      forwarders: Set<string>;
    }
  >();
  for (const r of rows) {
    const k = groupKey(r.ptPlant, r.itemDescription);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        ptPlant: r.ptPlant,
        itemDescription: r.itemDescription,
        packages: r.packages,
        packageKind: r.packageKind,
        forwarders: new Set([r.forwarder]),
      });
    } else {
      cur.packages += r.packages;
      cur.forwarders.add(r.forwarder);
      if (cur.packageKind !== r.packageKind) {
        cur.packageKind = `${cur.packageKind} + ${r.packageKind}`;
      }
    }
  }
  return [...map.values()]
    .map((v) => ({
      ptPlant: v.ptPlant,
      itemDescription: v.itemDescription,
      packageDisplay: `${v.packages.toLocaleString()} ${v.packageKind}`,
      forwarder: [...v.forwarders].sort().join("; "),
    }))
    .sort((a, b) => a.ptPlant.localeCompare(b.ptPlant) || a.itemDescription.localeCompare(b.itemDescription));
}

export function groupFclRows(rows: FclLogisticsRow[]): GroupedFclRow[] {
  const map = new Map<
    string,
    {
      ptPlant: string;
      itemDescription: string;
      containerCount: number;
      containerSpec: string;
      forwarders: Set<string>;
    }
  >();
  for (const r of rows) {
    const k = groupKey(r.ptPlant, r.itemDescription);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        ptPlant: r.ptPlant,
        itemDescription: r.itemDescription,
        containerCount: r.containerCount,
        containerSpec: r.containerSpec,
        forwarders: new Set([r.forwarder]),
      });
    } else {
      cur.containerCount += r.containerCount;
      cur.forwarders.add(r.forwarder);
      if (cur.containerSpec !== r.containerSpec) {
        cur.containerSpec = `${cur.containerSpec}; ${r.containerSpec}`;
      }
    }
  }
  return [...map.values()]
    .map((v) => ({
      ptPlant: v.ptPlant,
      itemDescription: v.itemDescription,
      containerDisplay: `${v.containerCount.toLocaleString()} × ${v.containerSpec}`,
      forwarder: [...v.forwarders].sort().join("; "),
    }))
    .sort((a, b) => a.ptPlant.localeCompare(b.ptPlant) || a.itemDescription.localeCompare(b.itemDescription));
}

export function groupBulkRows(rows: BulkLogisticsRow[]): GroupedBulkRow[] {
  const map = new Map<
    string,
    {
      ptPlant: string;
      itemDescription: string;
      volumeMt: number;
      cbm: number;
      forwarders: Set<string>;
    }
  >();
  for (const r of rows) {
    const k = groupKey(r.ptPlant, r.itemDescription);
    const cur = map.get(k);
    const addMt = r.volumeMt ?? 0;
    const addCbm = r.cbm ?? 0;
    if (!cur) {
      map.set(k, {
        ptPlant: r.ptPlant,
        itemDescription: r.itemDescription,
        volumeMt: addMt,
        cbm: addCbm,
        forwarders: new Set([r.forwarder]),
      });
    } else {
      cur.volumeMt += addMt;
      cur.cbm += addCbm;
      cur.forwarders.add(r.forwarder);
    }
  }
  return [...map.values()]
    .map((v) => {
      const parts: string[] = [];
      if (v.volumeMt > 0) parts.push(`${v.volumeMt.toLocaleString()} MT`);
      if (v.cbm > 0) parts.push(`${v.cbm.toLocaleString()} CBM`);
      const volumeWeightDisplay = parts.length ? parts.join(" · ") : "—";
      return {
        ptPlant: v.ptPlant,
        itemDescription: v.itemDescription,
        volumeWeightDisplay,
        forwarder: [...v.forwarders].sort().join("; "),
      };
    })
    .sort((a, b) => a.ptPlant.localeCompare(b.ptPlant) || a.itemDescription.localeCompare(b.itemDescription));
}

export function filterByTab(
  rows: LogisticsDetailSourceRow[],
  tab: TransportTab,
  fclSubType: FclSubType
): LogisticsDetailSourceRow[] {
  return rows.filter((r) => {
    if (r.transportMode !== tab) return false;
    if (tab === "FCL") return r.transportMode === "FCL" && r.fclSubType === fclSubType;
    return true;
  });
}

export function toCsvField(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headers: string[], dataRows: string[][]): string {
  const lines = [headers.map(toCsvField).join(","), ...dataRows.map((row) => row.map(toCsvField).join(","))];
  return lines.join("\r\n");
}
