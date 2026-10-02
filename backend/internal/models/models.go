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
	FamilyMembers []FamilyMember
}

type FamilyMember struct {
	BaseModel
	UserID       uuid.UUID  `json:"userId" gorm:"type:uuid;index;not null"`
	Name         string     `json:"name" gorm:"size:80;not null"`
	Relationship string     `json:"relationship" gorm:"size:40;not null"`
	Gender       string     `json:"gender" gorm:"size:24"`
	BirthDate    *time.Time `json:"birthDate"`
	IsSelf       bool       `json:"isSelf" gorm:"default:false"`
}

type Report struct {
	BaseModel
	UserID       uuid.UUID      `json:"userId" gorm:"type:uuid;index"`
	MemberID     *uuid.UUID     `json:"memberId,omitempty" gorm:"type:uuid;index"`
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
	Files        []ReportFile   `json:"files" gorm:"foreignKey:ReportID"`
}

type ReportFile struct {
	BaseModel
	ReportID     uuid.UUID `json:"reportId" gorm:"type:uuid;index"`
	FileType     string    `json:"fileType" gorm:"size:24;not null"`
	FileSizeMB   float64   `json:"fileSizeMb" gorm:"not null"`
	FileURL      string    `json:"fileUrl" gorm:"size:512;not null"`
	PreviewURL   string    `json:"previewUrl" gorm:"size:512"`
	DisplayOrder int       `json:"displayOrder" gorm:"default:0"`
	Rotation     int       `json:"rotation" gorm:"default:0"`
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
	UserID         uuid.UUID  `json:"userId" gorm:"type:uuid;index"`
	MemberID       *uuid.UUID `json:"memberId,omitempty" gorm:"type:uuid;index"`
	MetricType     string     `json:"metricType" gorm:"size:64;index"`
	PrimaryValue   float64    `json:"primaryValue"`
	SecondaryValue *float64   `json:"secondaryValue,omitempty"`
	Unit           string     `json:"unit" gorm:"size:32"`
	RecordedAt     time.Time  `json:"recordedAt" gorm:"index"`
	Notes          string     `json:"notes" gorm:"type:text"`
}

type HealthDocument struct {
	BaseModel
	UserID       uuid.UUID              `json:"userId" gorm:"type:uuid;index"`
	MemberID     *uuid.UUID             `json:"memberId,omitempty" gorm:"type:uuid;index"`
	Title        string                 `json:"title" gorm:"size:200;not null"`
	Category     string                 `json:"category" gorm:"size:64;index"`
	Categories   datatypes.JSON         `json:"categories" gorm:"type:jsonb;default:'[]'"`
	Subcategory  string                 `json:"subcategory" gorm:"size:64;index"`
	SourceType   string                 `json:"sourceType" gorm:"size:32;index"`
	Status       string                 `json:"status" gorm:"size:32;index;default:'uploaded'"`
	Organization string                 `json:"organization" gorm:"size:160"`
	Department   string                 `json:"department" gorm:"size:120"`
	SubjectName  string                 `json:"subjectName" gorm:"size:80"`
	ReportType   string                 `json:"reportType" gorm:"size:80;index"`
	DocumentDate *time.Time             `json:"documentDate" gorm:"index"`
	Summary      string                 `json:"summary" gorm:"type:text"`
	AIConclusion string                 `json:"aiConclusion" gorm:"type:text"`
	Confidence   *float64               `json:"confidence"`
	Metadata     datatypes.JSON         `json:"metadata" gorm:"type:jsonb"`
	Files        []DocumentFile         `json:"files" gorm:"foreignKey:DocumentID"`
	OCRResults   []OCRResult            `json:"ocrResults" gorm:"foreignKey:DocumentID"`
	Observations []ExtractedObservation `json:"observations" gorm:"foreignKey:DocumentID"`
	Medications  []DocumentMedication   `json:"medications" gorm:"foreignKey:DocumentID"`
	Analyses     []AIAnalysis           `json:"analyses" gorm:"foreignKey:DocumentID"`
}

type DocumentMedication struct {
	BaseModel
	UserID        uuid.UUID `json:"userId" gorm:"type:uuid;index;not null"`
	DocumentID    uuid.UUID `json:"documentId" gorm:"type:uuid;index;not null"`
	Name          string    `json:"name" gorm:"size:160;not null"`
	GenericName   string    `json:"genericName" gorm:"size:160;index"`
	Specification string    `json:"specification" gorm:"size:120"`
	Dose          string    `json:"dose" gorm:"size:80"`
	Frequency     string    `json:"frequency" gorm:"size:80"`
	Route         string    `json:"route" gorm:"size:80"`
	Duration      string    `json:"duration" gorm:"size:80"`
	Quantity      string    `json:"quantity" gorm:"size:80"`
	Instructions  string    `json:"instructions" gorm:"size:300"`
	Confidence    *float64  `json:"confidence"`
	ReviewStatus  string    `json:"reviewStatus" gorm:"size:32;index;default:'pending'"`
}

