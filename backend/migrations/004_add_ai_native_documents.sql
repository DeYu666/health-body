-- Migration: Add AI-native health document processing tables
-- These tables keep original documents, OCR output, extracted observations,
-- AI analyses, and user review tasks separate from legacy report metadata.

CREATE TABLE IF NOT EXISTS health_documents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    source_type TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    organization TEXT,
    department TEXT,
    document_date TIMESTAMPTZ,
    summary TEXT,
    ai_conclusion TEXT,
    confidence DOUBLE PRECISION,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_documents_user ON health_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_health_documents_category ON health_documents(category);
CREATE INDEX IF NOT EXISTS idx_health_documents_subcategory ON health_documents(subcategory);
CREATE INDEX IF NOT EXISTS idx_health_documents_source_type ON health_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_health_documents_status ON health_documents(status);
CREATE INDEX IF NOT EXISTS idx_health_documents_document_date ON health_documents(document_date);

CREATE TABLE IF NOT EXISTS document_files (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    preview_url TEXT,
    mime_type TEXT,
    file_size BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_document_files_document ON document_files(document_id);
CREATE INDEX IF NOT EXISTS idx_document_files_sha256 ON document_files(sha256);
CREATE INDEX IF NOT EXISTS idx_document_files_display_order ON document_files(document_id, display_order);

CREATE TABLE IF NOT EXISTS ocr_results (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    provider TEXT,
    raw_text TEXT,
    pages_json JSONB NOT NULL DEFAULT '[]',
    tables_json JSONB NOT NULL DEFAULT '[]',
    key_values_json JSONB NOT NULL DEFAULT '{}',
    confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_document ON ocr_results(document_id);

CREATE TABLE IF NOT EXISTS extracted_observations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT,
    code_system TEXT,
    code TEXT,
    value_number DOUBLE PRECISION,
    value_text TEXT,
    unit TEXT,
    reference_low DOUBLE PRECISION,
    reference_high DOUBLE PRECISION,
    reference_text TEXT,
    abnormal_flag TEXT,
    observed_at TIMESTAMPTZ,
    source_page INTEGER NOT NULL DEFAULT 0,
    source_bbox_json JSONB NOT NULL DEFAULT '{}',
    confidence DOUBLE PRECISION,
    review_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_extracted_observations_user ON extracted_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_document ON extracted_observations(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_normalized_name ON extracted_observations(normalized_name);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_code ON extracted_observations(code);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_abnormal_flag ON extracted_observations(abnormal_flag);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_observed_at ON extracted_observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_extracted_observations_review_status ON extracted_observations(review_status);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    model TEXT,
    analysis_type TEXT,
    summary TEXT,
    findings_json JSONB NOT NULL DEFAULT '[]',
    risks_json JSONB NOT NULL DEFAULT '[]',
    recommendations_json JSONB NOT NULL DEFAULT '[]',
    citations_json JSONB NOT NULL DEFAULT '[]',
    confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_document ON ai_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_analysis_type ON ai_analyses(analysis_type);

CREATE TABLE IF NOT EXISTS review_tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    task_type TEXT,
    field_name TEXT,
    suggested_value TEXT,
    source_page INTEGER NOT NULL DEFAULT 0,
    source_bbox_json JSONB NOT NULL DEFAULT '{}',
    confidence DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_value TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_user ON review_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_review_tasks_document ON review_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_review_tasks_task_type ON review_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_review_tasks_status ON review_tasks(status);

COMMENT ON TABLE health_documents IS 'AI-native health document records that represent imported medical materials beyond legacy reports.';
COMMENT ON TABLE extracted_observations IS 'Normalized observations extracted by OCR/AI from health documents, intended to feed health trends.';
