package http

import (
	"net/http"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/http/handlers"
	"github.com/example/phr-backend/internal/http/middleware"
	"github.com/gin-gonic/gin"
)

type Router struct {
	engine *gin.Engine
}

type HandlerRegistry struct {
	Auth    *handlers.AuthHandler
	Reports *handlers.ReportHandler
	Metrics *handlers.MetricHandler
	Health  *handlers.HealthHandler
}

func NewRouter(cfg *config.Config, registry HandlerRegistry) *Router {
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg))

	engine.GET("/healthz", registry.Health.Liveness)

	api := engine.Group("/api/v1")

	auth := api.Group("/auth")
	{
		auth.POST("/login", registry.Auth.Login)
		auth.POST("/pin", registry.Auth.PinLogin)
	}

	reports := api.Group("/reports")
	{
		reports.GET("", registry.Reports.ListReports)
		reports.POST("", registry.Reports.CreateReport)
		reports.GET("/:id", registry.Reports.GetReport)
		reports.DELETE("/:id", registry.Reports.DeleteReport)
	}

	metrics := api.Group("/metrics")
	{
		metrics.GET("", registry.Metrics.ListMetrics)
		metrics.POST("", registry.Metrics.CreateMetric)
		metrics.GET("/trend", registry.Metrics.TrendSummary)
	}

	engine.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error":  "未找到请求路径",
			"path":   c.Request.URL.Path,
			"method": c.Request.Method,
		})
	})

	return &Router{engine: engine}
}

func (r *Router) Engine() *gin.Engine {
	return r.engine
}
