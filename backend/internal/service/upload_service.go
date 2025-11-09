package service

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/google/uuid"
	"github.com/qiniu/go-sdk/v7/auth"
	"github.com/qiniu/go-sdk/v7/storage"
)

type UploadService interface {
	UploadFile(ctx context.Context, data []byte, filename string, contentType string) (*UploadResult, error)
}

type uploadService struct {
	cfg    *config.Config
	mac    *auth.Credentials
	bucket string
	domain string
}

type UploadResult struct {
	Key      string `json:"key"`
	URL      string `json:"url"`
	FileType string `json:"fileType"`
	FileSize int64  `json:"fileSize"`
}

func NewUploadService(cfg *config.Config) (UploadService, error) {
	if cfg.Qiniu.AccessKey == "" || cfg.Qiniu.SecretKey == "" {
		return nil, fmt.Errorf("七牛云配置不完整：需要 ACCESS_KEY 和 SECRET_KEY")
	}

	mac := auth.New(cfg.Qiniu.AccessKey, cfg.Qiniu.SecretKey)
	bucket := cfg.Qiniu.Bucket
	domain := cfg.Qiniu.Domain

	// 如果 domain 为空，使用默认域名格式
	if domain == "" {
		domain = fmt.Sprintf("https://%s.qiniucdn.com", bucket)
	}

	return &uploadService{
		cfg:    cfg,
		mac:    mac,
		bucket: bucket,
		domain: domain,
	}, nil
}

func (s *uploadService) UploadFile(ctx context.Context, data []byte, filename string, contentType string) (*UploadResult, error) {
	// 生成唯一文件名
	ext := filepath.Ext(filename)
	key := fmt.Sprintf("reports/%s/%s%s", time.Now().Format("2006/01/02"), uuid.New().String(), ext)

	// 创建上传策略
	putPolicy := storage.PutPolicy{
		Scope: s.bucket,
	}
	putPolicy.Expires = 3600 // 1小时过期
	upToken := putPolicy.UploadToken(s.mac)

	// 自动检测 bucket 所在的区域
	zone, err := storage.GetZone(s.mac.AccessKey, s.bucket)
	if err != nil {
		// 如果自动检测失败，默认使用华南区域（up-z2）
		// 可以根据实际 bucket 所在区域修改
		zone = &storage.ZoneHuanan
	}

	// 配置上传参数
	cfg := storage.Config{
		Zone:          zone,
		UseHTTPS:      true,
		UseCdnDomains: true,
	}

	// 创建表单上传对象
	formUploader := storage.NewFormUploader(&cfg)

	// 上传文件
	ret := storage.PutRet{}
	putExtra := storage.PutExtra{
		Params: map[string]string{},
	}

	dataReader := bytes.NewReader(data)
	err = formUploader.Put(ctx, &ret, upToken, key, dataReader, int64(len(data)), &putExtra)
	if err != nil {
		return nil, fmt.Errorf("上传文件到七牛云失败: %w", err)
	}

	// 构建文件 URL
	fileURL := fmt.Sprintf("http://%s/%s", s.domain, ret.Key)

	// 确定文件类型
	fileType := "other"
	if ext == ".pdf" {
		fileType = "pdf"
	} else if contentType != "" {
		if contentType == "image/jpeg" || contentType == "image/png" || contentType == "image/gif" || contentType == "image/webp" {
			fileType = "image"
		}
	}

	return &UploadResult{
		Key:      ret.Key,
		URL:      fileURL,
		FileType: fileType,
		FileSize: int64(len(data)),
	}, nil
}
