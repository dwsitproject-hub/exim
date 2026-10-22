-- Syncera poll idempotency: skip no-op amend when payload fingerprint matches last applied sync.

ALTER TABLE import_purchase_order
  ADD COLUMN IF NOT EXISTS syncera_last_fingerprint VARCHAR(64);

COMMENT ON COLUMN import_purchase_order.syncera_last_fingerprint IS
  'SHA-256 hex of last applied Syncera-mapped PO payload; used by the SaaS poller to skip unchanged POs.';
