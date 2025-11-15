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
	Update(ctx context.Context, userID, reportID uuid.UUID, input UpdateReportInput) (*ReportDTO, error)
	Delete(ctx context.Context, userID, reportID uuid.UUID) error
	ListHospitals(ctx context.Context, userID uuid.UUID) ([]string, error)
}

type reportService struct {
	repo repository.ReportRepository
}

func NewReportService(repo repository.ReportRepository) ReportService {
	return &reportService{repo: repo}
}

type CreateReportFileInput struct {
	FileType     string  `json:"fileType"`
	FileSizeMB   float64 `json:"fileSizeMb"`
	FileURL      string  `json:"fileUrl"`
	PreviewURL   string  `json:"previewUrl"`
	DisplayOrder int     `json:"displayOrder"`
}

type CreateReportInput struct {
	Title       string                  `json:"title" binding:"required"`
	Hospital    string                  `json:"hospital" binding:"required"`
	ReportDate  time.Time               `json:"reportDate" binding:"required"`
	FileType    string                  `json:"fileType"`
	FileSizeMB  float64                 `json:"fileSizeMb"`
	FileURL     string                  `json:"fileUrl"`
	PreviewURL  string                  `json:"previewUrl"`
	Files       []CreateReportFileInput `json:"files,omitempty"`
	Tags        []string                `json:"tags"`
	Notes       string                  `json:"notes"`
	IsEncrypted bool                    `json:"isEncrypted"`
}

type UpdateReportInput struct {
	Title      *string    `json:"title"`
	Hospital   *string    `json:"hospital"`
	ReportDate *time.Time `json:"reportDate"`
	Tags       []string   `json:"tags"`
	Notes      *string    `json:"notes"`
}

type ReportFileDTO struct {
	ID           uuid.UUID `json:"id"`
	FileType     string    `json:"fileType"`
	FileSizeMB   float64   `json:"fileSizeMb"`
	FileURL      string    `json:"fileUrl"`
	PreviewURL   string    `json:"previewUrl,omitempty"`
	DisplayOrder int       `json:"displayOrder"`
}

type ReportDTO struct {
	ID          uuid.UUID       `json:"id"`
	Title       string          `json:"title"`
	Hospital    string          `json:"hospital"`
	ReportDate  time.Time       `json:"reportDate"`
	FileType    string          `json:"fileType"`
	FileSizeMB  float64         `json:"fileSizeMb"`
	FileURL     string          `json:"fileUrl"`
	PreviewURL  string          `json:"previewUrl"`
	Tags        []string        `json:"tags"`
	Notes       string          `json:"notes"`
	IsEncrypted bool            `json:"isEncrypted"`
	LastViewed  *time.Time      `json:"lastViewedAt,omitempty"`
	Files       []ReportFileDTO `json:"files,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
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

	// Determine main file info (for backward compatibility)
	mainFileType := input.FileType
	mainFileSizeMB := input.FileSizeMB
	mainFileURL := input.FileURL
	mainPreviewURL := input.PreviewURL

	// If files array is provided, use the first file as main file
	if len(input.Files) > 0 {
		mainFileType = input.Files[0].FileType
		mainFileSizeMB = input.Files[0].FileSizeMB
		mainFileURL = input.Files[0].FileURL
		mainPreviewURL = input.Files[0].PreviewURL
	}

	report := &models.Report{
		UserID:      userID,
		Title:       input.Title,
		Hospital:    input.Hospital,
		ReportDate:  input.ReportDate,
		FileType:    mainFileType,
		FileSizeMB:  mainFileSizeMB,
		FileURL:     mainFileURL,
		PreviewURL:  mainPreviewURL,
		Tags:        datatypes.JSON(tagsJSON),
		Notes:       input.Notes,
		IsEncrypted: input.IsEncrypted,
	}

	// Create report files from input
	if len(input.Files) > 0 {
		report.Files = make([]models.ReportFile, 0, len(input.Files))
		for i, fileInput := range input.Files {
			report.Files = append(report.Files, models.ReportFile{
				FileType:     fileInput.FileType,
				FileSizeMB:   fileInput.FileSizeMB,
				FileURL:      fileInput.FileURL,
				PreviewURL:   fileInput.PreviewURL,
				DisplayOrder: fileInput.DisplayOrder,
			})
			if report.Files[i].DisplayOrder == 0 {
				report.Files[i].DisplayOrder = i
			}
		}
	} else if mainFileURL != "" {
		// If no files array but main file exists, create a single file entry
		report.Files = []models.ReportFile{
			{
				FileType:     mainFileType,
				FileSizeMB:   mainFileSizeMB,
				FileURL:      mainFileURL,
				PreviewURL:   mainPreviewURL,
				DisplayOrder: 0,
			},
		}
	}

	if err := s.repo.Create(ctx, report); err != nil {
		return nil, err
	}

	// Reload report with files
	report, err = s.repo.FindByID(ctx, report.ID, userID)
	if err != nil {
		return nil, err
	}
	if report == nil {
		return nil, gorm.ErrRecordNotFound
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

func (s *reportService) Update(ctx context.Context, userID, reportID uuid.UUID, input UpdateReportInput) (*ReportDTO, error) {
	report, err := s.repo.FindByID(ctx, reportID, userID)
	if err != nil {
		return nil, err
	}
	if report == nil {
		return nil, gorm.ErrRecordNotFound
	}

	// Update fields if provided
	if input.Title != nil {
		report.Title = *input.Title
	}
	if input.Hospital != nil {
		report.Hospital = *input.Hospital
	}
	if input.ReportDate != nil {
		report.ReportDate = *input.ReportDate
	}
	if input.Notes != nil {
		report.Notes = *input.Notes
	}
	if input.Tags != nil {
		tagsJSON, err := json.Marshal(input.Tags)
		if err != nil {
			return nil, err
		}
		report.Tags = datatypes.JSON(tagsJSON)
	}

	if err := s.repo.Update(ctx, report); err != nil {
		return nil, err
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

func (s *reportService) ListHospitals(ctx context.Context, userID uuid.UUID) ([]string, error) {
	reports, _, err := s.repo.List(ctx, repository.ReportFilter{
		UserID: userID,
		Limit:  1000, // Get all reports to extract hospitals
	})
	if err != nil {
		return nil, err
	}

	hospitalMap := make(map[string]bool)
	for _, report := range reports {
		if report.Hospital != "" {
			hospitalMap[report.Hospital] = true
		}
	}

	hospitals := make([]string, 0, len(hospitalMap))
	for hospital := range hospitalMap {
		hospitals = append(hospitals, hospital)
	}

	return hospitals, nil
}

func mapReportToDTO(report *models.Report) (*ReportDTO, error) {
	var tags []string
	if len(report.Tags) > 0 {
		if err := json.Unmarshal([]byte(report.Tags), &tags); err != nil {
			return nil, err
		}
	}

	// Map report files to DTOs
	files := make([]ReportFileDTO, 0, len(report.Files))
	for _, file := range report.Files {
		files = append(files, ReportFileDTO{
			ID:           file.ID,
			FileType:     file.FileType,
			FileSizeMB:   file.FileSizeMB,
			FileURL:      file.FileURL,
			PreviewURL:   file.PreviewURL,
			DisplayOrder: file.DisplayOrder,
		})
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
		Files:       files,
		CreatedAt:   report.CreatedAt,
		UpdatedAt:   report.UpdatedAt,
	}, nil
}
