package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ReportService interface {
	Create(ctx context.Context, userID uuid.UUID, input CreateReportInput) (*ReportDTO, error)
	List(ctx context.Context, filter repository.ReportFilter) (*PaginatedReports, error)
	Get(ctx context.Context, userID, reportID uuid.UUID) (*ReportDTO, error)
	Delete(ctx context.Context, userID, reportID uuid.UUID) error
}

type reportService struct {
	repo repository.ReportRepository
}

func NewReportService(repo repository.ReportRepository) ReportService {
	return &reportService{repo: repo}
}

type CreateReportInput struct {
	Title       string    `json:"title" binding:"required"`
	Hospital    string    `json:"hospital" binding:"required"`
	ReportDate  time.Time `json:"reportDate" binding:"required"`
	FileType    string    `json:"fileType"`
	FileSizeMB  float64   `json:"fileSizeMb"`
	FileURL     string    `json:"fileUrl"`
	PreviewURL  string    `json:"previewUrl"`
	Tags        []string  `json:"tags"`
	Notes       string    `json:"notes"`
	IsEncrypted bool      `json:"isEncrypted"`
}

type ReportDTO struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Hospital    string     `json:"hospital"`
	ReportDate  time.Time  `json:"reportDate"`
	FileType    string     `json:"fileType"`
	FileSizeMB  float64    `json:"fileSizeMb"`
	FileURL     string     `json:"fileUrl"`
	PreviewURL  string     `json:"previewUrl"`
	Tags        []string   `json:"tags"`
	Notes       string     `json:"notes"`
	IsEncrypted bool       `json:"isEncrypted"`
	LastViewed  *time.Time `json:"lastViewedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type PaginatedReports struct {
	Items  []ReportDTO `json:"items"`
	Total  int64       `json:"total"`
	Limit  int         `json:"limit"`
	Offset int         `json:"offset"`
}

func (s *reportService) Create(ctx context.Context, userID uuid.UUID, input CreateReportInput) (*ReportDTO, error) {
	tagsJSON, err := json.Marshal(input.Tags)
	if err != nil {
		return nil, err
	}

	report := &models.Report{
		UserID:      userID,
		Title:       input.Title,
		Hospital:    input.Hospital,
		ReportDate:  input.ReportDate,
		FileType:    input.FileType,
		FileSizeMB:  input.FileSizeMB,
		FileURL:     input.FileURL,
		PreviewURL:  input.PreviewURL,
		Tags:        datatypes.JSON(tagsJSON),
		Notes:       input.Notes,
		IsEncrypted: input.IsEncrypted,
	}

	if err := s.repo.Create(ctx, report); err != nil {
		return nil, err
	}

	return mapReportToDTO(report)
}

func (s *reportService) List(ctx context.Context, filter repository.ReportFilter) (*PaginatedReports, error) {
	reports, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]ReportDTO, 0, len(reports))
	for _, report := range reports {
		dto, err := mapReportToDTO(&report)
		if err != nil {
			return nil, err
		}
		items = append(items, *dto)
	}

	return &PaginatedReports{
		Items:  items,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}, nil
}

func (s *reportService) Get(ctx context.Context, userID, reportID uuid.UUID) (*ReportDTO, error) {
	report, err := s.repo.FindByID(ctx, reportID, userID)
	if err != nil {
		return nil, err
	}
	if report == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return mapReportToDTO(report)
}

func (s *reportService) Delete(ctx context.Context, userID, reportID uuid.UUID) error {
	if err := s.repo.Delete(ctx, reportID, userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return err
	}
	return nil
}

func mapReportToDTO(report *models.Report) (*ReportDTO, error) {
	var tags []string
	if len(report.Tags) > 0 {
		if err := json.Unmarshal([]byte(report.Tags), &tags); err != nil {
			return nil, err
		}
	}

	return &ReportDTO{
		ID:          report.ID,
		Title:       report.Title,
		Hospital:    report.Hospital,
		ReportDate:  report.ReportDate,
		FileType:    report.FileType,
		FileSizeMB:  report.FileSizeMB,
		FileURL:     report.FileURL,
		PreviewURL:  report.PreviewURL,
		Tags:        tags,
		Notes:       report.Notes,
		IsEncrypted: report.IsEncrypted,
		LastViewed:  report.LastViewedAt,
		CreatedAt:   report.CreatedAt,
		UpdatedAt:   report.UpdatedAt,
	}, nil
}
