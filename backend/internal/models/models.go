package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type BaseModel struct {
	ID        uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

func (m *BaseModel) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

type User struct {
	BaseModel
	Email         string `json:"email" gorm:"uniqueIndex"`
	PasswordHash  string `json:"-"` // store hashed password
	DisplayName   string `json:"displayName"`
	Pin           string `json:"-"` // hashed pin code
	PinEnabled    bool   `json:"pinEnabled"`
	LastLoginAt   *time.Time
	Reports       []Report
	MetricEntries []MetricEntry
}

type Report struct {
	BaseModel
	UserID       uuid.UUID      `json:"userId" gorm:"type:uuid;index"`
	Title        string         `json:"title" gorm:"size:200;not null"`
	Hospital     string         `json:"hospital" gorm:"size:160;not null"`
	ReportDate   time.Time      `json:"reportDate" gorm:"index"`
	FileType     string         `json:"fileType" gorm:"size:24"`
	FileSizeMB   float64        `json:"fileSizeMb"`
	FileURL      string         `json:"fileUrl" gorm:"size:512"`
	PreviewURL   string         `json:"previewUrl" gorm:"size:512"`
	Tags         datatypes.JSON `json:"tags" gorm:"type:jsonb"`
	Notes        string         `json:"notes" gorm:"type:text"`
	IsEncrypted  bool           `json:"isEncrypted" gorm:"default:true"`
	LastViewedAt *time.Time     `json:"lastViewedAt"`
}

type ReportShare struct {
	BaseModel
	ReportID   uuid.UUID  `json:"reportId" gorm:"type:uuid;index"`
	ShareToken string     `json:"shareToken" gorm:"size:64;uniqueIndex"`
	Password   *string    `json:"-"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	LastAccess *time.Time `json:"lastAccess"`
}

type MetricEntry struct {
	BaseModel
	UserID         uuid.UUID `json:"userId" gorm:"type:uuid;index"`
	MetricType     string    `json:"metricType" gorm:"size:64;index"`
	PrimaryValue   float64   `json:"primaryValue"`
	SecondaryValue *float64  `json:"secondaryValue,omitempty"`
	Unit           string    `json:"unit" gorm:"size:32"`
	RecordedAt     time.Time `json:"recordedAt" gorm:"index"`
	Notes          string    `json:"notes" gorm:"type:text"`
}
