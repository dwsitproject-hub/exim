/**
 * Map Syncera flat PO-import lines to EOS intake DTOs.
 * One Syncera object is one line; group by pt_code + po_number.
 */

import { createHash } from "node:crypto";
import { ensureSynceraUnitRegistered } from "../../shared/po-item-unit-registry.js";
import { PT_OPTION_LABELS, PT_PLANT_MAP, type PtOptionLabel } from "../../shared/pt-plant-options.js";
import type { CreatePoIntakeDto, PoIntakeItemDto, PoIntakeItemRow, PoIntakeRow } from "../../modules/po-intake/dto/index.js";
import type { MapSynceraLinesResult, SaasPoResponse, SynceraMapSkip, SynceraPoLine } from "./types.js";

const PLANT_CODE_MAP: Record<string, string> = {
  EU72: "BONTANG",
  EU73: "TANJUNG PURA",
  JP22: "SIDOARJO",
};

const PT_ALIAS: Record<string, PtOptionLabel> = {
  ENERGIUNGGULPERSADA: "ENERGI UNGGUL PERSADA",
  PTENERGIUNGGULPERSADA: "ENERGI UNGGUL PERSADA",
  ENERGIOLEOPERSADA: "ENERGI OLEO PERSADA",
  PTENERGIOLEOPERSADA: "ENERGI OLEO PERSADA",
  JATIPERKASANUSANTARA: "JATI PERKASA NUSANTARA",
  PTJATIPERKASANUSANTARA: "JATI PERKASA NUSANTARA",
  PRIMUSSANUSCOOKINGOILINDUSTRIALPTPRISCOLIN: "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)",
  PRIMUSSANUSCOOKINGOILINDUSTRIAL: "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)",
  PTPRISCOLIN: "PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)",
  ROYALFOODSINDONESIA: "ROYAL FOODS INDONESIA",
  PRIMAMAKMURCAKRAWALA: "PRIMA MAKMUR CAKRAWALA",
  SUMBERPANGANCEMERLANG: "SUMBER PANGAN CEMERLANG",
  RIAUSEMESTABIOMASA: "RIAU SEMESTA BIOMASA",
  SUMATERABULKERS: "SUMATERA BULKERS",
  SUMATERAUNGGULMAKMUR: "SUMATERA UNGGUL MAKMUR",
};

export function foldKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[.\-_/(),']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/^PT\s+/, "")
    .replace(/\s+/g, "");
}

export function normalizePtName(ptName: string | undefined): string | undefined {
  const raw = (ptName ?? "").trim();
  if (!raw) return undefined;
  const folded = foldKey(raw);
  const aliased = PT_ALIAS[folded];
  if (aliased) return aliased;
  for (const label of PT_OPTION_LABELS) {
    if (foldKey(label) === folded) return label;
  }
  const stripped = raw.replace(/^PT\.?\s+/i, "").trim();
  return stripped || undefined;
}

function plantFromName(plantName: string): string | undefined {
  const u = plantName.toUpperCase();
  const plants = [
    "TANJUNG PURA",
    "BONTANG",
    "SIDOARJO",
    "GRESIK",
    "KARAWANG",
    "BEKASI",
    "MORAWA",
    "BATAM",
    "DUMAI",
    "KUMAI",
    "LUBUK GAUNG",
    "PALEMBANG",
  ];
  if (/\bTJ\.?\s*PURA\b/.test(u) || u.includes("TJ.PURA") || u.includes("TJPURA")) {
    return "TANJUNG PURA";
  }
  for (const plant of plants) {
    if (u.includes(plant)) return plant;
  }
  return undefined;
}

