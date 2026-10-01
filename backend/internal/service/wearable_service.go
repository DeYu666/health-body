package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"

	"github.com/example/phr-backend/internal/healthimport"
	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WearableImportResult struct {
	Supported   int      `json:"supported"`
	Unsupported int      `json:"unsupported"`
	Invalid     int      `json:"invalid"`
	Duplicates  int      `json:"duplicates"`
	Imported    int64    `json:"imported"`
	StartDate   string   `json:"startDate"`
	EndDate     string   `json:"endDate"`
	Metrics     []string `json:"metrics"`
	Sources     []string `json:"sources"`
	Committed   bool     `json:"committed"`
}

var ErrInvalidHealthExport = errors.New("健康导出文件无法读取")

type WearableService struct {
	repo    repository.WearableRepository
	members repository.FamilyMemberRepository
}

func NewWearableService(repo repository.WearableRepository, members repository.FamilyMemberRepository) *WearableService {
	return &WearableService{repo: repo, members: members}
}

func (s *WearableService) checkMember(ctx context.Context, userID, memberID uuid.UUID) error {
	member, err := s.members.FindByID(ctx, userID, memberID)
	if err != nil {
		return err
	}
	if member == nil {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *WearableService) Receive(ctx context.Context, userID, memberID uuid.UUID, file io.ReaderAt, size int64, commit bool) (*WearableImportResult, error) {
	if err := s.checkMember(ctx, userID, memberID); err != nil {
		return nil, err
	}
	parsed, err := healthimport.Read(ctx, file, size)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidHealthExport, err)
	}
	result := &WearableImportResult{Supported: len(parsed.Samples), Unsupported: parsed.Unsupported,
		Invalid: parsed.Invalid, Duplicates: parsed.Duplicates, Metrics: []string{}, Sources: []string{}}
	metrics, sources := map[string]bool{}, map[string]bool{}
	for _, sample := range parsed.Samples {
		metrics[sample.MetricType] = true
		sources[sample.Source] = true
		if result.StartDate == "" || sample.Date < result.StartDate {
			result.StartDate = sample.Date
		}
		if sample.Date > result.EndDate {
			result.EndDate = sample.Date
		}
	}
	for metric := range metrics {
		result.Metrics = append(result.Metrics, metric)
	}
	for source := range sources {
		result.Sources = append(result.Sources, source)
	}
	sort.Strings(result.Metrics)
	sort.Strings(result.Sources)
	if !commit {
		return result, nil
	}
	entries := make([]models.WearableSample, 0, len(parsed.Samples))
	for _, sample := range parsed.Samples {
		id := uuid.NewSHA1(uuid.NameSpaceOID, []byte(userID.String()+"\x00"+memberID.String()+"\x00"+sample.Key()))
		entries = append(entries, models.WearableSample{ID: id, UserID: userID, MemberID: memberID,
			MetricType: sample.MetricType, Source: sample.Source, Device: sample.Device, Unit: sample.Unit,
			OriginalValue: sample.OriginalValue, OriginalUnit: sample.OriginalUnit,
			StartOffsetMinutes: sample.StartOffsetMinutes, EndOffsetMinutes: sample.EndOffsetMinutes,
			Value: sample.Value, StartAt: sample.Start, EndAt: sample.End, RecordDate: sample.Date})
	}
	inserted, err := s.repo.Insert(ctx, entries)
	if err != nil {
		return nil, err
	}
	result.Imported = inserted
	result.Duplicates += len(entries) - int(inserted)
	result.Committed = true
	return result, nil
}

func (s *WearableService) Days(ctx context.Context, userID, memberID uuid.UUID, start, end string) ([]repository.WearableDay, error) {
	if err := s.checkMember(ctx, userID, memberID); err != nil {
		return nil, err
	}
	return s.repo.Days(ctx, userID, memberID, start, end)
}
