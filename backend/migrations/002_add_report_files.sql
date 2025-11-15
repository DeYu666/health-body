-- Migration: Add support for multiple files per report
-- This migration adds a report_files table to support multiple files per report
-- while preserving existing data

-- Step 1: Create report_files table
CREATE TABLE IF NOT EXISTS report_files (
    id UUID PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL,
    file_size_mb DOUBLE PRECISION NOT NULL,
    file_url TEXT NOT NULL,
    preview_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_report_files_report ON report_files(report_id);
CREATE INDEX IF NOT EXISTS idx_report_files_display_order ON report_files(report_id, display_order);

-- Step 2: Migrate existing data from reports table to report_files table
-- This preserves all existing file data
INSERT INTO report_files (id, report_id, file_type, file_size_mb, file_url, preview_url, display_order, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    r.id as report_id,
    COALESCE(r.file_type, 'pdf') as file_type,
    COALESCE(r.file_size_mb, 0) as file_size_mb,
    COALESCE(r.file_url, '') as file_url,
    COALESCE(r.preview_url, r.file_url) as preview_url,
    0 as display_order,
    r.created_at,
    r.updated_at
FROM reports r
WHERE r.file_url IS NOT NULL AND r.file_url != ''
ON CONFLICT DO NOTHING;

-- Step 3: Add a comment explaining the migration
COMMENT ON TABLE report_files IS 'Stores multiple files associated with a report. Migrated from reports.file_url, reports.preview_url, etc.';

