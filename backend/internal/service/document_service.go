package service

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
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
	List(ctx context.Context, filter repository.DocumentFilter) (*PaginatedDocuments, error)
	Get(ctx context.Context, userID uuid.UUID, documentID uuid.UUID) (*DocumentDTO, error)
}

type documentService struct {
	repo          repository.DocumentRepository
	reportService ReportService
	aiAnalyzer    AIAnalyzer
	ocrProvider   string
}

func NewDocumentService(repo repository.DocumentRepository, reportService ReportService, aiAnalyzer AIAnalyzer, ocrProvider string) DocumentService {
	if strings.TrimSpace(ocrProvider) == "" {
		ocrProvider = "none"
	}
	return &documentService{
		repo:          repo,
		reportService: reportService,
		aiAnalyzer:    aiAnalyzer,
		ocrProvider:   ocrProvider,
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

func (s *documentService) Import(ctx context.Context, userID uuid.UUID, input ImportDocumentInput) (*ImportedDocumentDTO, error) {
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
	rawText := strings.TrimSpace(input.Note)
	analysis, analysisErr := s.aiAnalyzer.AnalyzeDocument(ctx, AIAnalyzeDocumentInput{
		Title:     title,
		Category:  input.Category,
		Note:      input.Note,
		OCRText:   rawText,
		FileCount: len(input.Files),
	})

	category := categoryHint
	summary := buildFallbackSummary(input, title)
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
		if rawText != "" && confidence >= 0.6 {
			status = "ready"
		}
	}

	metadata := map[string]any{
		"source":       "documents_import",
		"fileCount":    len(input.Files),
		"ocrProvider":  s.ocrProvider,
		"hasAIResult":  analysisErr == nil,
		"analysisNote": analysisErrorNote(analysisErr),
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
		Provider:      s.ocrProvider,
		RawText:       rawText,
		PagesJSON:     datatypes.JSON([]byte("[]")),
		TablesJSON:    datatypes.JSON([]byte("[]")),
		KeyValuesJSON: datatypes.JSON([]byte("{}")),
		Confidence:    nil,
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

	reviewTasks := buildReviewTasks(userID, status, input, category, analysisErr)
	if err := s.repo.CreateWithArtifacts(ctx, document, documentFiles, ocrResults, analyses, reviewTasks); err != nil {
		return nil, err
	}

	report, err := s.createLegacyReport(ctx, userID, document, input)
	if err != nil {
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

func buildFallbackSummary(input ImportDocumentInput, title string) string {
	parts := []string{"已导入：" + title}
	if len(input.Files) > 0 {
		parts = append(parts, "包含文件数："+strconvItoa(len(input.Files)))
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

func buildReviewTasks(userID uuid.UUID, status string, input ImportDocumentInput, category string, analysisErr error) []models.ReviewTask {
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

	if len(input.Files) > 0 {
		tasks = append(tasks, models.ReviewTask{
			UserID:    userID,
			TaskType:  "run_ocr",
			FieldName: "ocr_text",
			Status:    "open",
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

func strconvItoa(value int) string {
	return strconv.FormatInt(int64(value), 10)
}
