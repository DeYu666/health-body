package service

import (
	"context"
	"strings"
	"testing"

	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
)

type ownedMemberRepo struct {
	repository.FamilyMemberRepository
	owner  uuid.UUID
	member uuid.UUID
}

func (r *ownedMemberRepo) FindByID(_ context.Context, userID, memberID uuid.UUID) (*models.FamilyMember, error) {
	if userID != r.owner || memberID != r.member {
		return nil, nil
	}
	return &models.FamilyMember{BaseModel: models.BaseModel{ID: memberID}, UserID: userID, Name: "本人"}, nil
}

type sampleStore struct {
	repository.WearableRepository
	samples map[uuid.UUID]models.WearableSample
	writes  int
}

func (r *sampleStore) Insert(_ context.Context, samples []models.WearableSample) (int64, error) {
	r.writes++
	var count int64
	for _, sample := range samples {
		if _, exists := r.samples[sample.ID]; !exists {
			r.samples[sample.ID] = sample
			count++
		}
	}
	return count, nil
}

func TestWearablePreviewImportRetryAndMemberIsolation(t *testing.T) {
	owner, member := uuid.New(), uuid.New()
	store := &sampleStore{samples: map[uuid.UUID]models.WearableSample{}}
	svc := NewWearableService(store, &ownedMemberRepo{owner: owner, member: member})
	xml := `<HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" value="80" startDate="2026-09-06 09:00:00 +0800" endDate="2026-09-06 09:00:00 +0800"/></HealthData>`
	preview, err := svc.Receive(context.Background(), owner, member, strings.NewReader(xml), int64(len(xml)), false)
	if err != nil || preview.Supported != 1 || store.writes != 0 || preview.Committed {
		t.Fatal("preview wrote data or failed", err)
	}
	for i := 0; i < 2; i++ {
		result, err := svc.Receive(context.Background(), owner, member, strings.NewReader(xml), int64(len(xml)), true)
		if err != nil || result.Imported != int64(1-i) || result.Duplicates != i || !result.Committed {
			t.Fatal("retry not idempotent", result, err)
		}
	}
	if _, err := svc.Receive(context.Background(), uuid.New(), member, strings.NewReader(xml), int64(len(xml)), true); err == nil {
		t.Fatal("cross-user import accepted")
	}
	if _, err := svc.Receive(context.Background(), owner, uuid.New(), strings.NewReader(xml), int64(len(xml)), true); err == nil {
		t.Fatal("foreign member accepted")
	}
	if store.writes != 2 {
		t.Fatal("unauthorized write attempted")
	}
}

func TestExplicitFamilyMemberWinsOverRecognition(t *testing.T) {
	owner, member := uuid.New(), uuid.New()
	svc := NewFamilyMemberService(&ownedMemberRepo{owner: owner, member: member})
	resolved, err := svc.ResolveRecognizedName(context.Background(), owner, "另一个姓名", &member)
	if err != nil || *resolved != member {
		t.Fatal("recognized name overrode chosen member")
	}
	if _, err := svc.ResolveRecognizedName(context.Background(), uuid.New(), "另一个姓名", &member); err == nil {
		t.Fatal("foreign member accepted")
	}
}
