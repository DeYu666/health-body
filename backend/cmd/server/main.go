package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	apphttp "github.com/example/phr-backend/internal/http"
	"github.com/example/phr-backend/internal/http/handlers"
	"github.com/example/phr-backend/internal/service"
	"github.com/google/uuid"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/database"
	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	cfg := config.Load()

	db, err := database.NewPostgres(cfg)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	userRepo := repository.NewUserRepository(db)
	reportRepo := repository.NewReportRepository(db)
	metricRepo := repository.NewMetricRepository(db)

	authService := service.NewAuthService(cfg, userRepo)
	reportService := service.NewReportService(reportRepo)
	metricService := service.NewMetricService(metricRepo)

	uploadService, err := service.NewUploadService(cfg)
	if err != nil {
		log.Printf("warning: failed to initialize upload service: %v", err)
		log.Println("file upload functionality will be disabled")
		uploadService = nil
	}

	seedDemoAccount(userRepo)

	registry := apphttp.HandlerRegistry{
		Auth:    handlers.NewAuthHandler(authService),
		Reports: handlers.NewReportHandler(reportService),
		Metrics: handlers.NewMetricHandler(metricService),
		Health:  handlers.NewHealthHandler(),
		Upload:  handlers.NewUploadHandler(uploadService),
	}

	router := apphttp.NewRouter(cfg, registry)

	server := &http.Server{
		Addr:    ":" + cfg.HTTP.Port,
		Handler: router.Engine(),
	}

	go func() {
		log.Printf("PHR backend listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	log.Println("server exiting")
}

func seedDemoAccount(userRepo repository.UserRepository) {
	ctx := context.Background()
	email := "demo@example.com"
	existing, err := userRepo.FindByEmail(ctx, email)
	if err != nil {
		log.Printf("failed to check demo user: %v", err)
		return
	}
	if existing != nil {
		return
	}

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("demo1234"), bcrypt.DefaultCost)
	pinHash, _ := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)

	id, _ := uuid.Parse(handlers.DemoUserID)
	user := &models.User{
		BaseModel:    models.BaseModel{ID: id},
		Email:        email,
		DisplayName:  "张先生",
		PasswordHash: string(passwordHash),
		Pin:          string(pinHash),
		PinEnabled:   true,
	}

	if err := userRepo.Create(ctx, user); err != nil {
		log.Printf("failed to seed demo user: %v", err)
		return
	}

	log.Println("seeded demo user demo@example.com / demo1234")
}
