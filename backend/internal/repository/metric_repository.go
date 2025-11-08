package repository

import (
	"context"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MetricFilter struct {
	UserID     uuid.UUID
	MetricType string
	StartDate  *time.Time
	EndDate    *time.Time
	Limit      int
	Order      string
}

type MetricRepository interface {
	Create(ctx context.Context, entry *models.MetricEntry) error
	List(ctx context.Context, filter MetricFilter) ([]models.MetricEntry, error)
	Latest(ctx context.Context, userID uuid.UUID, metricType string) (*models.MetricEntry, error)
	Aggregate(ctx context.Context, userID uuid.UUID, metricType string, start, end time.Time) (float64, float64, float64, error)
}

type metricRepository struct {
	db *gorm.DB
}

func NewMetricRepository(db *gorm.DB) MetricRepository {
	return &metricRepository{db: db}
}

func (m *metricRepository) Create(ctx context.Context, entry *models.MetricEntry) error {
	return m.db.WithContext(ctx).Create(entry).Error
}

func (m *metricRepository) List(ctx context.Context, filter MetricFilter) ([]models.MetricEntry, error) {
	query := m.db.WithContext(ctx).Where("user_id = ?", filter.UserID)
	if filter.MetricType != "" {
		query = query.Where("metric_type = ?", filter.MetricType)
	}
	if filter.StartDate != nil {
		query = query.Where("recorded_at >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("recorded_at <= ?", *filter.EndDate)
	}

	if filter.Order == "" {
		filter.Order = "recorded_at ASC"
	}
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}

	var entries []models.MetricEntry
	if err := query.Order(filter.Order).Find(&entries).Error; err != nil {
		return nil, err
	}
	return entries, nil
}

func (m *metricRepository) Latest(ctx context.Context, userID uuid.UUID, metricType string) (*models.MetricEntry, error) {
	var entry models.MetricEntry
	err := m.db.WithContext(ctx).
		Where("user_id = ? AND metric_type = ?", userID, metricType).
		Order("recorded_at DESC").
		First(&entry).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (m *metricRepository) Aggregate(ctx context.Context, userID uuid.UUID, metricType string, start, end time.Time) (float64, float64, float64, error) {
	type result struct {
		Min float64
		Max float64
		Avg float64
	}
	var res result
	err := m.db.WithContext(ctx).
		Model(&models.MetricEntry{}).
		Select("MIN(primary_value) AS min, MAX(primary_value) AS max, AVG(primary_value) AS avg").
		Where("user_id = ? AND metric_type = ? AND recorded_at BETWEEN ? AND ?", userID, metricType, start, end).
		Scan(&res).Error
	if err != nil {
		return 0, 0, 0, err
	}
	return res.Min, res.Max, res.Avg, nil
}
