package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrCannotDeleteSelf = errors.New("cannot delete self member")
var ErrMemberHasRecords = errors.New("member has health records")

type FamilyMemberService interface {
	List(ctx context.Context, userID uuid.UUID) ([]FamilyMemberDTO, error)
	Create(ctx context.Context, userID uuid.UUID, input FamilyMemberInput) (*FamilyMemberDTO, error)
	Update(ctx context.Context, userID, memberID uuid.UUID, input FamilyMemberInput) (*FamilyMemberDTO, error)
	Delete(ctx context.Context, userID, memberID uuid.UUID) error
	ResolveRecognizedName(ctx context.Context, userID uuid.UUID, recognizedName string, preferredID *uuid.UUID) (*uuid.UUID, error)
	NameForID(ctx context.Context, userID, memberID uuid.UUID) (string, error)
}

func (s *familyMemberService) NameForID(ctx context.Context, userID, memberID uuid.UUID) (string, error) {
	member, err := s.repo.FindByID(ctx, userID, memberID)
	if err != nil || member == nil {
		return "", err
	}
	return member.Name, nil
}

func (s *familyMemberService) ResolveRecognizedName(ctx context.Context, userID uuid.UUID, recognizedName string, preferredID *uuid.UUID) (*uuid.UUID, error) {
	// An explicit selection belongs to the user; OCR is only a name suggestion.
	if preferredID != nil {
		member, err := s.repo.FindByID(ctx, userID, *preferredID)
		if err != nil {
			return nil, err
		}
		if member == nil {
			return nil, gorm.ErrRecordNotFound
		}
		return &member.ID, nil
	}
	name := strings.TrimSpace(recognizedName)
	if name == "" {
		return preferredID, nil
	}
	members, err := s.repo.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range members {
		if normalizeMemberName(members[i].Name) == normalizeMemberName(name) {
			return &members[i].ID, nil
		}
	}
	member := &models.FamilyMember{UserID: userID, Name: name, Relationship: "家人"}
	if err := s.repo.Create(ctx, member); err != nil {
		return nil, err
	}
	return &member.ID, nil
}

func normalizeMemberName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), ""))
}

type familyMemberService struct {
	repo repository.FamilyMemberRepository
}

func NewFamilyMemberService(repo repository.FamilyMemberRepository) FamilyMemberService {
	return &familyMemberService{repo: repo}
}

type FamilyMemberInput struct {
	Name         string     `json:"name" binding:"required"`
	Relationship string     `json:"relationship"`
	Gender       string     `json:"gender"`
	BirthDate    *time.Time `json:"birthDate"`
}

type FamilyMemberDTO struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	Relationship string     `json:"relationship"`
	Gender       string     `json:"gender"`
	BirthDate    *time.Time `json:"birthDate,omitempty"`
	IsSelf       bool       `json:"isSelf"`
}

func mapFamilyMember(member *models.FamilyMember) FamilyMemberDTO {
	return FamilyMemberDTO{ID: member.ID, Name: member.Name, Relationship: member.Relationship, Gender: member.Gender, BirthDate: member.BirthDate, IsSelf: member.IsSelf}
}

func (s *familyMemberService) List(ctx context.Context, userID uuid.UUID) ([]FamilyMemberDTO, error) {
	members, err := s.repo.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(members) == 0 {
		self := &models.FamilyMember{UserID: userID, Name: "本人", Relationship: "本人", IsSelf: true}
		if err := s.repo.Create(ctx, self); err != nil {
			return nil, err
		}
		if err := s.repo.AssignUnassigned(ctx, userID, self.ID); err != nil {
			return nil, err
		}
		members = []models.FamilyMember{*self}
	}
	result := make([]FamilyMemberDTO, 0, len(members))
	for i := range members {
		result = append(result, mapFamilyMember(&members[i]))
	}
	return result, nil
}

func (s *familyMemberService) Create(ctx context.Context, userID uuid.UUID, input FamilyMemberInput) (*FamilyMemberDTO, error) {
	member := &models.FamilyMember{UserID: userID, Name: strings.TrimSpace(input.Name), Relationship: strings.TrimSpace(input.Relationship), Gender: strings.TrimSpace(input.Gender), BirthDate: input.BirthDate}
	if member.Relationship == "" {
		member.Relationship = "家人"
	}
	if err := s.repo.Create(ctx, member); err != nil {
		return nil, err
	}
	result := mapFamilyMember(member)
	return &result, nil
}

func (s *familyMemberService) Update(ctx context.Context, userID, memberID uuid.UUID, input FamilyMemberInput) (*FamilyMemberDTO, error) {
	member, err := s.repo.FindByID(ctx, userID, memberID)
	if err != nil {
		return nil, err
	}
	if member == nil {
		return nil, gorm.ErrRecordNotFound
	}
	member.Name = strings.TrimSpace(input.Name)
	member.Relationship = strings.TrimSpace(input.Relationship)
	member.Gender = strings.TrimSpace(input.Gender)
	member.BirthDate = input.BirthDate
	if member.IsSelf {
		member.Relationship = "本人"
	}
	if err := s.repo.Update(ctx, member); err != nil {
		return nil, err
	}
	result := mapFamilyMember(member)
	return &result, nil
}

func (s *familyMemberService) Delete(ctx context.Context, userID, memberID uuid.UUID) error {
	member, err := s.repo.FindByID(ctx, userID, memberID)
	if err != nil {
		return err
	}
	if member == nil {
		return gorm.ErrRecordNotFound
	}
	if member.IsSelf {
		return ErrCannotDeleteSelf
	}
	hasRecords, err := s.repo.HasRecords(ctx, userID, memberID)
	if err != nil {
		return err
	}
	if hasRecords {
		return ErrMemberHasRecords
	}
	return s.repo.Delete(ctx, userID, memberID)
}
