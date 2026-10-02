CREATE TABLE IF NOT EXISTS document_medications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    generic_name VARCHAR(160),
    specification VARCHAR(120),
    dose VARCHAR(80),
    frequency VARCHAR(80),
    route VARCHAR(80),
    duration VARCHAR(80),
    quantity VARCHAR(80),
    instructions VARCHAR(300),
    confidence DOUBLE PRECISION,
    review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_document_medications_user_id ON document_medications(user_id);
CREATE INDEX IF NOT EXISTS idx_document_medications_document_id ON document_medications(document_id);
CREATE INDEX IF NOT EXISTS idx_document_medications_generic_name ON document_medications(generic_name);
