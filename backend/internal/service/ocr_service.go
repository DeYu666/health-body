package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/config"
	"gorm.io/datatypes"
)

var ErrOCRUnavailable = errors.New("ocr processor unavailable")

type OCRProcessor interface {
	ExtractFiles(ctx context.Context, files []ImportDocumentFileInput) OCRExtraction
	ProviderName() string
}

type OCRExtraction struct {
	RawText       string
	PagesJSON     datatypes.JSON
	TablesJSON    datatypes.JSON
	KeyValuesJSON datatypes.JSON
	Confidence    *float64
	ErrorNotes    []string
}

type noopOCRProcessor struct {
	provider string
}

type httpOCRProcessor struct {
	endpoint            string
	provider            string
	timeout             time.Duration
	maxFileBytes        int64
	cloudreveUploadsDir string
	client              *http.Client
}

type ocrWorkerResponse struct {
	Text       string         `json:"text"`
	Pages      []any          `json:"pages"`
	Tables     []any          `json:"tables"`
	KeyValues  map[string]any `json:"keyValues"`
	Confidence float64        `json:"confidence"`
	Error      string         `json:"error"`
}

func NewOCRProcessor(cfg *config.Config) OCRProcessor {
	provider := strings.ToLower(strings.TrimSpace(cfg.OCR.Provider))
	if provider == "" || provider == "none" {
		return &noopOCRProcessor{provider: "none"}
	}
	if strings.TrimSpace(cfg.OCR.Endpoint) == "" {
		return &noopOCRProcessor{provider: "none"}
	}
	timeout := cfg.OCR.Timeout
	if timeout <= 0 {
		timeout = 180 * time.Second
	}
	maxFileBytes := cfg.OCR.MaxFileBytes
	if maxFileBytes <= 0 {
		maxFileBytes = 25 * 1024 * 1024
	}
	return &httpOCRProcessor{
		endpoint:            strings.TrimSpace(cfg.OCR.Endpoint),
		provider:            provider,
		timeout:             timeout,
		maxFileBytes:        maxFileBytes,
		cloudreveUploadsDir: strings.TrimSpace(cfg.OCR.CloudreveUploadsDir),
		client:              &http.Client{Timeout: timeout},
	}
}

func (p *noopOCRProcessor) ProviderName() string {
	if p.provider == "" {
		return "none"
	}
	return p.provider
}

func (p *noopOCRProcessor) ExtractFiles(_ context.Context, files []ImportDocumentFileInput) OCRExtraction {
	extraction := newEmptyOCRExtraction()
	if len(files) > 0 {
		extraction.ErrorNotes = append(extraction.ErrorNotes, "ocr_disabled")
	}
	return extraction
}

func (p *httpOCRProcessor) ProviderName() string {
	if p.provider == "" {
		return "http"
	}
	return p.provider
}

func (p *httpOCRProcessor) ExtractFiles(ctx context.Context, files []ImportDocumentFileInput) OCRExtraction {
	extraction := newEmptyOCRExtraction()
	if len(files) == 0 {
		return extraction
	}

	pageArtifacts := make([]map[string]any, 0, len(files))
	tableArtifacts := make([]map[string]any, 0)
	keyValueArtifacts := make(map[string]any)
	texts := make([]string, 0, len(files))
	confidences := make([]float64, 0, len(files))

	for index, file := range files {
		result, err := p.extractFile(ctx, file)
		fileArtifact := map[string]any{
			"fileUrl":      file.FileURL,
			"mimeType":     normalizeMimeType(file.MimeType, file.FileType, file.FileURL),
			"displayOrder": index,
		}
		if err != nil {
			note := normalizeOCRError(err)
			extraction.ErrorNotes = append(extraction.ErrorNotes, note)
			fileArtifact["error"] = note
			pageArtifacts = append(pageArtifacts, fileArtifact)
			continue
		}

		text := strings.TrimSpace(result.Text)
		if text != "" {
			texts = append(texts, text)
		}
		if result.Confidence > 0 {
			confidences = append(confidences, result.Confidence)
		}
		fileArtifact["pages"] = result.Pages
		pageArtifacts = append(pageArtifacts, fileArtifact)
		if len(result.Tables) > 0 {
			tableArtifacts = append(tableArtifacts, map[string]any{
				"fileUrl": file.FileURL,
				"tables":  result.Tables,
			})
		}
		if len(result.KeyValues) > 0 {
			keyValueArtifacts[file.FileURL] = result.KeyValues
		}
	}

	extraction.RawText = strings.Join(texts, "\n\n")
	extraction.PagesJSON = mustJSON(pageArtifacts, "[]")
	extraction.TablesJSON = mustJSON(tableArtifacts, "[]")
	extraction.KeyValuesJSON = mustJSON(keyValueArtifacts, "{}")
	if len(confidences) > 0 {
		avg := averageFloat64(confidences)
		extraction.Confidence = &avg
	}
	return extraction
}

