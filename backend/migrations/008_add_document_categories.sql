ALTER TABLE health_documents
ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE health_documents
SET categories = jsonb_build_array(category)
WHERE categories = '[]'::jsonb AND category IS NOT NULL AND category <> '';

CREATE INDEX IF NOT EXISTS idx_health_documents_categories
ON health_documents USING GIN (categories);
