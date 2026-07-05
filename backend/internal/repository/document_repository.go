package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/example/phr-backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type DocumentFilter struct {
	UserID   uuid.UUID
	Search   string
	Category string
	Status   string
	Limit    int
	Offset   int
}

type DocumentRepository interface {
	CreateWithArtifacts(ctx context.Context, document *models.HealthDocument, files []models.DocumentFile, ocrResults []models.OCRResult, analyses []models.AIAnalysis, reviewTasks []models.ReviewTask) error
	FindByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*models.HealthDocument, error)
	List(ctx context.Context, filter DocumentFilter) ([]models.HealthDocument, int64, error)
	CountOpenReviewTasks(ctx context.Context, documentID uuid.UUID) (int64, error)
}

type documentRepository struct {
	db *gorm.DB
}

func NewDocumentRepository(db *gorm.DB) DocumentRepository {
	return &documentRepository{db: db}
}

func (r *documentRepository) CreateWithArtifacts(ctx context.Context, document *models.HealthDocument, files []models.DocumentFile, ocrResults []models.OCRResult, analyses []models.AIAnalysis, reviewTasks []models.ReviewTask) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(document).Error; err != nil {
			return err
		}

		if len(files) > 0 {
			for i := range files {
				files[i].DocumentID = document.ID
				files[i].ID = uuid.Nil
			}
			if err := tx.Create(&files).Error; err != nil {
				return err
			}
			document.Files = files
		}

		if len(ocrResults) > 0 {
			for i := range ocrResults {
				ocrResults[i].DocumentID = document.ID
				ocrResults[i].ID = uuid.Nil
			}
			if err := tx.Create(&ocrResults).Error; err != nil {
				return err
			}
			document.OCRResults = ocrResults
		}

		if len(analyses) > 0 {
			for i := range analyses {
				analyses[i].DocumentID = document.ID
				analyses[i].ID = uuid.Nil
			}
			if err := tx.Create(&analyses).Error; err != nil {
				return err
			}
			document.Analyses = analyses
		}

		if len(reviewTasks) > 0 {
			for i := range reviewTasks {
				reviewTasks[i].DocumentID = document.ID
				reviewTasks[i].UserID = document.UserID
				reviewTasks[i].ID = uuid.Nil
			}
			if err := tx.Create(&reviewTasks).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *documentRepository) FindByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*models.HealthDocument, error) {
	var document models.HealthDocument
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Preload("Files", func(db *gorm.DB) *gorm.DB {
			return db.Order("display_order ASC")
		}).
		Preload("OCRResults", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC")
		}).
		Preload("Analyses", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC")
		}).
		First(&document).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &document, nil
}

func (r *documentRepository) List(ctx context.Context, filter DocumentFilter) ([]models.HealthDocument, int64, error) {
	query := r.db.WithContext(ctx).
		Model(&models.HealthDocument{}).
		Where("user_id = ?", filter.UserID)

	if filter.Search != "" {
		search := "%" + strings.ToLower(filter.Search) + "%"
		query = query.Where("lower(title) LIKE ? OR lower(summary) LIKE ? OR lower(organization) LIKE ?", search, search, search)
	}

	if filter.Category != "" {
		query = query.Where("category = ?", filter.Category)
	}

	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if filter.Limit == 0 {
		filter.Limit = 50
	}

	var documents []models.HealthDocument
	err := query.
		Preload("Files", func(db *gorm.DB) *gorm.DB {
			return db.Order("display_order ASC")
		}).
		Preload("Analyses", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC")
		}).
		Order("created_at DESC").
		Limit(filter.Limit).
		Offset(filter.Offset).
		Find(&documents).Error
	if err != nil {
		return nil, 0, err
	}

	return documents, total, nil
}

func (r *documentRepository) CountOpenReviewTasks(ctx context.Context, documentID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.ReviewTask{}).
		Where("document_id = ? AND status = ?", documentID, "open").
		Count(&count).Error
	return count, err
}
