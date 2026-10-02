CREATE TABLE IF NOT EXISTS family_members (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    relationship VARCHAR(40) NOT NULL,
    gender VARCHAR(24),
    birth_date TIMESTAMPTZ,
    is_self BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;
ALTER TABLE health_documents ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;
ALTER TABLE health_documents ADD COLUMN IF NOT EXISTS subject_name VARCHAR(80);
ALTER TABLE health_documents ADD COLUMN IF NOT EXISTS report_type VARCHAR(80);
ALTER TABLE metric_entries ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_member_id ON reports(member_id);
CREATE INDEX IF NOT EXISTS idx_health_documents_member_id ON health_documents(member_id);
CREATE INDEX IF NOT EXISTS idx_metric_entries_member_id ON metric_entries(member_id);
