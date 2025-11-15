-- users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    pin TEXT NOT NULL DEFAULT '',
    pin_enabled BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- reports table
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    hospital TEXT NOT NULL,
    report_date DATE NOT NULL,
    file_type TEXT,
    file_size_mb DOUBLE PRECISION,
    file_url TEXT,
    preview_url TEXT,
    tags JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    is_encrypted BOOLEAN NOT NULL DEFAULT true,
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_report_date ON reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_tags ON reports USING GIN (tags);

-- metric_entries table
CREATE TABLE IF NOT EXISTS metric_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    primary_value DOUBLE PRECISION NOT NULL,
    secondary_value DOUBLE PRECISION,
    unit TEXT,
    recorded_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_metric_entries_user_type ON metric_entries(user_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_metric_entries_recorded_at ON metric_entries(recorded_at);

