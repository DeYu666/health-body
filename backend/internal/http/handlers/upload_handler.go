package handlers

import (
	"io"
	"log"
	"net/http"

	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	uploadService service.UploadService
}

func NewUploadHandler(uploadService service.UploadService) *UploadHandler {
	return &UploadHandler{
		uploadService: uploadService,
	}
}

func (h *UploadHandler) UploadFile(c *gin.Context) {
	log.Printf("[Upload] 收到上传请求，Content-Type: %s", c.GetHeader("Content-Type"))

	if h.uploadService == nil {
		log.Println("[Upload] 错误：文件上传服务未配置")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "文件上传服务未配置"})
		return
	}

	userID, ok := requireUser(c)
	if !ok {
		log.Println("[Upload] 错误：用户认证失败")
		return
	}
	log.Printf("[Upload] 用户 ID: %s", userID.String())

	// 获取上传的文件
	file, err := c.FormFile("file")
	if err != nil {
		log.Printf("[Upload] 错误：无法获取文件 - %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要上传的文件", "details": err.Error()})
		return
	}
	log.Printf("[Upload] 文件信息 - 文件名: %s, 大小: %d bytes", file.Filename, file.Size)

	// 打开文件
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法打开文件"})
		return
	}
	defer src.Close()

	// 读取文件内容
	data, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取文件内容"})
		return
	}

	// 获取文件类型
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// 上传文件
	log.Printf("[Upload] 开始上传文件，文件大小: %d bytes", len(data))
	result, err := h.uploadService.UploadFile(c.Request.Context(), data, file.Filename, contentType)
	if err != nil {
		log.Printf("[Upload] 文件上传失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[Upload] 上传成功 - Key: %s, URL: %s", result.Key, result.URL)

	// 返回上传结果（包含用户 ID 用于调试，生产环境可移除）
	c.JSON(http.StatusOK, gin.H{
		"key":      result.Key,
		"url":      result.URL,
		"fileType": result.FileType,
		"fileSize": result.FileSize,
		"userId":   userID.String(), // 调试用
	})
}
