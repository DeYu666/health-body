package service

import (
	"context"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
)

type MetricService interface {
	Create(ctx context.Context, userID uuid.UUID, input CreateMetricInput) (*MetricDTO, error)
	List(ctx context.Context, filter repository.MetricFilter) ([]MetricDTO, error)
	TrendSummary(ctx context.Context, userID uuid.UUID, metricType string, start, end time.Time) (*MetricTrendSummary, error)
}

type metricService struct {
	repo repository.MetricRepository
}

func NewMetricService(repo repository.MetricRepository) MetricService {
	return &metricService{repo: repo}
}

type CreateMetricInput struct {
	MetricType     string    `json:"metricType" binding:"required"`
	PrimaryValue   float64   `json:"primaryValue" binding:"required"`
	SecondaryValue *float64  `json:"secondaryValue"`
	Unit           string    `json:"unit"`
	RecordedAt     time.Time `json:"recordedAt" binding:"required"`
	Notes          string    `json:"notes"`
}

type MetricDTO struct {
	ID             uuid.UUID `json:"id"`
	MetricType     string    `json:"metricType"`
	PrimaryValue   float64   `json:"primaryValue"`
	SecondaryValue *float64  `json:"secondaryValue,omitempty"`
	Unit           string    `json:"unit"`
	RecordedAt     time.Time `json:"recordedAt"`
	Notes          string    `json:"notes"`
	CreatedAt      time.Time `json:"createdAt"`
}

type MetricTrendSummary struct {
	MetricType string        `json:"metricType"`
	Unit       string        `json:"unit"`
	Min        float64       `json:"min"`
	Max        float64       `json:"max"`
	Average    float64       `json:"average"`
	Data       []MetricPoint `json:"data"`
}

type MetricPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

func (m *metricService) Create(ctx context.Context, userID uuid.UUID, input CreateMetricInput) (*MetricDTO, error) {
	entry := &models.MetricEntry{
		UserID:         userID,
		MetricType:     input.MetricType,
		PrimaryValue:   input.PrimaryValue,
		SecondaryValue: input.SecondaryValue,
		Unit:           input.Unit,
		RecordedAt:     input.RecordedAt,
		Notes:          input.Notes,
	}

	if err := m.repo.Create(ctx, entry); err != nil {
		return nil, err
	}

	return &MetricDTO{
		ID:             entry.ID,
		MetricType:     entry.MetricType,
		PrimaryValue:   entry.PrimaryValue,
		SecondaryValue: entry.SecondaryValue,
		Unit:           entry.Unit,
		RecordedAt:     entry.RecordedAt,
		Notes:          entry.Notes,
		CreatedAt:      entry.CreatedAt,
	}, nil
}

func (m *metricService) List(ctx context.Context, filter repository.MetricFilter) ([]MetricDTO, error) {
	entries, err := m.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}
	result := make([]MetricDTO, 0, len(entries))
	for _, entry := range entries {
		result = append(result, MetricDTO{
			ID:             entry.ID,
			MetricType:     entry.MetricType,
			PrimaryValue:   entry.PrimaryValue,
			SecondaryValue: entry.SecondaryValue,
			Unit:           entry.Unit,
			RecordedAt:     entry.RecordedAt,
			Notes:          entry.Notes,
			CreatedAt:      entry.CreatedAt,
		})
	}
	return result, nil
}

func (m *metricService) TrendSummary(ctx context.Context, userID uuid.UUID, metricType string, start, end time.Time) (*MetricTrendSummary, error) {
	entries, err := m.repo.List(ctx, repository.MetricFilter{
		UserID:     userID,
		MetricType: metricType,
		StartDate:  &start,
		EndDate:    &end,
		Order:      "recorded_at ASC",
	})
	if err != nil {
		return nil, err
	}

	min, max, avg, err := m.repo.Aggregate(ctx, userID, metricType, start, end)
	if err != nil {
		return nil, err
	}

	points := make([]MetricPoint, 0, len(entries))
	for _, entry := range entries {
		points = append(points, MetricPoint{
			Timestamp: entry.RecordedAt,
			Value:     entry.PrimaryValue,
		})
	}

	summary := &MetricTrendSummary{
		MetricType: metricType,
		Unit:       entriesUnit(entries),
		Min:        min,
		Max:        max,
		Average:    avg,
		Data:       points,
	}
	return summary, nil
}

func entriesUnit(entries []models.MetricEntry) string {
	for _, entry := range entries {
		if entry.Unit != "" {
			return entry.Unit
		}
	}
	return ""
}