type DocumentFile struct {
	BaseModel
	DocumentID   uuid.UUID `json:"documentId" gorm:"type:uuid;index"`
	FileURL      string    `json:"fileUrl" gorm:"size:512;not null"`
	PreviewURL   string    `json:"previewUrl" gorm:"size:512"`
	MimeType     string    `json:"mimeType" gorm:"size:120"`
	FileSize     int64     `json:"fileSize"`
	PageCount    int       `json:"pageCount"`
	SHA256       string    `json:"sha256" gorm:"size:64;index"`
	DisplayOrder int       `json:"displayOrder" gorm:"default:0"`
}

type OCRResult struct {
	BaseModel
	DocumentID    uuid.UUID      `json:"documentId" gorm:"type:uuid;index"`
	Provider      string         `json:"provider" gorm:"size:64"`
	RawText       string         `json:"rawText" gorm:"type:text"`
	PagesJSON     datatypes.JSON `json:"pagesJson" gorm:"type:jsonb"`
	TablesJSON    datatypes.JSON `json:"tablesJson" gorm:"type:jsonb"`
	KeyValuesJSON datatypes.JSON `json:"keyValuesJson" gorm:"type:jsonb"`
	Confidence    *float64       `json:"confidence"`
}

type ExtractedObservation struct {
	BaseModel
	UserID         uuid.UUID      `json:"userId" gorm:"type:uuid;index"`
	DocumentID     uuid.UUID      `json:"documentId" gorm:"type:uuid;index"`
	Name           string         `json:"name" gorm:"size:160;not null"`
	NormalizedName string         `json:"normalizedName" gorm:"size:160;index"`
	CodeSystem     string         `json:"codeSystem" gorm:"size:64"`
	Code           string         `json:"code" gorm:"size:64;index"`
	ValueNumber    *float64       `json:"valueNumber"`
	ValueText      string         `json:"valueText" gorm:"size:200"`
	Unit           string         `json:"unit" gorm:"size:32"`
	ReferenceLow   *float64       `json:"referenceLow"`
	ReferenceHigh  *float64       `json:"referenceHigh"`
	ReferenceText  string         `json:"referenceText" gorm:"size:160"`
	AbnormalFlag   string         `json:"abnormalFlag" gorm:"size:32;index"`
	ObservedAt     *time.Time     `json:"observedAt" gorm:"index"`
	SourcePage     int            `json:"sourcePage"`
	SourceBBoxJSON datatypes.JSON `json:"sourceBBoxJson" gorm:"type:jsonb"`
	Confidence     *float64       `json:"confidence"`
	ReviewStatus   string         `json:"reviewStatus" gorm:"size:32;index;default:'pending'"`
}

type AIAnalysis struct {
	BaseModel
	DocumentID          uuid.UUID      `json:"documentId" gorm:"type:uuid;index"`
	Model               string         `json:"model" gorm:"size:120"`
	AnalysisType        string         `json:"analysisType" gorm:"size:64;index"`
	Summary             string         `json:"summary" gorm:"type:text"`
	FindingsJSON        datatypes.JSON `json:"findingsJson" gorm:"type:jsonb"`
	RisksJSON           datatypes.JSON `json:"risksJson" gorm:"type:jsonb"`
	RecommendationsJSON datatypes.JSON `json:"recommendationsJson" gorm:"type:jsonb"`
	CitationsJSON       datatypes.JSON `json:"citationsJson" gorm:"type:jsonb"`
	Confidence          *float64       `json:"confidence"`
}

type ReviewTask struct {
	BaseModel
	UserID         uuid.UUID      `json:"userId" gorm:"type:uuid;index"`
	DocumentID     uuid.UUID      `json:"documentId" gorm:"type:uuid;index"`
	TaskType       string         `json:"taskType" gorm:"size:64;index"`
	FieldName      string         `json:"fieldName" gorm:"size:120"`
	SuggestedValue string         `json:"suggestedValue" gorm:"type:text"`
	SourcePage     int            `json:"sourcePage"`
	SourceBBoxJSON datatypes.JSON `json:"sourceBBoxJson" gorm:"type:jsonb"`
	Confidence     *float64       `json:"confidence"`
	Status         string         `json:"status" gorm:"size:32;index;default:'open'"`
	ResolvedValue  string         `json:"resolvedValue" gorm:"type:text"`
	ResolvedAt     *time.Time     `json:"resolvedAt"`
}
