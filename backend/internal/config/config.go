package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type HTTPConfig struct {
	Port           string
	AllowedOrigins []string
}

type DatabaseConfig struct {
	URL            string
	MaxOpenConns   int
	MaxIdleConns   int
	ConnMaxIdle    time.Duration
	ConnMaxLife    time.Duration
	MigrationTable string
}

type AuthConfig struct {
	JWTSecret       string
	TokenTTL        time.Duration
	RefreshTokenTTL time.Duration
}

type QiniuConfig struct {
	AccessKey string
	SecretKey string
	Bucket    string
	Domain    string
}

type Config struct {
	AppName string
	Env     string
	HTTP    HTTPConfig
	DB      DatabaseConfig
	Auth    AuthConfig
	Qiniu   QiniuConfig
}

func Load() *Config {
	// load .env if present
	_ = godotenv.Load()

	cfg := &Config{
		AppName: getEnv("APP_NAME", "phr-backend"),
		Env:     getEnv("APP_ENV", "development"),
		HTTP: HTTPConfig{
			Port:           getEnv("PORT", "8080"),
			AllowedOrigins: splitAndClean(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173")),
		},
		DB: DatabaseConfig{
			URL:            getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/phr?sslmode=disable"),
			MaxOpenConns:   getEnvAsInt("DB_MAX_OPEN_CONNS", 15),
			MaxIdleConns:   getEnvAsInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxIdle:    getEnvAsDuration("DB_CONN_MAX_IDLE", 5*time.Minute),
			ConnMaxLife:    getEnvAsDuration("DB_CONN_MAX_LIFE", 60*time.Minute),
			MigrationTable: getEnv("DB_MIGRATION_TABLE", "schema_migrations"),
		},
		Auth: AuthConfig{
			JWTSecret:       getEnv("JWT_SECRET", "change-me-in-production"),
			TokenTTL:        getEnvAsDuration("JWT_TOKEN_TTL", 24*time.Hour),
			RefreshTokenTTL: getEnvAsDuration("JWT_REFRESH_TTL", 14*24*time.Hour),
		},
		Qiniu: QiniuConfig{
			AccessKey: getEnv("QINIU_ACCESS_KEY", ""),
			SecretKey: getEnv("QINIU_SECRET_KEY", ""),
			Bucket:    getEnv("QINIU_BUCKET", "myfreespacep"),
			Domain:    getEnv("QINIU_DOMAIN", ""),
		},
	}

	if cfg.Auth.JWTSecret == "change-me-in-production" && cfg.Env == "production" {
		log.Println("[WARN] using default JWT_SECRET in production, please override via environment variable")
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists && strings.TrimSpace(value) != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	parsed, err := time.ParseDuration(valueStr)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func splitAndClean(input string) []string {
	if input == "" {
		return []string{}
	}
	parts := strings.Split(input, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}
