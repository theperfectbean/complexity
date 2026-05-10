-- Migration: Remove webhook tables
-- Webhook feature removed; tables no longer needed
DROP TABLE IF EXISTS "webhook_deliveries";
DROP TABLE IF EXISTS "webhooks";
