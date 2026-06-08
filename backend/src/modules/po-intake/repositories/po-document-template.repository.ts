/**
 * PO document template repository — layout fingerprints and parse rules.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export type PoDocumentTemplateSource = "seeded" | "claude_learned";
export type PoNumberFormat = "us" | "eu" | "auto";

export interface PoDocumentTemplateFieldPatterns {
  po_number?: string[];
  supplier?: string[];
  currency?: string[];
}

export interface PoDocumentTemplateRow {
  id: string;
  code: string;
  name: string;
  fingerprint_phrases: string[];
  number_format: PoNumberFormat;
  field_patterns: PoDocumentTemplateFieldPatterns;
  item_row_pattern: string | null;
  source: PoDocumentTemplateSource;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToTemplate(r: Record<string, unknown>): PoDocumentTemplateRow {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    fingerprint_phrases: Array.isArray(r.fingerprint_phrases)
      ? (r.fingerprint_phrases as string[])
      : [],
    number_format: (r.number_format as PoNumberFormat) ?? "auto",
    field_patterns:
      r.field_patterns && typeof r.field_patterns === "object"
        ? (r.field_patterns as PoDocumentTemplateFieldPatterns)
        : {},
    item_row_pattern: r.item_row_pattern != null ? String(r.item_row_pattern) : null,
    source: (r.source as PoDocumentTemplateSource) ?? "seeded",
    is_active: Boolean(r.is_active),
    created_at: r.created_at as Date,
    updated_at: r.updated_at as Date,
  };
}

export class PoDocumentTemplateRepository {
  private pool(): Pool {
    return getPool();
  }

  async listActive(): Promise<PoDocumentTemplateRow[]> {
    const result = await this.pool().query(
      `SELECT id, code, name, fingerprint_phrases, number_format, field_patterns,
              item_row_pattern, source, is_active, created_at, updated_at
       FROM po_document_templates
       WHERE is_active = TRUE
       ORDER BY source ASC, code ASC`
    );
    return result.rows.map(rowToTemplate);
  }

  async findByCode(code: string): Promise<PoDocumentTemplateRow | null> {
    const result = await this.pool().query(
      `SELECT id, code, name, fingerprint_phrases, number_format, field_patterns,
              item_row_pattern, source, is_active, created_at, updated_at
       FROM po_document_templates
       WHERE code = $1 AND is_active = TRUE`,
      [code]
    );
    return result.rows[0] ? rowToTemplate(result.rows[0]) : null;
  }

  async upsertAutoTemplate(input: {
    code: string;
    name: string;
    fingerprint_phrases: string[];
    number_format: PoNumberFormat;
    field_patterns: PoDocumentTemplateFieldPatterns;
    item_row_pattern: string | null;
  }): Promise<PoDocumentTemplateRow> {
    const result = await this.pool().query(
      `INSERT INTO po_document_templates
         (code, name, fingerprint_phrases, number_format, field_patterns, item_row_pattern, source)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, 'claude_learned')
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         fingerprint_phrases = EXCLUDED.fingerprint_phrases,
         number_format = EXCLUDED.number_format,
         field_patterns = EXCLUDED.field_patterns,
         item_row_pattern = EXCLUDED.item_row_pattern,
         updated_at = NOW()
       RETURNING id, code, name, fingerprint_phrases, number_format, field_patterns,
                 item_row_pattern, source, is_active, created_at, updated_at`,
      [
        input.code,
        input.name,
        JSON.stringify(input.fingerprint_phrases),
        input.number_format,
        JSON.stringify(input.field_patterns),
        input.item_row_pattern,
      ]
    );
    return rowToTemplate(result.rows[0]);
  }
}
