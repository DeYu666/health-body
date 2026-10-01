package repository

import (
	"context"
	"errors"

	"github.com/example/phr-backend/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FamilyMemberRepository interface {
	List(ctx context.Context, userID uuid.UUID) ([]models.FamilyMember, error)
	FindByID(ctx context.Context, userID, memberID uuid.UUID) (*models.FamilyMember, error)
	Create(ctx context.Context, member *models.FamilyMember) error
	Update(ctx context.Context, member *models.FamilyMember) error
	Delete(ctx context.Context, userID, memberID uuid.UUID) error
	AssignUnassigned(ctx context.Context, userID, memberID uuid.UUID) error
	HasRecords(ctx context.Context, userID, memberID uuid.UUID) (bool, error)
}

type familyMemberRepository struct{ db *gorm.DB }

func NewFamilyMemberRepository(db *gorm.DB) FamilyMemberRepository {
	return &familyMemberRepository{db: db}
}

func (r *familyMemberRepository) List(ctx context.Context, userID uuid.UUID) ([]models.FamilyMember, error) {
	var members []models.FamilyMember
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("is_self DESC, created_at ASC").Find(&members).Error
	return members, err
}

func (r *familyMemberRepository) FindByID(ctx context.Context, userID, memberID uuid.UUID) (*models.FamilyMember, error) {
	var member models.FamilyMember
	err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", memberID, userID).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &member, err
}

func (r *familyMemberRepository) Create(ctx context.Context, member *models.FamilyMember) error {
	return r.db.WithContext(ctx).Create(member).Error
}

func (r *familyMemberRepository) Update(ctx context.Context, member *models.FamilyMember) error {
	return r.db.WithContext(ctx).Save(member).Error
}

func (r *familyMemberRepository) Delete(ctx context.Context, userID, memberID uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ? AND user_id = ?", memberID, userID).Delete(&models.FamilyMember{}).Error
}

func (r *familyMemberRepository) AssignUnassigned(ctx context.Context, userID, memberID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, model := range []any{&models.Report{}, &models.HealthDocument{}, &models.MetricEntry{}} {
			if err := tx.Model(model).Where("user_id = ? AND member_id IS NULL", userID).Update("member_id", memberID).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *familyMemberRepository) HasRecords(ctx context.Context, userID, memberID uuid.UUID) (bool, error) {
	for _, model := range []any{&models.Report{}, &models.HealthDocument{}, &models.MetricEntry{}, &models.WearableSample{}} {
		var count int64
		if err := r.db.WithContext(ctx).Model(model).Where("user_id = ? AND member_id = ?", userID, memberID).Count(&count).Error; err != nil {
			return false, err
		}
		if count > 0 {
			return true, nil
		}
	}
	return false, nil
}
