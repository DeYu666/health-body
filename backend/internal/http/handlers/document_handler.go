package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/example/phr-backend/internal/repository"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type DocumentHandler struct {
	service service.DocumentService
}

func NewDocumentHandler(service service.DocumentService) *DocumentHandler {
	return &DocumentHandler{service: service}
}

func (h *DocumentHandler) ImportDocument(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	var input service.ImportDocumentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(input.Files) > 1 && input.FileMode == "separate" {
		jobID := uuid.New()
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			defer cancel()
			failed := 0
			for index, file := range input.Files {
				singleInput := input
				singleInput.Files = []service.ImportDocumentFileInput{file}
				singleInput.Title = fmt.Sprintf("待识别健康资料 · 图片%d", index+1)
				if _, err := h.service.Import(ctx, userID, singleInput); err != nil {
					failed++
					log.Printf("[DocumentImport] background job %s file %d failed: %v", jobID, index+1, err)
				}
			}
			log.Printf("[DocumentImport] background job %s completed: total=%d failed=%d", jobID, len(input.Files), failed)
		}()
		c.JSON(http.StatusAccepted, gin.H{"status": "processing", "jobId": jobID, "documents": len(input.Files)})
		return
	}

	result, err := h.service.Import(c.Request.Context(), userID, input)
	if err != nil {
		if errors.Is(err, service.ErrEmptyDocument) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先上传文件或输入健康记录"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, result)
}

func (h *DocumentHandler) BackfillReports(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	var input service.BackfillReportsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.service.BackfillReports(c.Request.Context(), userID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *DocumentHandler) ListDocuments(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	filter := repository.DocumentFilter{
		UserID:   userID,
		Search:   c.Query("search"),
		Category: c.Query("category"),
		Status:   c.Query("status"),
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

	result, err := h.service.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *DocumentHandler) GetDocument(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资料 ID"})
		return
	}

	document, err := h.service.Get(c.Request.Context(), userID, documentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资料不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *DocumentHandler) GetDocumentByLegacyReport(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	reportID, err := uuid.Parse(c.Param("reportId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的报告 ID"})
		return
	}

	document, err := h.service.GetByLegacyReport(c.Request.Context(), userID, reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资料不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *DocumentHandler) UpdateDocumentReview(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资料 ID"})
		return
	}

	var input service.UpdateDocumentReviewInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	document, err := h.service.UpdateReview(c.Request.Context(), userID, documentID, input)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资料不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, document)
}

func (h *DocumentHandler) AnalyzeStructured(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资料 ID"})
		return
	}
	var input struct {
		Kind string `json:"kind" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.AnalyzeStructured(c.Request.Context(), userID, documentID, input.Kind)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资料不存在"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DocumentHandler) GetDocumentStatus(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资料 ID"})
		return
	}

	document, err := h.service.Get(c.Request.Context(), userID, documentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资料不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":              document.ID,
		"status":          document.Status,
		"category":        document.Category,
		"summary":         document.Summary,
		"reviewTaskCount": document.ReviewTaskCount,
	})
}