export function normalizePlant(plantCode: string | undefined, plantName: string | undefined, pt?: string): string | undefined {
  const code = (plantCode ?? "").trim().toUpperCase();
  if (code && PLANT_CODE_MAP[code]) return PLANT_CODE_MAP[code];
  const fromName = plantFromName(plantName ?? "");
  if (fromName) return fromName;
  if (pt && (PT_OPTION_LABELS as readonly string[]).includes(pt)) {
    const cfg = PT_PLANT_MAP[pt as PtOptionLabel];
    if (cfg.mode === "fixed") return cfg.plant;
  }
  const trimmed = (plantName ?? "").trim();
  return trimmed || undefined;
}

export function normalizeCurrency(raw: string | undefined): string | undefined {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  if (/^us\$?$/i.test(t) || t === "$") return "USD";
  return t.replace(/\$/g, "").trim().toUpperCase() || undefined;
}

export function normalizeKawasan(raw: string | undefined): string | undefined {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  if (/^(n|no|0|false)$/i.test(t)) return "No";
  if (/^(y|yes|1|true)$/i.test(t)) return "Yes";
  return t;
}

export function synceraExternalId(ptCode: string, poNumber: string): string {
  return `syncera:${ptCode.trim().toUpperCase()}:${poNumber.trim()}`;
}

export function lineMatchKey(description: string | null | undefined, unit: string | null | undefined): string {
  return `${(description ?? "").trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}`;
}

function headerSnapshot(line: SynceraPoLine): string {
  return [
    line.supplier_name ?? "",
    line.plant_code ?? "",
    line.plant_name ?? "",
    line.pt_code ?? "",
    line.pt_name ?? "",
    line.delivery_location ?? "",
    line.incoterm ?? "",
    line.kawasan_berikat ?? "",
    line.currency ?? "",
  ]
    .map((s) => s.trim())
    .join("|");
}

