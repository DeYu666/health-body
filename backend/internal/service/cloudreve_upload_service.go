package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/config"
	"github.com/google/uuid"
)

type cloudreveUploadService struct {
	cfg          *config.Config
	httpClient   *http.Client
	baseURL      string
	email        string
	password     string
	policyID     string
	accessToken  string
	refreshToken string
}

// Cloudreve API 响应结构
type cloudreveTokenResponse struct {
	Code int `json:"code"`
	Data struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
		Token struct {
			AccessToken    string `json:"access_token"`
			RefreshToken   string `json:"refresh_token"`
			AccessExpires  string `json:"access_expires"`
			RefreshExpires string `json:"refresh_expires"`
		} `json:"token"`
	} `json:"data"`
	Msg string `json:"msg"`
}

type cloudreveUploadSessionRequest struct {
	URI          string            `json:"uri"`
	Size         int64             `json:"size"`
	LastModified *int64            `json:"last_modified,omitempty"`
	MimeType     *string           `json:"mime_type,omitempty"`
	PolicyID     string            `json:"policy_id"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	EntityType   *string           `json:"entity_type,omitempty"`
}

type cloudreveUploadSessionResponse struct {
	Code int `json:"code"`
	Data struct {
		SessionID     string   `json:"session_id"`
		UploadID      string   `json:"upload_id,omitempty"`
		ChunkSize     int      `json:"chunk_size"`
		Expires       int64    `json:"expires"`
		UploadURLs    []string `json:"upload_urls,omitempty"`
		Credential    string   `json:"credential,omitempty"`
		CompleteURL   string   `json:"completeURL,omitempty"`
		StoragePolicy struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"storage_policy"`
		MimeType     string `json:"mime_type,omitempty"`
		UploadPolicy string `json:"upload_policy,omitempty"`
	} `json:"data"`
	Msg string `json:"msg"`
}

type cloudreveChunkUploadResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

type cloudreveDirectLinkRequest struct {
	URIs []string `json:"uris"`
}

type cloudreveDirectLinkItem struct {
	Link    string `json:"link"`
	FileURL string `json:"file_url"`
}

type cloudreveDirectLinkResponse struct {
	Code int                       `json:"code"`
	Data []cloudreveDirectLinkItem `json:"data"`
	Msg  string                    `json:"msg"`
}

type cloudreveStoragePolicy struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	MaxSize int64  `json:"max_size"`
	Relay   *bool  `json:"relay,omitempty"`
}

type cloudrevePoliciesResponse struct {
	Code int                      `json:"code"`
	Data []cloudreveStoragePolicy `json:"data"`
	Msg  string                   `json:"msg"`
}

func NewCloudreveUploadService(cfg *config.Config) (UploadService, error) {
	if cfg.Cloudreve.BaseURL == "" {
		return nil, fmt.Errorf("Cloudreve 配置不完整：需要 BASE_URL")
	}
	if cfg.Cloudreve.AccessToken == "" && (cfg.Cloudreve.Email == "" || cfg.Cloudreve.Password == "") {
		return nil, fmt.Errorf("Cloudreve 配置不完整：需要 ACCESS_TOKEN 或 EMAIL 和 PASSWORD")
	}

	// 确保 baseURL 不以 / 结尾
	baseURL := strings.TrimSuffix(cfg.Cloudreve.BaseURL, "/")

	// 确保 baseURL 包含协议（http:// 或 https://）
	if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		// 如果没有协议，默认使用 http://
		baseURL = "http://" + baseURL
	}

	service := &cloudreveUploadService{
		cfg:          cfg,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		baseURL:      baseURL,
		email:        cfg.Cloudreve.Email,
		password:     cfg.Cloudreve.Password,
		policyID:     cfg.Cloudreve.PolicyID, // 如果配置了，优先使用；否则从 API 获取
		accessToken:  cfg.Cloudreve.AccessToken,
		refreshToken: cfg.Cloudreve.RefreshToken,
	}

	// 如果没有配置 PolicyID，需要在首次使用时从 API 获取
	// 这里延迟初始化，在首次调用时获取

	return service, nil
}

