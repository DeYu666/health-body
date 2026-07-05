package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/config"
)

var ErrAIUnavailable = errors.New("ai analyzer unavailable")

type AIAnalyzer interface {
	AnalyzeDocument(ctx context.Context, input AIAnalyzeDocumentInput) (*AIAnalyzeDocumentOutput, error)
	ModelName() string
}

type AIAnalyzeDocumentInput struct {
	Title     string
	Category  string
	Note      string
	OCRText   string
	FileCount int
}

type AIAnalyzeDocumentOutput struct {
	Summary    string
	Conclusion string
	Category   string
	Confidence float64
}

type sensenovaAIAnalyzer struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

func NewAIAnalyzer(cfg *config.Config) AIAnalyzer {
	return &sensenovaAIAnalyzer{
		apiKey:  strings.TrimSpace(cfg.AI.SenseNovaAPIKey),
		baseURL: strings.TrimRight(strings.TrimSpace(cfg.AI.SenseNovaBaseURL), "/"),
		model:   strings.TrimSpace(cfg.AI.SenseNovaSmartModel),
		client:  &http.Client{Timeout: 45 * time.Second},
	}
}

func (a *sensenovaAIAnalyzer) ModelName() string {
	if a.model == "" {
		return "sensenova"
	}
	return a.model
}

func (a *sensenovaAIAnalyzer) AnalyzeDocument(ctx context.Context, input AIAnalyzeDocumentInput) (*AIAnalyzeDocumentOutput, error) {
	if a.apiKey == "" || a.baseURL == "" || a.model == "" {
		return nil, ErrAIUnavailable
	}

	content := strings.TrimSpace(input.OCRText)
	note := strings.TrimSpace(input.Note)
	if note != "" && note != content {
		content = strings.TrimSpace(content + "\n\n用户补充：" + note)
	}
	if content == "" {
		return nil, ErrAIUnavailable
	}
	content = truncateText(content, 12000)

	requestBody := map[string]any{
		"model": a.model,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "你是家庭健康档案助手。只基于用户提供的资料做整理，不给诊断结论。请输出 JSON，字段为 summary、conclusion、category、confidence。category 只能是体检、检验、影像、病历、用药、其他之一。",
			},
			{
				"role":    "user",
				"content": fmt.Sprintf("标题：%s\n分类提示：%s\n文件数：%d\n资料内容：\n%s", input.Title, input.Category, input.FileCount, content),
			},
		},
		"temperature": 0.2,
	}

	payload, err := json.Marshal(requestBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("ai analyzer request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var apiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}
	if len(apiResp.Choices) == 0 || strings.TrimSpace(apiResp.Choices[0].Message.Content) == "" {
		return nil, ErrAIUnavailable
	}

	return parseAIAnalysisContent(apiResp.Choices[0].Message.Content, input.Category), nil
}

func parseAIAnalysisContent(content string, fallbackCategory string) *AIAnalyzeDocumentOutput {
	text := strings.TrimSpace(content)
	jsonText := text
	if start := strings.Index(text, "{"); start >= 0 {
		if end := strings.LastIndex(text, "}"); end > start {
			jsonText = text[start : end+1]
		}
	}

	var parsed struct {
		Summary    string  `json:"summary"`
		Conclusion string  `json:"conclusion"`
		Category   string  `json:"category"`
		Confidence float64 `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(jsonText), &parsed); err == nil {
		return &AIAnalyzeDocumentOutput{
			Summary:    strings.TrimSpace(parsed.Summary),
			Conclusion: strings.TrimSpace(parsed.Conclusion),
			Category:   normalizeDocumentCategory(parsed.Category, fallbackCategory),
			Confidence: clampConfidence(parsed.Confidence),
		}
	}

	return &AIAnalyzeDocumentOutput{
		Summary:    truncateText(text, 1600),
		Conclusion: truncateText(text, 1600),
		Category:   normalizeDocumentCategory("", fallbackCategory),
		Confidence: 0.45,
	}
}

func clampConfidence(value float64) float64 {
	if value <= 0 {
		return 0.45
	}
	if value > 1 {
		return 1
	}
	return value
}
