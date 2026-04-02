-- D3: Cap webhook URL length and response body length

ALTER TABLE webhooks ALTER COLUMN url TYPE varchar(2048);
ALTER TABLE webhook_deliveries ALTER COLUMN response TYPE varchar(4096);

-- D4: Add CHECK constraints on enum-like columns to prevent invalid values
ALTER TABLE documents ADD CONSTRAINT chk_documents_status
  CHECK (status IN ('pending', 'processing', 'ready', 'failed'));

ALTER TABLE memories ADD CONSTRAINT chk_memories_source
  CHECK (source IN ('user', 'auto'));

ALTER TABLE api_tokens ADD CONSTRAINT chk_api_tokens_permission
  CHECK (permission IN ('read', 'write', 'admin'));