// login 登录 Cloudreve 获取 token
func (s *cloudreveUploadService) login(ctx context.Context) error {
	// 如果配置了 email 和 password，使用它们登录
	if s.email != "" && s.password != "" {
		return s.performLogin(ctx)
	}

	// 如果只配置了 accessToken，直接使用（但可能已过期）
	if s.accessToken != "" {
		return nil
	}

	return fmt.Errorf("无法登录：缺少 email/password 或 accessToken")
}

// performLogin 执行实际的登录操作
func (s *cloudreveUploadService) performLogin(ctx context.Context) error {
	loginURL := fmt.Sprintf("%s/api/v4/session/token", s.baseURL)

	reqBody := map[string]string{
		"email":    s.email,
		"password": s.password,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("序列化登录请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", loginURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("创建登录请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("登录请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("登录失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var tokenResp cloudreveTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("解析登录响应失败: %w", err)
	}

	if tokenResp.Code != 0 {
		return fmt.Errorf("登录失败: %s", tokenResp.Msg)
	}

	s.accessToken = tokenResp.Data.Token.AccessToken
	s.refreshToken = tokenResp.Data.Token.RefreshToken
	log.Printf("[Cloudreve] 登录成功，获取到新的 access token")

	return nil
}

// getStoragePolicies 获取可用的存储策略列表
func (s *cloudreveUploadService) getStoragePolicies(ctx context.Context) ([]cloudreveStoragePolicy, error) {
	// 确保已登录
	if err := s.login(ctx); err != nil {
		return nil, err
	}

	policiesURL := fmt.Sprintf("%s/api/v4/user/setting/policies", s.baseURL)
	log.Printf("[Cloudreve] 获取存储策略 URL: %s", policiesURL)

	req, err := http.NewRequestWithContext(ctx, "GET", policiesURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建获取策略请求失败: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("获取策略请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 如果 token 过期，尝试刷新或重新登录
	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("[Cloudreve] 存储策略 token 过期，尝试刷新或重新登录")
		// 先尝试刷新 token
		if s.refreshToken != "" {
			if err := s.refreshAccessToken(ctx); err == nil {
				// 刷新成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "GET", policiesURL, nil)
				if err != nil {
					return nil, fmt.Errorf("重新创建获取策略请求失败: %w", err)
				}
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return nil, fmt.Errorf("重试获取策略请求失败: %w", err)
				}
				defer resp.Body.Close()
			} else {
				log.Printf("[Cloudreve] 刷新 token 失败: %v，尝试重新登录", err)
			}
		}

		// 如果刷新失败或没有 refreshToken，尝试重新登录
		if resp.StatusCode == http.StatusUnauthorized && s.email != "" && s.password != "" {
			if err := s.performLogin(ctx); err == nil {
				// 重新登录成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "GET", policiesURL, nil)
				if err != nil {
					return nil, fmt.Errorf("重新创建获取策略请求失败: %w", err)
				}
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return nil, fmt.Errorf("重试获取策略请求失败: %w", err)
				}
				defer resp.Body.Close()
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("获取策略失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var policiesResp cloudrevePoliciesResponse
	if err := json.NewDecoder(resp.Body).Decode(&policiesResp); err != nil {
		return nil, fmt.Errorf("解析策略响应失败: %w", err)
	}

	if policiesResp.Code != 0 {
		return nil, fmt.Errorf("获取策略失败: %s", policiesResp.Msg)
	}

	if len(policiesResp.Data) == 0 {
		return nil, fmt.Errorf("没有可用的存储策略")
	}

	return policiesResp.Data, nil
}

// ensurePolicyID 确保 policyID 已设置，如果未设置则从 API 获取
func (s *cloudreveUploadService) ensurePolicyID(ctx context.Context) error {
	if s.policyID != "" {
		return nil
	}

	// 从 API 获取策略列表
	policies, err := s.getStoragePolicies(ctx)
	if err != nil {
		log.Printf("[Cloudreve] 获取存储策略失败: %v", err)
		return fmt.Errorf("获取存储策略失败: %w", err)
	}

	// 使用第一个策略
	s.policyID = policies[0].ID
	log.Printf("[Cloudreve] 使用存储策略: %s (ID: %s)", policies[0].Name, policies[0].ID)

	return nil
}

// refreshAccessToken 刷新 access token
func (s *cloudreveUploadService) refreshAccessToken(ctx context.Context) error {
	if s.refreshToken == "" {
		return fmt.Errorf("没有 refresh token，需要重新登录")
	}

	refreshURL := fmt.Sprintf("%s/api/v4/session/token/refresh", s.baseURL)

	reqBody := map[string]string{
		"refresh_token": s.refreshToken,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("序列化刷新请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", refreshURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("创建刷新请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("刷新请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("刷新失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var tokenResp cloudreveTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("解析刷新响应失败: %w", err)
	}

	if tokenResp.Code != 0 {
		return fmt.Errorf("刷新失败: %s", tokenResp.Msg)
	}

	s.accessToken = tokenResp.Data.Token.AccessToken
	if tokenResp.Data.Token.RefreshToken != "" {
		s.refreshToken = tokenResp.Data.Token.RefreshToken
	}

	return nil
}

// createUploadSession 创建上传会话
func (s *cloudreveUploadService) createUploadSession(ctx context.Context, uri string, size int64, mimeType string) (*cloudreveUploadSessionResponse, error) {
	// 确保已登录
	if err := s.login(ctx); err != nil {
		return nil, err
	}

	// 确保 policyID 已设置
	if err := s.ensurePolicyID(ctx); err != nil {
		return nil, err
	}

	uploadURL := fmt.Sprintf("%s/api/v4/file/upload", s.baseURL)

	reqBody := cloudreveUploadSessionRequest{
		URI:      uri,
		Size:     size,
		PolicyID: s.policyID,
	}

	if mimeType != "" {
		reqBody.MimeType = &mimeType
	}

	// 设置最后修改时间为当前时间（毫秒）
	now := time.Now().UnixMilli()
	reqBody.LastModified = &now

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("序列化上传会话请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("创建上传会话请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("创建上传会话请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 如果 token 过期，尝试刷新或重新登录
	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("[Cloudreve] Token 已过期，尝试刷新或重新登录")
		// 先尝试刷新 token
		if s.refreshToken != "" {
			if err := s.refreshAccessToken(ctx); err == nil {
				// 刷新成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewBuffer(jsonData))
				if err != nil {
					return nil, fmt.Errorf("重新创建上传会话请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return nil, fmt.Errorf("重试上传会话请求失败: %w", err)
				}
				defer resp.Body.Close()
			} else {
				log.Printf("[Cloudreve] 刷新 token 失败: %v，尝试重新登录", err)
			}
		}

		// 如果刷新失败或没有 refreshToken，尝试重新登录
		if resp.StatusCode == http.StatusUnauthorized && s.email != "" && s.password != "" {
			if err := s.performLogin(ctx); err == nil {
				// 重新登录成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewBuffer(jsonData))
				if err != nil {
					return nil, fmt.Errorf("重新创建上传会话请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return nil, fmt.Errorf("重试上传会话请求失败: %w", err)
				}
				defer resp.Body.Close()
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("创建上传会话失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var sessionResp cloudreveUploadSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&sessionResp); err != nil {
		return nil, fmt.Errorf("解析上传会话响应失败: %w", err)
	}

	if sessionResp.Code != 0 {
		return nil, fmt.Errorf("创建上传会话失败: %s", sessionResp.Msg)
	}

	return &sessionResp, nil
}

// uploadChunk 上传文件块
func (s *cloudreveUploadService) uploadChunk(ctx context.Context, sessionID string, chunkIndex int, chunkData []byte, credential string) error {
	uploadURL := fmt.Sprintf("%s/api/v4/file/upload/%s/%d", s.baseURL, sessionID, chunkIndex)

	req, err := http.NewRequestWithContext(ctx, "POST", uploadURL, bytes.NewReader(chunkData))
	if err != nil {
		return fmt.Errorf("创建上传块请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Length", strconv.Itoa(len(chunkData)))

	// 如果提供了 credential，使用它作为 Authorization
	if credential != "" {
		req.Header.Set("Authorization", credential)
	} else {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("上传块请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 如果 token 过期，尝试刷新或重新登录
	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("[Cloudreve] 上传块 token 过期，尝试刷新或重新登录")
		// 先尝试刷新 token
		if s.refreshToken != "" {
			if err := s.refreshAccessToken(ctx); err == nil {
				// 刷新成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "POST", uploadURL, bytes.NewReader(chunkData))
				if err != nil {
					return fmt.Errorf("重新创建上传块请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/octet-stream")
				req.Header.Set("Content-Length", strconv.Itoa(len(chunkData)))
				if credential != "" {
					req.Header.Set("Authorization", credential)
				} else {
					req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				}
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return fmt.Errorf("重试上传块请求失败: %w", err)
				}
				defer resp.Body.Close()
			} else {
				log.Printf("[Cloudreve] 刷新 token 失败: %v，尝试重新登录", err)
			}
		}

		// 如果刷新失败或没有 refreshToken，尝试重新登录
		if resp.StatusCode == http.StatusUnauthorized && s.email != "" && s.password != "" {
			if err := s.performLogin(ctx); err == nil {
				// 重新登录成功，重新创建请求并重试
				req, err = http.NewRequestWithContext(ctx, "POST", uploadURL, bytes.NewReader(chunkData))
				if err != nil {
					return fmt.Errorf("重新创建上传块请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/octet-stream")
				req.Header.Set("Content-Length", strconv.Itoa(len(chunkData)))
				if credential != "" {
					req.Header.Set("Authorization", credential)
				} else {
					req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))
				}
				resp, err = s.httpClient.Do(req)
				if err != nil {
					return fmt.Errorf("重试上传块请求失败: %w", err)
				}
				defer resp.Body.Close()
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("上传块失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var chunkResp cloudreveChunkUploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&chunkResp); err != nil {
		return fmt.Errorf("解析上传块响应失败: %w", err)
	}

	if chunkResp.Code != 0 {
		return fmt.Errorf("上传块失败: %s", chunkResp.Msg)
	}

	return nil
}

// createDirectLink 创建文件直链
func (s *cloudreveUploadService) createDirectLink(ctx context.Context, uri string) (string, error) {
	// 确保已登录
	if err := s.login(ctx); err != nil {
		return "", err
	}

	// 确保 policyID 已设置（虽然创建直链不需要 policyID，但为了保持一致性）
	if err := s.ensurePolicyID(ctx); err != nil {
		return "", err
	}

	directLinkURL := fmt.Sprintf("%s/api/v4/file/source", s.baseURL)

	reqBody := cloudreveDirectLinkRequest{
		URIs: []string{uri},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("序列化直链请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PUT", directLinkURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("创建直链请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("创建直链请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 如果 token 过期，尝试刷新或重新登录
	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("[Cloudreve] 创建直链 token 过期，尝试刷新或重新登录")
		// 先尝试刷新 token
		if s.refreshToken != "" {
			if err := s.refreshAccessToken(ctx); err == nil {
				// 刷新成功，重新创建请求
				req, err = http.NewRequestWithContext(ctx, "PUT", directLinkURL, bytes.NewBuffer(jsonData))
				if err != nil {
					return "", fmt.Errorf("重新创建直链请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))

				resp, err = s.httpClient.Do(req)
				if err != nil {
					return "", fmt.Errorf("重试直链请求失败: %w", err)
				}
				defer resp.Body.Close()
			} else {
				log.Printf("[Cloudreve] 刷新 token 失败: %v，尝试重新登录", err)
			}
		}

		// 如果刷新失败或没有 refreshToken，尝试重新登录
		if resp.StatusCode == http.StatusUnauthorized && s.email != "" && s.password != "" {
			if err := s.performLogin(ctx); err == nil {
				// 重新登录成功，重新创建请求
				req, err = http.NewRequestWithContext(ctx, "PUT", directLinkURL, bytes.NewBuffer(jsonData))
				if err != nil {
					return "", fmt.Errorf("重新创建直链请求失败: %w", err)
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.accessToken))

				resp, err = s.httpClient.Do(req)
				if err != nil {
					return "", fmt.Errorf("重试直链请求失败: %w", err)
				}
				defer resp.Body.Close()
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("创建直链失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var directLinkResp cloudreveDirectLinkResponse
	if err := json.NewDecoder(resp.Body).Decode(&directLinkResp); err != nil {
		return "", fmt.Errorf("解析直链响应失败: %w", err)
	}

	if directLinkResp.Code != 0 {
		return "", fmt.Errorf("创建直链失败: %s", directLinkResp.Msg)
	}

	if len(directLinkResp.Data) == 0 {
		return "", fmt.Errorf("创建直链失败: 响应中没有直链数据")
	}

	return directLinkResp.Data[0].Link, nil
}

// UploadFile 上传文件到 Cloudreve
func (s *cloudreveUploadService) UploadFile(ctx context.Context, data []byte, filename string, contentType string) (*UploadResult, error) {
	// 生成文件 URI（使用 cloudreve:// 协议）
	ext := filepath.Ext(filename)
	fileNameWithoutExt := strings.TrimSuffix(filename, ext)
	// 使用时间戳和 UUID 生成唯一文件名
	uniqueFilename := fmt.Sprintf("%s_%s%s", fileNameWithoutExt, uuid.New().String()[:8], ext)

	// 构建路径部分
	path := fmt.Sprintf("my/phr-data/%s/%s", time.Now().Format("2006/01/02"), uniqueFilename)
	// 对路径部分进行 URL 编码（但保留 / 分隔符）
	pathParts := strings.Split(path, "/")
	encodedParts := make([]string, len(pathParts))
	for i, part := range pathParts {
		encodedParts[i] = url.PathEscape(part)
	}
	encodedPath := strings.Join(encodedParts, "/")

	// 构建完整的 URI
	uri := fmt.Sprintf("cloudreve://%s", encodedPath)

	// 创建上传会话
	sessionResp, err := s.createUploadSession(ctx, uri, int64(len(data)), contentType)
	if err != nil {
		return nil, fmt.Errorf("创建上传会话失败: %w", err)
	}

	chunkSize := sessionResp.Data.ChunkSize
	sessionID := sessionResp.Data.SessionID
	credential := sessionResp.Data.Credential

	// 如果 chunk_size 为 0，表示不支持分块上传，一次性上传所有数据
	if chunkSize == 0 {
		chunkSize = len(data)
	}

	// 上传文件块
	if len(data) <= chunkSize {
		// 小文件，一次性上传
		if err := s.uploadChunk(ctx, sessionID, 0, data, credential); err != nil {
			return nil, fmt.Errorf("上传文件块失败: %w", err)
		}
	} else {
		// 大文件，分块上传
		for i := 0; i < len(data); i += chunkSize {
			end := i + chunkSize
			if end > len(data) {
				end = len(data)
			}
			chunk := data[i:end]
			chunkIndex := i / chunkSize

			if err := s.uploadChunk(ctx, sessionID, chunkIndex, chunk, credential); err != nil {
				return nil, fmt.Errorf("上传文件块 %d 失败: %w", chunkIndex, err)
			}
		}
	}

	// 上传完成后，获取直链
	directLink, err := s.createDirectLink(ctx, uri)
	if err != nil {
		// 如果获取直链失败，记录错误但不影响上传成功
		// 返回一个基于 baseURL 的 URL 作为后备
		directLink = fmt.Sprintf("%s/file/%s", s.baseURL, strings.TrimPrefix(uri, "cloudreve://"))
		log.Printf("[Cloudreve] 警告：获取直链失败，使用后备 URL: %v", err)
	}

	// 确定文件类型
	fileType := "other"
	if ext == ".pdf" {
		fileType = "pdf"
	} else if contentType != "" {
		if strings.HasPrefix(contentType, "image/") {
			fileType = "image"
		}
	}

	return &UploadResult{
		Key:      uri,
		URL:      directLink, // 返回直链 URL，可以直接预览
		FileType: fileType,
		FileSize: int64(len(data)),
	}, nil
}
