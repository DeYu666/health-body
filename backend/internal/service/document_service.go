package service

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/phr-backend/internal/models"
	"github.com/example/phr-backend/internal/repository"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var ErrEmptyDocument = errors.New("document import requires at least one file or note")

type DocumentService interface {
	Import(ctx context.Context, userID uuid.UUID, input ImportDocumentInput) (*ImportedDocumentDTO, error)
	BackfillReports(ctx context.Context, userID uuid.UUID, input BackfillReportsInput) (*BackfillReportsDTO, error)
	List(ctx context.Context, filter repository.DocumentFilter) (*PaginatedDocuments, error)
	Get(ctx context.Context, userID uuid.UUID, documentID uuid.UUID) (*DocumentDTO, error)
}

type documentService struct {
	repo          repository.DocumentRepository
	reportService ReportService
	metricService MetricService
	aiAnalyzer    AIAnalyzer
	ocrProcessor  OCRProcessor
}

func NewDocumentService(repo repository.DocumentRepository, reportService ReportService, metricService MetricService, aiAnalyzer AIAnalyzer, ocrProcessor OCRProcessor) DocumentService {
	if ocrProcessor == nil {
		ocrProcessor = &noopOCRProcessor{provider: "none"}
	}
	return &documentService{
		repo:          repo,
		reportService: reportService,
		metricService: metricService,
		aiAnalyzer:    aiAnalyzer,
		ocrProcessor:  ocrProcessor,
	}
}

type ImportDocumentFileInput struct {
	FileURL      string  `json:"fileUrl" binding:"required"`
	PreviewURL   string  `json:"previewUrl"`
	MimeType     string  `json:"mimeType"`
	FileType     string  `json:"fileType"`
	FileSize     int64   `json:"fileSize"`
	FileSizeMB   float64 `json:"fileSizeMb"`
	DisplayOrder int     `json:"displayOrder"`
}

type ImportDocumentInput struct {
	Title        string                    `json:"title"`
	Category     string                    `json:"category"`
	Subcategory  string                    `json:"subcategory"`
	SourceType   string                    `json:"sourceType"`
	Organization string                    `json:"organization"`
	Department   string                    `json:"department"`
	DocumentDate *time.Time                `json:"documentDate"`
	Note         string                    `json:"note"`
	Files        []ImportDocumentFileInput `json:"files"`
}

type DocumentFileDTO struct {
	ID           uuid.UUID `json:"id"`
	FileURL      string    `json:"fileUrl"`
	PreviewURL   string    `json:"previewUrl,omitempty"`
	MimeType     string    `json:"mimeType"`
	FileSize     int64     `json:"fileSize"`
	DisplayOrder int       `json:"displayOrder"`
}

