package middleware

import (
	"strings"

	"github.com/example/phr-backend/internal/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS(cfg *config.Config) gin.HandlerFunc {
	corsConfig := cors.Config{
		AllowOrigins:     cfg.HTTP.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Requested-With"},
		AllowCredentials: true,
		MaxAge:           12 * 60 * 60,
	}

	// allow wildcard origins for localhost development
	for _, origin := range cfg.HTTP.AllowedOrigins {
		if strings.Contains(origin, "*") {
			corsConfig.AllowOriginFunc = func(origin string) bool {
				for _, allow := range cfg.HTTP.AllowedOrigins {
					if allow == "*" {
						return true
					}
					if strings.Contains(allow, "*") {
						prefix := strings.TrimSuffix(allow, "*")
						if strings.HasPrefix(origin, prefix) {
							return true
						}
					}
				}
				return false
			}
			break
		}
	}

	return cors.New(corsConfig)
}
