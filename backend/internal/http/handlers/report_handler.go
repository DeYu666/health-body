package handlers

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/example/phr-backend/internal/repository"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ReportHandler struct {
	service             service.ReportService
	cloudreveBaseURL    *url.URL
	cloudreveHTTPClient *http.Client
}

func NewReportHandler(service service.ReportService, cfg *config.Config) *ReportHandler {
	baseURL, _ := url.Parse(cfg.Cloudreve.BaseURL)
	client := &http.Client{Timeout: 60 * time.Second}
	if baseURL != nil {
		client.CheckRedirect = func(req *http.Request, _ []*http.Request) error {
			req.URL.Scheme = baseURL.Scheme
			req.URL.Host = baseURL.Host
			return nil
		}
	}
	return &ReportHandler{service: service, cloudreveBaseURL: baseURL, cloudreveHTTPClient: client}
}

func (h *ReportHandler) GetFileContent(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}
	fileID, err := uuid.Parse(c.Param("fileId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件 ID"})
		return
	}
	report, err := h.service.Get(c.Request.Context(), userID, reportID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "报告不存在"})
		return
	}
	fileURL := ""
	for _, file := range report.Files {
		if file.ID == fileID {
			fileURL = file.FileURL
			break
		}
	}
	if fileURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "报告文件不存在"})
		return
	}
	if h.cloudreveBaseURL == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "文件预览服务未配置"})
		return
	}
	target, err := url.Parse(fileURL)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "文件地址无效"})
		return
	}
	target.Scheme = h.cloudreveBaseURL.Scheme
	target.Host = h.cloudreveBaseURL.Host
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "创建文件请求失败"})
		return
	}
	resp, err := h.cloudreveHTTPClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取文件失败"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "文件存储返回异常"})
		return
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "private, max-age=300")
	c.Header("Content-Disposition", "inline")
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

func (h *ReportHandler) UpdateFileRotation(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}
	fileID, err := uuid.Parse(c.Param("fileId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件 ID"})
		return
	}
	var input struct {
		Rotation int `json:"rotation"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.UpdateFileRotation(c.Request.Context(), userID, reportID, fileID, input.Rotation); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "报告文件不存在"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
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
	if memberID := c.Query("memberId"); memberID != "" {
		parsed, err := uuid.Parse(memberID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的成员 ID"})
			return
		}
		filter.MemberID = &parsed
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