async function toValidItem(line: SynceraPoLine, lineNumber: number): Promise<PoIntakeItemDto | null> {
  const desc = (line.item_description ?? "").trim();
  const qty = Number(line.qty_item);
  const unitRaw = (line.unit ?? "").trim();
  const value = Number(line.price_per_unit);
  if (!desc || !Number.isFinite(qty) || qty <= 0 || !unitRaw || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const ok = await ensureSynceraUnitRegistered(unitRaw);
  if (!ok) return null;
  const unit = unitRaw.toUpperCase();
  return { line_number: lineNumber, item_description: desc, qty, unit, value };
}

export function fingerprintMappedPo(po: {
  po_number: string;
  plant?: string;
  pt?: string;
  supplier_name: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: string;
  currency?: string;
  items?: { item_description?: string; qty?: number; unit?: string; value?: number }[];
}): string {
  const lines = [...(po.items ?? [])]
    .map((it) => ({
      d: (it.item_description ?? "").trim().toLowerCase(),
      q: Number(it.qty ?? 0),
      u: (it.unit ?? "").trim().toUpperCase(),
      v: Number(it.value ?? 0),
    }))
    .sort((a, b) => `${a.d}|${a.u}`.localeCompare(`${b.d}|${b.u}`));
  const payload = {
    po_number: po.po_number.trim(),
    plant: (po.plant ?? "").trim(),
    pt: (po.pt ?? "").trim(),
    supplier_name: po.supplier_name.trim(),
    delivery_location: (po.delivery_location ?? "").trim(),
    incoterm_location: (po.incoterm_location ?? "").trim(),
    kawasan_berikat: (po.kawasan_berikat ?? "").trim(),
    currency: (po.currency ?? "").trim(),
    items: lines,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function fingerprintFromIntake(row: PoIntakeRow, items: PoIntakeItemRow[]): string {
  return fingerprintMappedPo({
    po_number: row.po_number,
    plant: row.plant ?? undefined,
    pt: row.pt ?? undefined,
    supplier_name: row.supplier_name,
    delivery_location: row.delivery_location ?? undefined,
    incoterm_location: row.incoterm_location ?? undefined,
    kawasan_berikat: row.kawasan_berikat ?? undefined,
    currency: row.currency ?? undefined,
    items: items.map((it) => ({
      item_description: it.item_description ?? undefined,
      qty: it.qty ?? undefined,
      unit: it.unit ?? undefined,
      value: it.value ?? undefined,
    })),
  });
}

export function mappedToCreateDto(po: SaasPoResponse): CreatePoIntakeDto {
  return {
    external_id: po.external_id,
    po_number: po.po_number,
    plant: po.plant,
    pt: po.pt,
    supplier_name: po.supplier_name,
    delivery_location: po.delivery_location,
    incoterm_location: po.incoterm_location,
    kawasan_berikat: po.kawasan_berikat,
    currency: po.currency,
    items: (po.items ?? []).map((it, i) => ({
      line_number: i + 1,
      item_description: it.item_description,
      qty: it.qty,
      unit: it.unit,
      value: it.value,
    })),
  };
}

export async function mapSynceraLines(lines: SynceraPoLine[]): Promise<MapSynceraLinesResult> {
  const groups = new Map<string, SynceraPoLine[]>();
  for (const line of lines) {
    const poNumber = (line.po_number ?? "").trim();
    const ptCode = (line.pt_code ?? "").trim();
    if (!poNumber) continue;
    const key = `${ptCode.toUpperCase()}|${poNumber}`;
    const arr = groups.get(key) ?? [];
    arr.push(line);
    groups.set(key, arr);
  }

  const out: SaasPoResponse[] = [];
  const skipped: SynceraMapSkip[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const header = headerSnapshot(first);
    const inconsistent = group.some((l) => headerSnapshot(l) !== header);
    if (inconsistent) {
      console.warn(
        JSON.stringify({
          message: "Syncera PO group has inconsistent header fields; using first line",
          po_number: first.po_number,
          pt_code: first.pt_code,
        })
      );
    }
    const items: PoIntakeItemDto[] = [];
    for (const line of group) {
      const item = await toValidItem(line, items.length + 1);
      if (item) items.push(item);
    }
    const poNumber = (first.po_number ?? "").trim();
    const ptCode = (first.pt_code ?? "").trim();
    const externalId = synceraExternalId(ptCode, poNumber);
    if (items.length === 0) {
      const message = "No valid line items (check qty, unit, price, and description on all lines).";
      console.warn(
        JSON.stringify({
          message: "Skipping Syncera PO: no valid line items",
          po_number: poNumber,
          pt_code: ptCode,
        })
      );
      skipped.push({
        po_number: poNumber,
        pt_code: ptCode,
        external_id: externalId,
        reason: "NO_VALID_LINE_ITEMS",
        message,
      });
      continue;
    }
    const supplier = (first.supplier_name ?? "").trim();
    if (!supplier) {
      const message = "Supplier name is missing on Syncera payload.";
      console.warn(JSON.stringify({ message: "Skipping Syncera PO: supplier_name missing", po_number: poNumber }));
      skipped.push({
        po_number: poNumber,
        pt_code: ptCode,
        external_id: externalId,
        reason: "SUPPLIER_NAME_MISSING",
        message,
      });
      continue;
    }
    const pt = normalizePtName(first.pt_name);
    const plant = normalizePlant(first.plant_code, first.plant_name, pt);
    const mapped: SaasPoResponse = {
      external_id: synceraExternalId(first.pt_code ?? "", first.po_number ?? ""),
      po_number: (first.po_number ?? "").trim(),
      plant,
      pt,
      supplier_name: supplier,
      delivery_location: (first.delivery_location ?? "").trim() || undefined,
      incoterm_location: (first.incoterm ?? "").trim() || undefined,
      kawasan_berikat: normalizeKawasan(first.kawasan_berikat),
      currency: normalizeCurrency(first.currency),
      items,
    };
    mapped.fingerprint = fingerprintMappedPo(mapped);
    out.push(mapped);
  }
  return { mapped: out, skipped };
}
