package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/example/phr-backend/internal/repository"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ReportHandler struct {
	service service.ReportService
}

func NewReportHandler(service service.ReportService) *ReportHandler {
	return &ReportHandler{service: service}
}

func (h *ReportHandler) ListReports(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	filter := repository.ReportFilter{
		UserID:   userID,
		Search:   c.Query("search"),
		Tag:      c.Query("tag"),
		Hospital: c.Query("hospital"),
		Limit:    parseIntOrDefault(c.Query("limit"), 20),
		Offset:   parseIntOrDefault(c.Query("offset"), 0),
	}

	if start := parseDate(c.Query("startDate")); start != nil {
		filter.StartDate = start
	}
	if end := parseDate(c.Query("endDate")); end != nil {
		filter.EndDate = end
	}

	result, err := h.service.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *ReportHandler) GetReport(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}

	report, err := h.service.Get(c.Request.Context(), userID, reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "报告不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

func (h *ReportHandler) CreateReport(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	var input service.CreateReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := h.service.Create(c.Request.Context(), userID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, report)
}

func (h *ReportHandler) UpdateReport(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}

	var input service.UpdateReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report, err := h.service.Update(c.Request.Context(), userID, reportID, input)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "报告不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

func (h *ReportHandler) DeleteReport(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}

	if err := h.service.Delete(c.Request.Context(), userID, reportID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "报告不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ReportHandler) ListHospitals(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	hospitals, err := h.service.ListHospitals(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hospitals": hospitals})
}

func parseIntOrDefault(value string, defaultVal int) int {
	if value == "" {
		return defaultVal
	}
	intVal, err := strconv.Atoi(value)
	if err != nil {
		return defaultVal
	}
	return intVal
}

func parseDate(value string) *time.Time {
	if value == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil
	}
	return &t
}
