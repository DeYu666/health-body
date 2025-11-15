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
	Upload  *handlers.UploadHandler
}

func NewRouter(cfg *config.Config, registry HandlerRegistry) *Router {
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg))

	// 设置文件上传大小限制（默认 32MB，这里设置为 100MB）
	engine.MaxMultipartMemory = 100 << 20 // 100 MB

	engine.GET("/healthz", registry.Health.Liveness)

	api := engine.Group("/api/v1")
	// 添加 JWT 认证中间件（可选，不强制要求）
	api.Use(middleware.JWTAuth(cfg))

	auth := api.Group("/auth")
	{
		auth.POST("/register", registry.Auth.Register)
		auth.POST("/login", registry.Auth.Login)
		auth.POST("/pin", registry.Auth.PinLogin)
	}

	// 需要认证的路由组
	reports := api.Group("/reports")
	reports.Use(middleware.RequireAuth())
	{
		reports.GET("", registry.Reports.ListReports)
		reports.GET("/hospitals", registry.Reports.ListHospitals)
		reports.POST("", registry.Reports.CreateReport)
		reports.GET("/:id", registry.Reports.GetReport)
		reports.PUT("/:id", registry.Reports.UpdateReport)
		reports.DELETE("/:id", registry.Reports.DeleteReport)
	}

	metrics := api.Group("/metrics")
	metrics.Use(middleware.RequireAuth())
	{
		metrics.GET("", registry.Metrics.ListMetrics)
		metrics.POST("", registry.Metrics.CreateMetric)
		metrics.GET("/trend", registry.Metrics.TrendSummary)
	}

	// 文件上传路由
	if registry.Upload != nil {
		upload := api.Group("/upload")
		upload.Use(middleware.RequireAuth())
		{
			upload.POST("/file", registry.Upload.UploadFile)
		}
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
