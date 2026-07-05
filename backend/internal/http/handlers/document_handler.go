package handlers

import (
	"errors"
	"net/http"

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