func (p *httpOCRProcessor) extractFile(ctx context.Context, file ImportDocumentFileInput) (*ocrWorkerResponse, error) {
	data, contentType, err := p.downloadFile(ctx, file)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileName := fileNameFromURL(file.FileURL)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(data); err != nil {
		return nil, err
	}
	_ = writer.WriteField("fileName", fileName)
	_ = writer.WriteField("mimeType", firstNonEmpty(file.MimeType, contentType, normalizeMimeType("", file.FileType, file.FileURL)))
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("ocr worker failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var result ocrWorkerResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if result.Error != "" {
		return nil, errors.New(result.Error)
	}
	return &result, nil
}

func (p *httpOCRProcessor) downloadFile(ctx context.Context, file ImportDocumentFileInput) ([]byte, string, error) {
	fileURL := strings.TrimSpace(file.FileURL)
	parsed, err := url.Parse(fileURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, "", fmt.Errorf("unsupported file url")
	}

	ctx, cancel := context.WithTimeout(ctx, minDuration(p.timeout, 60*time.Second))
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		if data, contentType, localErr := p.readCloudreveLocalFile(fileURL); localErr == nil {
			return data, contentType, nil
		}
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if data, contentType, localErr := p.readCloudreveLocalFile(fileURL); localErr == nil {
			return data, contentType, nil
		}
		return nil, "", fmt.Errorf("download failed: %s", resp.Status)
	}
	if resp.ContentLength > p.maxFileBytes {
		return nil, "", fmt.Errorf("file exceeds ocr max size")
	}

	reader := io.LimitReader(resp.Body, p.maxFileBytes+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > p.maxFileBytes {
		return nil, "", fmt.Errorf("file exceeds ocr max size")
	}
	if len(data) == 0 {
		return nil, "", fmt.Errorf("empty file")
	}

	return data, resp.Header.Get("Content-Type"), nil
}

func (p *httpOCRProcessor) readCloudreveLocalFile(fileURL string) ([]byte, string, error) {
	if p.cloudreveUploadsDir == "" {
		return nil, "", fmt.Errorf("cloudreve local root is not configured")
	}
	targetName := fileNameFromURL(fileURL)
	if targetName == "" || targetName == "document" {
		return nil, "", fmt.Errorf("cloudreve local filename is unavailable")
	}

	var matchedPath string
	err := filepath.WalkDir(p.cloudreveUploadsDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		name := entry.Name()
		if name == targetName || strings.HasSuffix(name, "_"+targetName) {
			matchedPath = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return nil, "", err
	}
	if matchedPath == "" {
		return nil, "", fmt.Errorf("cloudreve local file not found")
	}

	info, err := os.Stat(matchedPath)
	if err != nil {
		return nil, "", err
	}
	if info.Size() > p.maxFileBytes {
		return nil, "", fmt.Errorf("file exceeds ocr max size")
	}
	data, err := os.ReadFile(matchedPath)
	if err != nil {
		return nil, "", err
	}
	return data, normalizeMimeType("", "", matchedPath), nil
}

func newEmptyOCRExtraction() OCRExtraction {
	return OCRExtraction{
		PagesJSON:     datatypes.JSON([]byte("[]")),
		TablesJSON:    datatypes.JSON([]byte("[]")),
		KeyValuesJSON: datatypes.JSON([]byte("{}")),
	}
}

func fileNameFromURL(fileURL string) string {
	parsed, err := url.Parse(fileURL)
	if err == nil {
		base := filepath.Base(parsed.Path)
		if base != "." && base != "/" && base != "" {
			return base
		}
	}
	return "document"
}

func mustJSON(value any, fallback string) datatypes.JSON {
	data, err := json.Marshal(value)
	if err != nil {
		return datatypes.JSON([]byte(fallback))
	}
	return datatypes.JSON(data)
}

func averageFloat64(values []float64) float64 {
	var total float64
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

func normalizeOCRError(err error) string {
	if err == nil {
		return ""
	}
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "unsupported"):
		return "unsupported_file_url"
	case strings.Contains(message, "exceeds"):
		return "file_too_large"
	case strings.Contains(message, "download"):
		return "download_failed"
	case strings.Contains(message, "timeout"), strings.Contains(message, "deadline"):
		return "ocr_timeout"
	default:
		return "ocr_failed"
	}
}
