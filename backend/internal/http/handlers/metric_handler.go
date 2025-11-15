package handlers

import (
	"net/http"
	"time"

	"github.com/example/phr-backend/internal/repository"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
)

type MetricHandler struct {
	service service.MetricService
}

func NewMetricHandler(service service.MetricService) *MetricHandler {
	return &MetricHandler{service: service}
}

func (h *MetricHandler) CreateMetric(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	var input service.CreateMetricInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entry, err := h.service.Create(c.Request.Context(), userID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

func (h *MetricHandler) ListMetrics(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	filter := repository.MetricFilter{
		UserID:     userID,
		MetricType: c.Query("metricType"),
		Order:      "recorded_at DESC",
	}
	if limit := c.Query("limit"); limit != "" {
		filter.Limit = parseIntOrDefault(limit, 100)
	}
	if start := parseDate(c.Query("startDate")); start != nil {
		filter.StartDate = start
	}
	if end := parseDate(c.Query("endDate")); end != nil {
		filter.EndDate = end
	}

	entries, err := h.service.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": entries,
		"count": len(entries),
	})
}

func (h *MetricHandler) TrendSummary(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	metricType := c.Query("metricType")
	if metricType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 metricType 参数"})
		return
	}

	start := parseDate(c.Query("startDate"))
	end := parseDate(c.Query("endDate"))
	now := time.Now()
	if start == nil {
		defaultStart := now.AddDate(0, -1, 0)
		start = &defaultStart
	}
	if end == nil {
		end = &now
	}

	summary, err := h.service.TrendSummary(c.Request.Context(), userID, metricType, *start, *end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, summary)
}
