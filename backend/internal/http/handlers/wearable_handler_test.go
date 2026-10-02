package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/http/middleware"
	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type handlerMembers struct {
	repository.FamilyMemberRepository
	owner, member uuid.UUID
}

func (r *handlerMembers) FindByID(_ context.Context, owner, member uuid.UUID) (*models.FamilyMember, error) {
	if owner != r.owner || member != r.member {
		return nil, nil
	}
	return &models.FamilyMember{BaseModel: models.BaseModel{ID: member}, UserID: owner}, nil
}

type handlerSamples struct {
	repository.WearableRepository
	samples map[uuid.UUID]models.WearableSample
}

func (r *handlerSamples) Insert(_ context.Context, entries []models.WearableSample) (int64, error) {
	var inserted int64
	for _, entry := range entries {
		if _, exists := r.samples[entry.ID]; !exists {
			r.samples[entry.ID] = entry
			inserted++
		}
	}
	return inserted, nil
}

func TestWearableMultipartFlowRequiresJWTAndKeepsAuthenticatedOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	owner, member := uuid.New(), uuid.New()
	members := &handlerMembers{owner: owner, member: member}
	store := &handlerSamples{samples: map[uuid.UUID]models.WearableSample{}}
	handler := NewWearableHandler(service.NewWearableService(store, members))
	cfg := &config.Config{}
	cfg.Auth.JWTSecret = "test-only-signing-key"
	router := gin.New()
	router.Use(middleware.JWTAuth(cfg))
	router.POST("/import", middleware.RequireJWT(), handler.Import)
	claims := jwt.RegisteredClaims{Subject: owner.String(), ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.Auth.JWTSecret))
	xml := `<HealthData><Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Synthetic Watch" unit="count/min" value="80" startDate="2026-09-06 09:00:00 +0800" endDate="2026-09-06 09:00:00 +0800"/></HealthData>`
	for _, step := range []struct {
		mode, bearer, body string
		status             int
		imported           int64
	}{
		{"preview", "", xml, http.StatusUnauthorized, 0},
		{"preview", "bad-token", xml, http.StatusUnauthorized, 0},
		{"preview", token, xml, http.StatusOK, 0},
		{"import", token, xml, http.StatusOK, 1},
		{"import", token, xml, http.StatusOK, 0},
		{"import", token, xml + "<broken", http.StatusBadRequest, 0},
	} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		_ = writer.WriteField("memberId", member.String())
		_ = writer.WriteField("mode", step.mode)
		file, _ := writer.CreateFormFile("file", "export.xml")
		_, _ = file.Write([]byte(step.body))
		_ = writer.Close()
		request := httptest.NewRequest(http.MethodPost, "/import", &body)
		request.Header.Set("Content-Type", writer.FormDataContentType())
		request.Header.Set("X-User-ID", uuid.NewString())
		if step.bearer != "" {
			request.Header.Set("Authorization", "Bearer "+step.bearer)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != step.status {
			t.Fatalf("%s: got %d: %s", step.mode, response.Code, response.Body.String())
		}
		if response.Code == http.StatusOK {
			var receipt service.WearableImportResult
			if err := json.Unmarshal(response.Body.Bytes(), &receipt); err != nil {
				t.Fatal(err)
			}
			if receipt.Imported != step.imported {
				t.Fatalf("unexpected receipt: %+v", receipt)
			}
		}
	}
	if len(store.samples) != 1 {
		t.Fatal("duplicates or failed data persisted")
	}
	for _, sample := range store.samples {
		if sample.UserID != owner {
			t.Fatal("header overrode authenticated owner")
		}
	}
}