type DocumentAnalysisDTO struct {
	ID           uuid.UUID `json:"id"`
	Model        string    `json:"model"`
	AnalysisType string    `json:"analysisType"`
	Summary      string    `json:"summary"`
	Confidence   *float64  `json:"confidence,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

type DocumentDTO struct {
	ID              uuid.UUID             `json:"id"`
	Title           string                `json:"title"`
	Category        string                `json:"category"`
	Subcategory     string                `json:"subcategory"`
	SourceType      string                `json:"sourceType"`
	Status          string                `json:"status"`
	Organization    string                `json:"organization"`
	Department      string                `json:"department"`
	DocumentDate    *time.Time            `json:"documentDate,omitempty"`
	Summary         string                `json:"summary"`
	AIConclusion    string                `json:"aiConclusion"`
	Confidence      *float64              `json:"confidence,omitempty"`
	ReviewTaskCount int64                 `json:"reviewTaskCount"`
	Files           []DocumentFileDTO     `json:"files,omitempty"`
	Analyses        []DocumentAnalysisDTO `json:"analyses,omitempty"`
	CreatedAt       time.Time             `json:"createdAt"`
	UpdatedAt       time.Time             `json:"updatedAt"`
}

type ImportedDocumentDTO struct {
	Document     DocumentDTO `json:"document"`
	LegacyReport *ReportDTO  `json:"legacyReport,omitempty"`
}

type PaginatedDocuments struct {
	Items  []DocumentDTO `json:"items"`
	Total  int64         `json:"total"`
	Limit  int           `json:"limit"`
	Offset int           `json:"offset"`
}

type BackfillReportsInput struct {
	Limit int `json:"limit"`
}

type BackfillReportItemDTO struct {
	ReportID   uuid.UUID  `json:"reportId"`
	DocumentID *uuid.UUID `json:"documentId,omitempty"`
	Title      string     `json:"title"`
	Status     string     `json:"status"`
	Error      string     `json:"error,omitempty"`
}

type BackfillReportsDTO struct {
	Processed int                     `json:"processed"`
	Skipped   int                     `json:"skipped"`
	Failed    int                     `json:"failed"`
	Items     []BackfillReportItemDTO `json:"items"`
}

type importOptions struct {
	CreateLegacyReport bool
	Metadata           map[string]any
}

func (s *documentService) Import(ctx context.Context, userID uuid.UUID, input ImportDocumentInput) (*ImportedDocumentDTO, error) {
	return s.importDocument(ctx, userID, input, importOptions{CreateLegacyReport: true})
}

func (s *documentService) importDocument(ctx context.Context, userID uuid.UUID, input ImportDocumentInput, options importOptions) (*ImportedDocumentDTO, error) {
	if len(input.Files) == 0 && strings.TrimSpace(input.Note) == "" {
		return nil, ErrEmptyDocument
	}

	now := time.Now()
	documentDate := input.DocumentDate
	if documentDate == nil {
		documentDate = &now
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = buildDocumentTitle(input, *documentDate)
	}

	sourceType := strings.TrimSpace(input.SourceType)
	if sourceType == "" {
		if len(input.Files) > 0 {
			sourceType = "upload"
		} else {
			sourceType = "text"
		}
	}

	categoryHint := normalizeDocumentCategory(input.Category, "其他")
	ocrExtraction := s.ocrProcessor.ExtractFiles(ctx, input.Files)
	ocrRawText := strings.TrimSpace(ocrExtraction.RawText)
	analysis, analysisErr := s.aiAnalyzer.AnalyzeDocument(ctx, AIAnalyzeDocumentInput{
		Title:     title,
		Category:  input.Category,
		Note:      input.Note,
		OCRText:   ocrRawText,
		FileCount: len(input.Files),
	})

	category := categoryHint
	summary := buildFallbackSummary(input, title, ocrExtraction)
	conclusion := "资料已保存，等待 OCR/AI 完整处理。"
	confidence := 0.35
	status := "needs_review"
	modelName := "fallback"
	if analysisErr == nil && analysis != nil {
		if analysis.Category != "" {
			category = analysis.Category
		}
		if strings.TrimSpace(analysis.Summary) != "" {
			summary = strings.TrimSpace(analysis.Summary)
		}
		if strings.TrimSpace(analysis.Conclusion) != "" {
			conclusion = strings.TrimSpace(analysis.Conclusion)
		}
		confidence = analysis.Confidence
		modelName = s.aiAnalyzer.ModelName()
		if confidence >= 0.6 && (len(input.Files) == 0 || ocrRawText != "") {
			status = "ready"
		}
	}

	metadata := map[string]any{
		"source":       "documents_import",
		"fileCount":    len(input.Files),
		"ocrProvider":  s.ocrProcessor.ProviderName(),
		"ocrTextLen":   len([]rune(ocrRawText)),
		"ocrErrors":    ocrExtraction.ErrorNotes,
		"hasAIResult":  analysisErr == nil,
		"analysisNote": analysisErrorNote(analysisErr),
	}
	for key, value := range options.Metadata {
		metadata[key] = value
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}

	document := &models.HealthDocument{
		UserID:       userID,
		Title:        title,
		Category:     category,
		Subcategory:  strings.TrimSpace(input.Subcategory),
		SourceType:   sourceType,
		Status:       status,
		Organization: strings.TrimSpace(input.Organization),
		Department:   strings.TrimSpace(input.Department),
		DocumentDate: documentDate,
		Summary:      summary,
		AIConclusion: conclusion,
		Confidence:   &confidence,
		Metadata:     datatypes.JSON(metadataJSON),
	}

	documentFiles := make([]models.DocumentFile, 0, len(input.Files))
	for i, fileInput := range input.Files {
		fileSize := fileInput.FileSize
		if fileSize == 0 && fileInput.FileSizeMB > 0 {
			fileSize = int64(fileInput.FileSizeMB * 1024 * 1024)
		}
		displayOrder := fileInput.DisplayOrder
		if displayOrder == 0 {
			displayOrder = i
		}
		documentFiles = append(documentFiles, models.DocumentFile{
			FileURL:      strings.TrimSpace(fileInput.FileURL),
			PreviewURL:   strings.TrimSpace(fileInput.PreviewURL),
			MimeType:     normalizeMimeType(fileInput.MimeType, fileInput.FileType, fileInput.FileURL),
			FileSize:     fileSize,
			DisplayOrder: displayOrder,
		})
	}

	ocrResults := []models.OCRResult{{
		Provider:      s.ocrProcessor.ProviderName(),
		RawText:       firstNonEmpty(ocrRawText, noteOnlyRawText(input)),
		PagesJSON:     ocrExtraction.PagesJSON,
		TablesJSON:    ocrExtraction.TablesJSON,
		KeyValuesJSON: ocrExtraction.KeyValuesJSON,
		Confidence:    ocrExtraction.Confidence,
	}}

	analyses := []models.AIAnalysis{{
		Model:               modelName,
		AnalysisType:        "document_summary",
		Summary:             summary,
		FindingsJSON:        datatypes.JSON([]byte("[]")),
		RisksJSON:           datatypes.JSON([]byte("[]")),
		RecommendationsJSON: datatypes.JSON([]byte("[]")),
		CitationsJSON:       datatypes.JSON([]byte("[]")),
		Confidence:          &confidence,
	}}

	reviewTasks := buildReviewTasks(userID, status, input, category, analysisErr, ocrExtraction)
	if err := s.repo.CreateWithArtifacts(ctx, document, documentFiles, ocrResults, analyses, reviewTasks); err != nil {
		return nil, err
	}

	var report *ReportDTO
	if options.CreateLegacyReport {
		report, err = s.createLegacyReport(ctx, userID, document, input)
		if err != nil {
			return nil, err
		}
	}

	if err := s.syncMetricsFromDocument(ctx, userID, document, input, firstNonEmpty(ocrRawText, noteOnlyRawText(input)), summary); err != nil {
		return nil, err
	}

	dto, err := s.Get(ctx, userID, document.ID)
	if err != nil {
		return nil, err
	}

	return &ImportedDocumentDTO{
		Document:     *dto,
		LegacyReport: report,
	}, nil
}

func (s *documentService) BackfillReports(ctx context.Context, userID uuid.UUID, input BackfillReportsInput) (*BackfillReportsDTO, error) {
	processLimit := input.Limit
	if processLimit <= 0 {
		processLimit = 20
	}
	if processLimit > 50 {
		processLimit = 50
	}

	reports, err := s.reportService.List(ctx, repository.ReportFilter{
		UserID: userID,
		Limit:  1000,
		Order:  "report_date DESC",
	})
	if err != nil {
		return nil, err
	}

	result := &BackfillReportsDTO{
		Items: make([]BackfillReportItemDTO, 0, len(reports.Items)),
	}
	for _, report := range reports.Items {
		if result.Processed+result.Failed >= processLimit {
			break
		}
		item := BackfillReportItemDTO{
			ReportID: report.ID,
			Title:    report.Title,
		}

		exists, err := s.repo.ExistsForLegacyReport(ctx, userID, report.ID)
		if err != nil {
			item.Status = "failed"
			item.Error = err.Error()
			result.Failed++
			result.Items = append(result.Items, item)
			continue
		}
		if exists {
			item.Status = "skipped"
			result.Skipped++
			result.Items = append(result.Items, item)
			continue
		}

		importInput := importInputFromReport(report)
		if len(importInput.Files) == 0 && strings.TrimSpace(importInput.Note) == "" {
			item.Status = "skipped"
			item.Error = "empty_report"
			result.Skipped++
			result.Items = append(result.Items, item)
			continue
		}

		imported, err := s.importDocument(ctx, userID, importInput, importOptions{
			CreateLegacyReport: false,
			Metadata: map[string]any{
				"source":         "legacy_report_backfill",
				"legacyReportId": report.ID.String(),
			},
		})
		if err != nil {
			item.Status = "failed"
			item.Error = err.Error()
			result.Failed++
			result.Items = append(result.Items, item)
			continue
		}
		item.Status = imported.Document.Status
		item.DocumentID = &imported.Document.ID
		result.Processed++
		result.Items = append(result.Items, item)
	}

	return result, nil
}

func (s *documentService) List(ctx context.Context, filter repository.DocumentFilter) (*PaginatedDocuments, error) {
	documents, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]DocumentDTO, 0, len(documents))
	for _, document := range documents {
		dto, err := s.mapDocumentToDTO(ctx, &document)
		if err != nil {
			return nil, err
		}
		items = append(items, *dto)
	}

	return &PaginatedDocuments{
		Items:  items,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}, nil
}

func (s *documentService) syncMetricsFromDocument(ctx context.Context, userID uuid.UUID, document *models.HealthDocument, input ImportDocumentInput, rawText string, summary string) error {
	if s.metricService == nil {
		return nil
	}
	observedAt := time.Now()
	if document.DocumentDate != nil {
		observedAt = *document.DocumentDate
	}

	sourceText := strings.Join([]string{rawText, input.Note, summary}, "\n")
	metrics := extractMetricInputsFromText(sourceText, observedAt, document.Title, document.ID)
	for _, metric := range metrics {
		if _, err := s.metricService.Create(ctx, userID, metric); err != nil {
			return err
		}
	}
	return nil
}

func (s *documentService) Get(ctx context.Context, userID uuid.UUID, documentID uuid.UUID) (*DocumentDTO, error) {
	document, err := s.repo.FindByID(ctx, documentID, userID)
	if err != nil {
		return nil, err
	}
	if document == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return s.mapDocumentToDTO(ctx, document)
}

func (s *documentService) createLegacyReport(ctx context.Context, userID uuid.UUID, document *models.HealthDocument, input ImportDocumentInput) (*ReportDTO, error) {
	reportFiles := make([]CreateReportFileInput, 0, len(input.Files))
	for i, file := range input.Files {
		fileSizeMB := file.FileSizeMB
		if fileSizeMB == 0 && file.FileSize > 0 {
			fileSizeMB = float64(file.FileSize) / (1024 * 1024)
		}
		reportFiles = append(reportFiles, CreateReportFileInput{
			FileType:     fileTypeForReport(file),
			FileSizeMB:   fileSizeMB,
			FileURL:      strings.TrimSpace(file.FileURL),
			PreviewURL:   firstNonEmpty(strings.TrimSpace(file.PreviewURL), strings.TrimSpace(file.FileURL)),
			DisplayOrder: i,
		})
	}

	organization := firstNonEmpty(document.Organization, "AI 待识别")
	reportDate := time.Now()
	if document.DocumentDate != nil {
		reportDate = *document.DocumentDate
	}

	return s.reportService.Create(ctx, userID, CreateReportInput{
		Title:       document.Title,
		Hospital:    organization,
		ReportDate:  reportDate,
		Files:       reportFiles,
		Tags:        uniqueStrings([]string{"AI待处理", document.Category, document.Status}),
		Notes:       buildLegacyReportNotes(document, input),
		IsEncrypted: true,
	})
}

func (s *documentService) mapDocumentToDTO(ctx context.Context, document *models.HealthDocument) (*DocumentDTO, error) {
	reviewCount, err := s.repo.CountOpenReviewTasks(ctx, document.ID)
	if err != nil {
		return nil, err
	}

	files := make([]DocumentFileDTO, 0, len(document.Files))
	for _, file := range document.Files {
		files = append(files, DocumentFileDTO{
			ID:           file.ID,
			FileURL:      file.FileURL,
			PreviewURL:   file.PreviewURL,
			MimeType:     file.MimeType,
			FileSize:     file.FileSize,
			DisplayOrder: file.DisplayOrder,
		})
	}

	analyses := make([]DocumentAnalysisDTO, 0, len(document.Analyses))
	for _, analysis := range document.Analyses {
		analyses = append(analyses, DocumentAnalysisDTO{
			ID:           analysis.ID,
			Model:        analysis.Model,
			AnalysisType: analysis.AnalysisType,
			Summary:      analysis.Summary,
			Confidence:   analysis.Confidence,
			CreatedAt:    analysis.CreatedAt,
		})
	}

	return &DocumentDTO{
		ID:              document.ID,
		Title:           document.Title,
		Category:        document.Category,
		Subcategory:     document.Subcategory,
		SourceType:      document.SourceType,
		Status:          document.Status,
		Organization:    document.Organization,
		Department:      document.Department,
		DocumentDate:    document.DocumentDate,
		Summary:         document.Summary,
		AIConclusion:    document.AIConclusion,
		Confidence:      document.Confidence,
		ReviewTaskCount: reviewCount,
		Files:           files,
		Analyses:        analyses,
		CreatedAt:       document.CreatedAt,
		UpdatedAt:       document.UpdatedAt,
	}, nil
}

func buildDocumentTitle(input ImportDocumentInput, documentDate time.Time) string {
	if len(input.Files) > 0 {
		fileName := filepath.Base(input.Files[0].FileURL)
		if fileName != "." && fileName != "/" {
			return "待识别健康资料 · " + truncateText(fileName, 40)
		}
	}
	if strings.TrimSpace(input.Note) != "" {
		return "自然语言健康记录 · " + documentDate.Format("2006-01-02")
	}
	return "待识别健康资料 · " + documentDate.Format("2006-01-02")
}

func importInputFromReport(report ReportDTO) ImportDocumentInput {
	files := make([]ImportDocumentFileInput, 0, len(report.Files))
	for i, file := range report.Files {
		sizeBytes := int64(file.FileSizeMB * 1024 * 1024)
		files = append(files, ImportDocumentFileInput{
			FileURL:      file.FileURL,
			PreviewURL:   file.PreviewURL,
			FileType:     file.FileType,
			FileSize:     sizeBytes,
			DisplayOrder: i,
		})
	}
	if len(files) == 0 && report.FileURL != "" {
		files = append(files, ImportDocumentFileInput{
			FileURL:      report.FileURL,
			PreviewURL:   firstNonEmpty(report.PreviewURL, report.FileURL),
			FileType:     report.FileType,
			FileSize:     int64(report.FileSizeMB * 1024 * 1024),
			DisplayOrder: 0,
		})
	}

	documentDate := report.ReportDate
	return ImportDocumentInput{
		Title:        report.Title,
		Category:     categoryFromReport(report),
		SourceType:   "legacy_report",
		Organization: report.Hospital,
		DocumentDate: &documentDate,
		Note:         report.Notes,
		Files:        files,
	}
}

func categoryFromReport(report ReportDTO) string {
	haystack := strings.Join(append([]string{report.Title, report.Hospital}, report.Tags...), " ")
	categoryKeywords := map[string][]string{
		"体检": {"体检"},
		"检验": {"检验", "血常规", "尿常规", "肝功能", "肾功能", "血脂", "血糖"},
		"影像": {"影像", "CT", "MRI", "B超", "超声", "X光", "心电图"},
		"病历": {"病历", "门诊", "住院", "出院"},
		"用药": {"用药", "处方", "药"},
	}
	for category, keywords := range categoryKeywords {
		for _, keyword := range keywords {
			if strings.Contains(haystack, keyword) {
				return category
			}
		}
	}
	return "其他"
}

func buildFallbackSummary(input ImportDocumentInput, title string, ocrExtraction OCRExtraction) string {
	parts := []string{"已导入：" + title}
	if len(input.Files) > 0 {
		parts = append(parts, "包含文件数："+strconvItoa(len(input.Files)))
		if strings.TrimSpace(ocrExtraction.RawText) != "" {
			parts = append(parts, "OCR 已识别文字")
		} else {
			parts = append(parts, "OCR 等待处理")
		}
	}
	if note := strings.TrimSpace(input.Note); note != "" {
		parts = append(parts, "用户补充："+truncateText(note, 300))
	}
	return strings.Join(parts, "；")
}

func buildLegacyReportNotes(document *models.HealthDocument, input ImportDocumentInput) string {
	parts := []string{
		"AI-native 导入记录",
		"状态：" + document.Status,
		"摘要：" + document.Summary,
	}
	if note := strings.TrimSpace(input.Note); note != "" {
		parts = append(parts, "用户补充："+note)
	}
	return strings.Join(parts, "\n")
}

func buildReviewTasks(userID uuid.UUID, status string, input ImportDocumentInput, category string, analysisErr error, ocrExtraction OCRExtraction) []models.ReviewTask {
	if status == "ready" {
		return nil
	}

	tasks := []models.ReviewTask{{
		UserID:         userID,
		TaskType:       "confirm_category",
		FieldName:      "category",
		SuggestedValue: category,
		Status:         "open",
	}}

	if len(input.Files) > 0 && (strings.TrimSpace(ocrExtraction.RawText) == "" || len(ocrExtraction.ErrorNotes) > 0) {
		tasks = append(tasks, models.ReviewTask{
			UserID:         userID,
			TaskType:       "run_ocr",
			FieldName:      "ocr_text",
			SuggestedValue: strings.Join(ocrExtraction.ErrorNotes, ","),
			Status:         "open",
		})
	}
	if analysisErr != nil {
		tasks = append(tasks, models.ReviewTask{
			UserID:         userID,
			TaskType:       "run_ai_analysis",
			FieldName:      "ai_analysis",
			SuggestedValue: analysisErrorNote(analysisErr),
			Status:         "open",
		})
	}
	return tasks
}

func normalizeDocumentCategory(value string, fallback string) string {
	category := strings.TrimSpace(value)
	if category == "" || category == "AI待分类" || category == "AI 自动分类" {
		category = strings.TrimSpace(fallback)
	}
	switch category {
	case "体检", "检验", "影像", "病历", "用药", "其他":
		return category
	default:
		return "其他"
	}
}

func normalizeMimeType(mimeType string, fileType string, fileURL string) string {
	if strings.TrimSpace(mimeType) != "" {
		return strings.TrimSpace(mimeType)
	}
	switch strings.ToLower(strings.TrimSpace(fileType)) {
	case "pdf":
		return "application/pdf"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	}
	ext := strings.ToLower(filepath.Ext(fileURL))
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	default:
		return "application/octet-stream"
	}
}

func fileTypeForReport(file ImportDocumentFileInput) string {
	value := strings.ToLower(strings.TrimSpace(file.FileType))
	if value != "" {
		return value
	}
	mimeType := strings.ToLower(strings.TrimSpace(file.MimeType))
	switch {
	case strings.Contains(mimeType, "pdf"):
		return "pdf"
	case strings.Contains(mimeType, "png"):
		return "png"
	case strings.Contains(mimeType, "jpeg"), strings.Contains(mimeType, "jpg"):
		return "jpg"
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(file.FileURL)), ".")
	if ext != "" {
		return ext
	}
	return "file"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		cleaned := strings.TrimSpace(value)
		if cleaned == "" {
			continue
		}
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		result = append(result, cleaned)
	}
	return result
}

func truncateText(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit])
}

func analysisErrorNote(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, ErrAIUnavailable) {
		return "ai_unavailable"
	}
	return "ai_error"
}

func noteOnlyRawText(input ImportDocumentInput) string {
	if len(input.Files) == 0 {
		return strings.TrimSpace(input.Note)
	}
	return ""
}

func strconvItoa(value int) string {
	return strconv.FormatInt(int64(value), 10)
}

var (
	bloodPressurePattern = regexp.MustCompile(`(?i)(?:血压|bp|blood pressure)?\s*[:：]?\s*(\d{2,3})\s*/\s*(\d{2,3})`)
	bloodPressureWords   = regexp.MustCompile(`(?i)(?:血压|bp|blood pressure)\s*[:：]?\s*(\d{2,3})\s+(\d{2,3})`)
	weightPattern        = regexp.MustCompile(`(?:体重|weight)\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:kg|公斤|千克)?`)
	bloodSugarPattern    = regexp.MustCompile(`(?i)(?:血糖|葡萄糖|glu|glucose)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:mmol/L|mmol/l)?`)
	heartRatePattern     = regexp.MustCompile(`(?i)(?:心率|脉搏|hr|heart rate)\s*[:：]?\s*(\d{2,3})\s*(?:次/分|bpm)?`)
	temperaturePattern   = regexp.MustCompile(`(?:体温|temperature)\s*[:：]?\s*(3\d(?:\.\d+)?)\s*(?:℃|°C|度)?`)
	bmiPattern           = regexp.MustCompile(`(?i)(?:BMI|体质指数)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)`)
)

func extractMetricInputsFromText(text string, recordedAt time.Time, documentTitle string, documentID uuid.UUID) []CreateMetricInput {
	cleaned := strings.ReplaceAll(text, "／", "/")
	cleaned = strings.ReplaceAll(cleaned, "：", ":")
	notes := "OCR/AI 来源：" + documentTitle + " #" + documentID.String()
	metrics := make([]CreateMetricInput, 0, 4)
	seen := map[string]struct{}{}

	add := func(input CreateMetricInput) {
		if _, ok := seen[input.MetricType]; ok {
			return
		}
		seen[input.MetricType] = struct{}{}
		metrics = append(metrics, input)
	}

	if match := firstRegexMatch(cleaned, bloodPressurePattern, bloodPressureWords); len(match) >= 3 {
		systolic, err1 := strconv.ParseFloat(match[1], 64)
		diastolic, err2 := strconv.ParseFloat(match[2], 64)
		if err1 == nil && err2 == nil && systolic >= 60 && systolic <= 250 && diastolic >= 30 && diastolic <= 160 {
			add(CreateMetricInput{
				MetricType:     "blood-pressure",
				PrimaryValue:   systolic,
				SecondaryValue: &diastolic,
				Unit:           "mmHg",
				RecordedAt:     recordedAt,
				Notes:          notes,
			})
		}
	}

	addNumberMetric(cleaned, weightPattern, "weight", "kg", recordedAt, notes, 20, 250, add)
	addNumberMetric(cleaned, bloodSugarPattern, "blood-sugar", "mmol/L", recordedAt, notes, 1, 40, add)
	addNumberMetric(cleaned, heartRatePattern, "heart-rate", "bpm", recordedAt, notes, 30, 220, add)
	addNumberMetric(cleaned, temperaturePattern, "temperature", "℃", recordedAt, notes, 34, 43, add)
	addNumberMetric(cleaned, bmiPattern, "bmi", "", recordedAt, notes, 10, 60, add)

	return metrics
}

func firstRegexMatch(text string, patterns ...*regexp.Regexp) []string {
	for _, pattern := range patterns {
		if match := pattern.FindStringSubmatch(text); len(match) > 0 {
			return match
		}
	}
	return nil
}

func addNumberMetric(text string, pattern *regexp.Regexp, metricType string, unit string, recordedAt time.Time, notes string, minValue float64, maxValue float64, add func(CreateMetricInput)) {
	match := pattern.FindStringSubmatch(text)
	if len(match) < 2 {
		return
	}
	value, err := strconv.ParseFloat(match[1], 64)
	if err != nil || value < minValue || value > maxValue {
		return
	}
	add(CreateMetricInput{
		MetricType:   metricType,
		PrimaryValue: value,
		Unit:         unit,
		RecordedAt:   recordedAt,
		Notes:        notes,
	})
}
