package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ReportFilter struct {
	UserID    uuid.UUID
	Search    string
	Tag       string
	Hospital  string
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
	Offset    int
	Order     string
}

type ReportRepository interface {
	Create(ctx context.Context, report *models.Report) error
	FindByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*models.Report, error)
	List(ctx context.Context, filter ReportFilter) ([]models.Report, int64, error)
	Update(ctx context.Context, report *models.Report) error
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
}

type reportRepository struct {
	db *gorm.DB
}

func NewReportRepository(db *gorm.DB) ReportRepository {
	return &reportRepository{db: db}
}

func (r *reportRepository) Create(ctx context.Context, report *models.Report) error {
	if len(report.Tags) == 0 {
		report.Tags = datatypes.JSON([]byte("[]"))
	}
	// Use transaction to create report and files together
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Save files temporarily and clear from report to avoid GORM auto-creating them
		files := report.Files
		report.Files = nil

		if err := tx.Create(report).Error; err != nil {
			return err
		}

		// Create associated files if any
		if len(files) > 0 {
			for i := range files {
				files[i].ReportID = report.ID
				// Ensure ID is nil so BeforeCreate hook generates a new UUID
				files[i].ID = uuid.Nil
			}
			if err := tx.Create(&files).Error; err != nil {
				return err
			}
			// Restore files to report for later use
			report.Files = files
		}
		return nil
	})
}

func (r *reportRepository) FindByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*models.Report, error) {
	var report models.Report
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Preload("Files", func(db *gorm.DB) *gorm.DB {
			return db.Order("display_order ASC")
		}).
		First(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *reportRepository) List(ctx context.Context, filter ReportFilter) ([]models.Report, int64, error) {
	query := r.db.WithContext(ctx).Model(&models.Report{}).Where("user_id = ?", filter.UserID)

	if filter.Search != "" {
		search := "%" + strings.ToLower(filter.Search) + "%"
		query = query.Where("lower(title) LIKE ? OR lower(hospital) LIKE ?", search, search)
	}

	if filter.Tag != "" {
		query = query.Where("tags::text ILIKE ?", "%\""+filter.Tag+"\"%")
	}

	if filter.Hospital != "" {
		query = query.Where("lower(hospital) = ?", strings.ToLower(filter.Hospital))
	}

	if filter.StartDate != nil {
		query = query.Where("report_date >= ?", *filter.StartDate)
	}

	if filter.EndDate != nil {
		query = query.Where("report_date <= ?", *filter.EndDate)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if filter.Limit == 0 {
		filter.Limit = 50
	}
	if filter.Order == "" {
		filter.Order = "report_date DESC"
	}

	var reports []models.Report
	err := query.
		Preload("Files", func(db *gorm.DB) *gorm.DB {
			return db.Order("display_order ASC")
		}).
		Order(filter.Order).
		Limit(filter.Limit).
		Offset(filter.Offset).
		Find(&reports).Error
	if err != nil {
		return nil, 0, err
	}

	return reports, total, nil
}

func (r *reportRepository) Update(ctx context.Context, report *models.Report) error {
	if len(report.Tags) == 0 {
		report.Tags = datatypes.JSON([]byte("[]"))
	}
	return r.db.WithContext(ctx).Save(report).Error
}

func (r *reportRepository) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&models.Report{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
