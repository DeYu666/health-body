CREATE TABLE IF NOT EXISTS wearable_samples (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    member_id uuid NOT NULL,
    metric_type varchar(64) NOT NULL,
    source text NOT NULL,
    device text NOT NULL,
    unit varchar(32) NOT NULL,
    value double precision NOT NULL,
    original_value text NOT NULL,
    original_unit varchar(32) NOT NULL,
    start_offset_minutes integer NOT NULL,
    end_offset_minutes integer NOT NULL,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    record_date date NOT NULL,
    created_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wearable_member ON wearable_samples (user_id, member_id);
