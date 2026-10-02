package models

import (
	"time"

	"github.com/google/uuid"
)

// Wearable samples stay separate from report observations and manual entries.
type WearableSample struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID             uuid.UUID `gorm:"type:uuid;not null;index:idx_wearable_member,priority:1"`
	MemberID           uuid.UUID `gorm:"type:uuid;not null;index:idx_wearable_member,priority:2"`
	MetricType         string    `gorm:"size:64;not null"`
	Source             string    `gorm:"type:text;not null"`
	Device             string    `gorm:"type:text;not null"`
	Unit               string    `gorm:"size:32;not null"`
	Value              float64   `gorm:"not null"`
	OriginalValue      string    `gorm:"type:text;not null"`
	OriginalUnit       string    `gorm:"size:32;not null"`
	StartOffsetMinutes int       `gorm:"not null"`
	EndOffsetMinutes   int       `gorm:"not null"`
	StartAt            time.Time `gorm:"not null"`
	EndAt              time.Time `gorm:"not null"`
	RecordDate         string    `gorm:"type:date;not null"`
	CreatedAt          time.Time
}
