package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/example/phr-backend/internal/healthimport"
	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WearableHandler struct{ service *service.WearableService }

func NewWearableHandler(service *service.WearableService) *WearableHandler {
	return &WearableHandler{service: service}
}

func (h *WearableHandler) Import(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, healthimport.MaxUploadBytes+(1<<20))
	if err := c.Request.ParseMultipartForm(8 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法读取上传文件，请确认文件不超过 256 MB"})
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	memberID, err := uuid.Parse(c.PostForm("memberId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择有效的家庭成员"})
		return
	}
	mode := c.PostForm("mode")
	if mode != "preview" && mode != "import" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先预览，再确认导入"})
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 Apple 健康 XML 或 ZIP 导出文件"})
		return
	}
	defer file.Close()
	result, err := h.service.Receive(c.Request.Context(), userID, memberID, file, header.Size, mode == "import")
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "家庭成员不存在"})
		} else if errors.Is(err, service.ErrInvalidHealthExport) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "导入未完成：" + err.Error()})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存未完成，请稍后重试；相同样本不会重复保存"})
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *WearableHandler) Days(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	memberID, err := uuid.Parse(c.Query("memberId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择有效的家庭成员"})
		return
	}
	start, startErr := time.Parse("2006-01-02", c.Query("startDate"))
	end, endErr := time.Parse("2006-01-02", c.Query("endDate"))
	if startErr != nil || endErr != nil || end.Before(start) || end.Sub(start) > 366*24*time.Hour {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择一年以内的日期范围"})
		return
	}
	items, err := h.service.Days(c.Request.Context(), userID, memberID, start.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "家庭成员不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取健康数据失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
