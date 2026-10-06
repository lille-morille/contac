ALTER TABLE contacts ADD COLUMN deleted_at timestamptz;

CREATE INDEX contacts_org_deleted_at_idx ON contacts (org_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
