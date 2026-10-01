package repository

import (
	"context"
	"github.com/example/phr-backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WearableDay struct {
	MetricType string  `json:"metricType"`
	Source     string  `json:"source"`
	Device     string  `json:"device"`
	Unit       string  `json:"unit"`
	Date       string  `json:"date"`
	Value      float64 `json:"value"`
	Min        float64 `json:"min"`
	Max        float64 `json:"max"`
	Count      int64   `json:"count"`
}

type WearableRepository interface {
	Insert(context.Context, []models.WearableSample) (int64, error)
	Days(context.Context, uuid.UUID, uuid.UUID, string, string) ([]WearableDay, error)
}

type wearableRepository struct{ db *gorm.DB }

func NewWearableRepository(db *gorm.DB) WearableRepository { return &wearableRepository{db: db} }

func (r *wearableRepository) Insert(ctx context.Context, samples []models.WearableSample) (int64, error) {
	var inserted int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for start := 0; start < len(samples); start += 500 {
			end := min(start+500, len(samples))
			batch := samples[start:end]
			result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoNothing: true}).Create(&batch)
			if result.Error != nil {
				return result.Error
			}
			inserted += result.RowsAffected
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return inserted, nil
}

func (r *wearableRepository) Days(ctx context.Context, userID, memberID uuid.UUID, start, end string) ([]WearableDay, error) {
	rows := []WearableDay{}
	err := r.db.WithContext(ctx).Model(&models.WearableSample{}).
		Select(`metric_type, source, device, unit, to_char(record_date, 'YYYY-MM-DD') AS date,
		CASE WHEN metric_type IN ('steps', 'active-energy') THEN SUM(value) ELSE AVG(value) END AS value,
		MIN(value) AS min, MAX(value) AS max, COUNT(*) AS count`).
		Where("user_id = ? AND member_id = ? AND record_date BETWEEN ? AND ?", userID, memberID, start, end).
		Group("metric_type, source, device, unit, record_date").Order("record_date ASC, metric_type ASC, source ASC, device ASC").Scan(&rows).Error
	return rows, err
}
