-- Migration: Add user-level tag management
-- This migration creates a user_tags table to store tags at user level
-- and migrates existing tags from reports to user_tags

-- Step 1: Create user_tags table
CREATE TABLE IF NOT EXISTS user_tags (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(user_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user ON user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_name ON user_tags(user_id, tag_name);

-- Step 2: Migrate existing tags from reports to user_tags
-- Extract all unique tags from reports.tags JSONB column and create user_tags entries
INSERT INTO user_tags (id, user_id, tag_name, usage_count, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    r.user_id,
    tag_value as tag_name,
    COUNT(*) as usage_count,
    MIN(r.created_at) as created_at,
    MAX(r.updated_at) as updated_at
FROM reports r,
     jsonb_array_elements_text(r.tags) as tag_value
WHERE r.tags IS NOT NULL 
  AND jsonb_array_length(r.tags) > 0
  AND tag_value IS NOT NULL
  AND tag_value != ''
GROUP BY r.user_id, tag_value
ON CONFLICT (user_id, tag_name) 
DO UPDATE SET 
    usage_count = user_tags.usage_count + EXCLUDED.usage_count,
    updated_at = GREATEST(user_tags.updated_at, EXCLUDED.updated_at);

-- Step 3: Add a comment explaining the migration
COMMENT ON TABLE user_tags IS 'Stores user-level tags extracted from reports. Allows tags to be shared across multiple reports.';

