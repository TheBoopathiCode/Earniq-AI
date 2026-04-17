-- Run this against your MySQL earniq database
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE workers    ADD INDEX IF NOT EXISTS idx_workers_zone_id  (zone_id);
ALTER TABLE workers    ADD INDEX IF NOT EXISTS idx_workers_is_active (is_active);
ALTER TABLE policies   ADD INDEX IF NOT EXISTS idx_policies_worker_id (worker_id);
ALTER TABLE policies   ADD INDEX IF NOT EXISTS idx_policies_is_active (is_active);
ALTER TABLE claims     ADD INDEX IF NOT EXISTS idx_claims_worker_id  (worker_id);
ALTER TABLE claims     ADD INDEX IF NOT EXISTS idx_claims_policy_id  (policy_id);
ALTER TABLE claims     ADD INDEX IF NOT EXISTS idx_claims_status     (status);
ALTER TABLE claims     ADD INDEX IF NOT EXISTS idx_claims_created_at (created_at);
ALTER TABLE claims     ADD INDEX IF NOT EXISTS idx_claims_paid_at    (paid_at);
