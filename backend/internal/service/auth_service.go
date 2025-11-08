package service

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrPinNotEnabled = errors.New("pin login not enabled for this account")

type AuthService interface {
	Authenticate(ctx context.Context, email, password string) (*AuthToken, error)
	VerifyPin(ctx context.Context, email, pin string) (*AuthToken, error)
}

type authService struct {
	cfg      *config.Config
	userRepo repository.UserRepository
}

type AuthToken struct {
	AccessToken  string        `json:"accessToken"`
	ExpiresIn    time.Duration `json:"expiresIn"`
	RefreshToken string        `json:"refreshToken,omitempty"`
	User         AuthUser      `json:"user"`
}

type AuthUser struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	PinEnabled  bool      `json:"pinEnabled"`
}

func NewAuthService(cfg *config.Config, userRepo repository.UserRepository) AuthService {
	return &authService{
		cfg:      cfg,
		userRepo: userRepo,
	}
}

func (a *authService) Authenticate(ctx context.Context, email, password string) (*AuthToken, error) {
	user, err := a.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user == nil || !compareHash(password, user.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	return a.issueToken(ctx, user)
}

func (a *authService) VerifyPin(ctx context.Context, email, pin string) (*AuthToken, error) {
	user, err := a.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user == nil || !user.PinEnabled {
		return nil, ErrPinNotEnabled
	}
	if !compareHash(pin, user.Pin) {
		return nil, ErrInvalidCredentials
	}

	return a.issueToken(ctx, user)
}

func (a *authService) issueToken(ctx context.Context, user *models.User) (*AuthToken, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   user.ID.String(),
		Issuer:    a.cfg.AppName,
		ExpiresAt: jwt.NewNumericDate(now.Add(a.cfg.Auth.TokenTTL)),
		IssuedAt:  jwt.NewNumericDate(now),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(a.cfg.Auth.JWTSecret))
	if err != nil {
		return nil, err
	}

	authToken := &AuthToken{
		AccessToken: signed,
		ExpiresIn:   a.cfg.Auth.TokenTTL,
		User: AuthUser{
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			PinEnabled:  user.PinEnabled,
		},
	}

	user.LastLoginAt = &now
	if err := a.userRepo.Update(ctx, user); err != nil {
		log.Printf("failed to update last login timestamp: %v", err)
	}

	// TODO: refresh token storage when we implement persistent sessions
	return authToken, nil
}

func compareHash(value string, hash string) bool {
	if hash == "" || value == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(value)) == nil
}
