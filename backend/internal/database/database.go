package database

import (
	"context"
	"fmt"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewPostgres(cfg *config.Config) (*gorm.DB, error) {
	gormConfig := &gorm.Config{
		SkipDefaultTransaction: true,
		PrepareStmt:            true,
		Logger:                 logger.Default.LogMode(logger.Warn),
	}

	db, err := gorm.Open(postgres.Open(cfg.DB.URL), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("retrieve sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(cfg.DB.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.DB.MaxIdleConns)
	sqlDB.SetConnMaxIdleTime(cfg.DB.ConnMaxIdle)
	sqlDB.SetConnMaxLifetime(cfg.DB.ConnMaxLife)

	// simple connectivity check
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.FamilyMember{},
		&models.Report{},
		&models.ReportFile{},
		&models.ReportShare{},
		&models.MetricEntry{},
		&models.WearableSample{},
		&models.HealthDocument{},
		&models.DocumentFile{},
		&models.OCRResult{},
		&models.ExtractedObservation{},
		&models.DocumentMedication{},
		&models.AIAnalysis{},
		&models.ReviewTask{},
	); err != nil {
		return err
	}
	return db.Exec(`
		UPDATE health_documents
		SET categories = jsonb_build_array(category)
		WHERE jsonb_array_length(categories) = 0
		  AND category IS NOT NULL
		  AND category <> ''
	`).Error
}
