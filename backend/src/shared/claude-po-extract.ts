/**
 * Claude API integration for PO PDF extraction via PDF document attachment.
 * Cost-gated by caller — this module does not enforce usage limits.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { ParsedPoItem } from "./po-pdf-parser.js";
import { normalizeUnit } from "./po-unit-normalize.js";

const SYSTEM_PROMPT = `You extract structured purchase order data from PDF documents for an import system.
Always respond with valid JSON only — no markdown fences, no commentary.

Return this exact schema:
{
  "po_number": string|null,
  "supplier_name": string|null,
  "currency": string|null (ISO 3-letter),
  "incoterm_location": string|null (3-letter incoterm code only, e.g. FOB, CIF),
  "delivery_location": string|null,
  "kawasan_berikat": "Yes"|"No"|null,
  "items": [
    {
      "item_description": string,
      "qty": number,
      "unit": string,
      "unit_original": string,
      "value": number
    }
  ]
}

Rules:
- Extract EVERY line item row from the item table across ALL pages. Do not skip rows.
- qty must be a positive number; value is unit price (non-negative number).
- Handle EU number formats (1.234,56) and US formats (1,234.56).
- unit_original = unit as printed; unit = normalized uppercase code when obvious (PCS, KG, MT, etc.).
- Do not invent rows that are not in the document.
- If a header field is missing, use null.`;

export interface ClaudeExtractData {
  po_number?: string | null;
  supplier_name?: string | null;
  currency?: string | null;
  incoterm_location?: string | null;
  delivery_location?: string | null;
  kawasan_berikat?: "Yes" | "No" | null;
  items?: ParsedPoItem[];
}

export interface ClaudeExtractResult {
  data: ClaudeExtractData;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

export interface ClaudeExtractHints {
  ocrItemCount: number;
  expectedItemCount: number | null;
  po_number?: string | null;
  supplier_name?: string | null;
  currency?: string | null;
}

function getClient(): Anthropic | null {
  if (!config.poPdfClaude.enabled || !config.poPdfClaude.apiKey) return null;
  return new Anthropic({ apiKey: config.poPdfClaude.apiKey });
}

function extractJsonBlock(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Claude response was not valid JSON");
  }
}

export function normalizeClaudeItems(raw: unknown): ParsedPoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ParsedPoItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const desc = String(r.item_description ?? "").trim();
    const qty = Number(r.qty);
    const value = Number(r.value);
    const unitOriginal = String(r.unit_original ?? r.unit ?? "OTH").trim();
    const { unit } = normalizeUnit(unitOriginal);
    if (!desc || !Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(value) || value < 0) continue;
    items.push({
      item_description: desc,
      qty,
      unit,
      unit_original: unitOriginal,
      value,
    });
  }
  return items;
}

function buildUserPrompt(hints: ClaudeExtractHints): string {
  const lines = [
    "Read the attached purchase order PDF and return JSON matching the schema.",
    "Pay special attention to the line item table — include every row on every page.",
  ];
  if (hints.expectedItemCount != null) {
    lines.push(`Expected approximately ${hints.expectedItemCount} line items based on line numbers in OCR.`);
  }
  if (hints.ocrItemCount > 0) {
    lines.push(`Local OCR already found ${hints.ocrItemCount} items — extract any missing rows.`);
  }
  const headerHint = {
    po_number: hints.po_number,
    supplier_name: hints.supplier_name,
    currency: hints.currency,
  };
  lines.push(`OCR header hints (may be incomplete): ${JSON.stringify(headerHint)}`);
  return lines.join("\n");
}

export async function claudeExtractFromPdf(
  pdfPath: string,
  hints: ClaudeExtractHints
): Promise<ClaudeExtractResult | null> {
  const client = getClient();
  if (!client) return null;

  const model = config.poPdfClaude.model;

  try {
    const pdfBytes = await readFile(pdfPath);
    const pdfBase64 = pdfBytes.toString("base64");

    const response = await client.messages.create({
      model,
      max_tokens: config.poPdfClaude.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: buildUserPrompt(hints),
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const parsed = extractJsonBlock(text) as Record<string, unknown>;
    const items = normalizeClaudeItems(parsed.items);
    if (items.length === 0 && !parsed.po_number && !parsed.supplier_name) {
      logger.warn("Claude PDF extract returned no usable data");
      return null;
    }

    return {
      data: {
        po_number: parsed.po_number != null ? String(parsed.po_number) : null,
        supplier_name: parsed.supplier_name != null ? String(parsed.supplier_name) : null,
        currency: parsed.currency != null ? String(parsed.currency) : null,
        incoterm_location:
          parsed.incoterm_location != null ? String(parsed.incoterm_location) : null,
        delivery_location:
          parsed.delivery_location != null ? String(parsed.delivery_location) : null,
        kawasan_berikat: parsed.kawasan_berikat as "Yes" | "No" | null | undefined,
        items,
      },
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      model,
    };
  } catch (err) {
    logger.error("Claude PDF extract failed", { error: String(err) });
    throw err;
  }
}
