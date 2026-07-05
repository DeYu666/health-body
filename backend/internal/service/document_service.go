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
	GetByLegacyReport(ctx context.Context, userID uuid.UUID, reportID uuid.UUID) (*DocumentDTO, error)
	UpdateReview(ctx context.Context, userID uuid.UUID, documentID uuid.UUID, input UpdateDocumentReviewInput) (*DocumentDTO, error)
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

type DocumentOCRResultDTO struct {
	ID         uuid.UUID `json:"id"`
	Provider   string    `json:"provider"`
	RawText    string    `json:"rawText"`
	Confidence *float64  `json:"confidence,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

type DocumentObservationDTO struct {
	ID             uuid.UUID  `json:"id"`
	Name           string     `json:"name"`
	NormalizedName string     `json:"normalizedName"`
	Code           string     `json:"code"`
	ValueNumber    *float64   `json:"valueNumber,omitempty"`
	ValueText      string     `json:"valueText"`
	Unit           string     `json:"unit"`
	ReferenceLow   *float64   `json:"referenceLow,omitempty"`
	ReferenceHigh  *float64   `json:"referenceHigh,omitempty"`
	ReferenceText  string     `json:"referenceText"`
	AbnormalFlag   string     `json:"abnormalFlag"`
	ObservedAt     *time.Time `json:"observedAt,omitempty"`
	Confidence     *float64   `json:"confidence,omitempty"`
	ReviewStatus   string     `json:"reviewStatus"`
}

type DocumentDTO struct {
	ID              uuid.UUID                `json:"id"`
	Title           string                   `json:"title"`
	Category        string                   `json:"category"`
	Subcategory     string                   `json:"subcategory"`
	SourceType      string                   `json:"sourceType"`
	Status          string                   `json:"status"`
	Organization    string                   `json:"organization"`
	Department      string                   `json:"department"`
	DocumentDate    *time.Time               `json:"documentDate,omitempty"`
	Summary         string                   `json:"summary"`
	AIConclusion    string                   `json:"aiConclusion"`
	Confidence      *float64                 `json:"confidence,omitempty"`
	ReviewTaskCount int64                    `json:"reviewTaskCount"`
	Files           []DocumentFileDTO        `json:"files,omitempty"`
	OCRResults      []DocumentOCRResultDTO   `json:"ocrResults,omitempty"`
	Observations    []DocumentObservationDTO `json:"observations,omitempty"`
	Analyses        []DocumentAnalysisDTO    `json:"analyses,omitempty"`
	CreatedAt       time.Time                `json:"createdAt"`
	UpdatedAt       time.Time                `json:"updatedAt"`
}

type UpdateDocumentReviewInput struct {
	Category     string                           `json:"category"`
	Summary      string                           `json:"summary"`
	AIConclusion string                           `json:"aiConclusion"`
	Confidence   *float64                         `json:"confidence"`
	Status       string                           `json:"status"`
	Observations []UpdateDocumentObservationInput `json:"observations"`
}

type UpdateDocumentObservationInput struct {
	Name           string     `json:"name"`
	NormalizedName string     `json:"normalizedName"`
	Code           string     `json:"code"`
	ValueNumber    *float64   `json:"valueNumber"`
	ValueText      string     `json:"valueText"`
	Unit           string     `json:"unit"`
	ReferenceLow   *float64   `json:"referenceLow"`
	ReferenceHigh  *float64   `json:"referenceHigh"`
	ReferenceText  string     `json:"referenceText"`
	AbnormalFlag   string     `json:"abnormalFlag"`
	ObservedAt     *time.Time `json:"observedAt"`
	Confidence     *float64   `json:"confidence"`
	ReviewStatus   string     `json:"reviewStatus"`
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
	ReportID    uuid.UUID  `json:"reportId"`
	DocumentID  *uuid.UUID `json:"documentId,omitempty"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	MetricCount int        `json:"metricCount,omitempty"`
	Error       string     `json:"error,omitempty"`
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

	if _, err := s.syncMetricsFromDocument(ctx, userID, document, input, firstNonEmpty(ocrRawText, noteOnlyRawText(input)), summary); err != nil {
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
		importInput := importInputFromReport(report)

		exists, err := s.repo.ExistsForLegacyReport(ctx, userID, report.ID)
		if err != nil {
			item.Status = "failed"
			item.Error = err.Error()
			result.Failed++
			result.Items = append(result.Items, item)
			continue
		}
		if exists {
			retry, err := s.repo.LegacyReportNeedsOCRRetry(ctx, userID, report.ID)
			if err != nil {
				item.Status = "failed"
				item.Error = err.Error()
				result.Failed++
				result.Items = append(result.Items, item)
				continue
			}
			if retry {
				if err := s.repo.DeleteForLegacyReport(ctx, userID, report.ID); err != nil {
					item.Status = "failed"
					item.Error = err.Error()
					result.Failed++
					result.Items = append(result.Items, item)
					continue
				}
			} else {
				document, err := s.repo.FindByLegacyReport(ctx, userID, report.ID)
				if err != nil {
					item.Status = "failed"
					item.Error = err.Error()
					result.Failed++
					result.Items = append(result.Items, item)
					continue
				}
				if document == nil {
					item.Status = "skipped"
					item.Error = "document_not_found"
					result.Skipped++
					result.Items = append(result.Items, item)
					continue
				}
				added, err := s.syncMetricsFromDocument(ctx, userID, document, importInput, latestOCRRawText(document), document.Summary)
				if err != nil {
					item.Status = "failed"
					item.Error = err.Error()
					result.Failed++
					result.Items = append(result.Items, item)
					continue
				}
				item.DocumentID = &document.ID
				item.MetricCount = added
				if added > 0 {
					item.Status = "synced"
					result.Processed++
				} else {
					item.Status = "skipped"
					result.Skipped++
				}
				result.Items = append(result.Items, item)
				continue
			}
		}

		if exists {
			item.Status = "retrying"
		}

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
		item.MetricCount = 0
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

func (s *documentService) syncMetricsFromDocument(ctx context.Context, userID uuid.UUID, document *models.HealthDocument, input ImportDocumentInput, rawText string, summary string) (int, error) {
	observedAt := time.Now()
	if document.DocumentDate != nil {
		observedAt = *document.DocumentDate
	}

	sourceText := strings.Join([]string{rawText, input.Note, summary}, "\n")
	observations := extractObservationModelsFromText(sourceText, observedAt)
	if err := s.repo.ReplaceObservations(ctx, userID, document.ID, observations); err != nil {
		return 0, err
	}

	if s.metricService == nil {
		return 0, nil
	}
	if err := s.metricService.DeleteDocumentLinked(ctx, userID, document.ID); err != nil {
		return 0, err
	}
	metrics := extractMetricInputsFromText(sourceText, observedAt, document.Title, document.ID)
	metrics = append(metrics, metricInputsFromObservations(observations, observedAt, document.Title, document.ID)...)
	added := 0
	for _, metric := range metrics {
		if _, err := s.metricService.Create(ctx, userID, metric); err != nil {
			return added, err
		}
		added++
	}
	return added, nil
}

func latestOCRRawText(document *models.HealthDocument) string {
	for _, result := range document.OCRResults {
		if text := strings.TrimSpace(result.RawText); text != "" {
			return text
		}
	}
	return ""
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

func (s *documentService) GetByLegacyReport(ctx context.Context, userID uuid.UUID, reportID uuid.UUID) (*DocumentDTO, error) {
	document, err := s.repo.FindByLegacyReport(ctx, userID, reportID)
	if err != nil {
		return nil, err
	}
	if document == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return s.mapDocumentToDTO(ctx, document)
}

func (s *documentService) UpdateReview(ctx context.Context, userID uuid.UUID, documentID uuid.UUID, input UpdateDocumentReviewInput) (*DocumentDTO, error) {
	document, err := s.repo.FindByID(ctx, documentID, userID)
	if err != nil {
		return nil, err
	}
	if document == nil {
		return nil, gorm.ErrRecordNotFound
	}

	confidence := 0.75
	if document.Confidence != nil {
		confidence = *document.Confidence
	}
	if input.Confidence != nil {
		confidence = clampConfidence(*input.Confidence)
	}
	status := normalizeDocumentStatus(input.Status)
	observations := make([]models.ExtractedObservation, 0, len(input.Observations))
	for _, observation := range input.Observations {
		name := strings.TrimSpace(observation.Name)
		if name == "" {
			continue
		}
		valueText := strings.TrimSpace(observation.ValueText)
		if valueText == "" && observation.ValueNumber != nil {
			valueText = strconv.FormatFloat(*observation.ValueNumber, 'f', -1, 64)
		}
		observedAt := observation.ObservedAt
		if observedAt == nil {
			observedAt = document.DocumentDate
		}
		confidenceValue := confidence
		if observation.Confidence != nil {
			confidenceValue = clampConfidence(*observation.Confidence)
		}
		observations = append(observations, models.ExtractedObservation{
			Name:           name,
			NormalizedName: firstNonEmpty(strings.TrimSpace(observation.NormalizedName), normalizeObservationName(name)),
			CodeSystem:     "local",
			Code:           strings.TrimSpace(observation.Code),
			ValueNumber:    observation.ValueNumber,
			ValueText:      valueText,
			Unit:           strings.TrimSpace(observation.Unit),
			ReferenceLow:   observation.ReferenceLow,
			ReferenceHigh:  observation.ReferenceHigh,
			ReferenceText:  strings.TrimSpace(observation.ReferenceText),
			AbnormalFlag:   normalizeAbnormalFlag(observation.AbnormalFlag),
			ObservedAt:     observedAt,
			SourceBBoxJSON: datatypes.JSON([]byte("{}")),
			Confidence:     &confidenceValue,
			ReviewStatus:   normalizeReviewStatus(observation.ReviewStatus),
		})
	}

	fields := map[string]any{
		"category":      normalizeDocumentCategory(input.Category, document.Category),
		"summary":       strings.TrimSpace(input.Summary),
		"ai_conclusion": strings.TrimSpace(input.AIConclusion),
		"confidence":    confidence,
		"status":        status,
	}
	if err := s.repo.UpdateReview(ctx, userID, document.ID, fields, observations); err != nil {
		return nil, err
	}

	if s.metricService != nil {
		if err := s.metricService.DeleteDocumentLinked(ctx, userID, document.ID); err != nil {
			return nil, err
		}
		observedAt := time.Now()
		if document.DocumentDate != nil {
			observedAt = *document.DocumentDate
		}
		for _, metric := range metricInputsFromObservations(observations, observedAt, document.Title, document.ID) {
			if _, err := s.metricService.Create(ctx, userID, metric); err != nil {
				return nil, err
			}
		}
	}

	return s.Get(ctx, userID, document.ID)
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
	aiFields := normalizedDocumentAIFields(document)

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

	ocrResults := make([]DocumentOCRResultDTO, 0, len(document.OCRResults))
	for _, result := range document.OCRResults {
		ocrResults = append(ocrResults, DocumentOCRResultDTO{
			ID:         result.ID,
			Provider:   result.Provider,
			RawText:    result.RawText,
			Confidence: result.Confidence,
			CreatedAt:  result.CreatedAt,
		})
	}

	observations := make([]DocumentObservationDTO, 0, len(document.Observations))
	for _, observation := range document.Observations {
		observations = append(observations, DocumentObservationDTO{
			ID:             observation.ID,
			Name:           observation.Name,
			NormalizedName: observation.NormalizedName,
			Code:           observation.Code,
			ValueNumber:    observation.ValueNumber,
			ValueText:      observation.ValueText,
			Unit:           observation.Unit,
			ReferenceLow:   observation.ReferenceLow,
			ReferenceHigh:  observation.ReferenceHigh,
			ReferenceText:  observation.ReferenceText,
			AbnormalFlag:   observation.AbnormalFlag,
			ObservedAt:     observation.ObservedAt,
			Confidence:     observation.Confidence,
			ReviewStatus:   observation.ReviewStatus,
		})
	}

	return &DocumentDTO{
		ID:              document.ID,
		Title:           document.Title,
		Category:        aiFields.Category,
		Subcategory:     document.Subcategory,
		SourceType:      document.SourceType,
		Status:          document.Status,
		Organization:    document.Organization,
		Department:      document.Department,
		DocumentDate:    document.DocumentDate,
		Summary:         aiFields.Summary,
		AIConclusion:    aiFields.Conclusion,
		Confidence:      aiFields.Confidence,
		ReviewTaskCount: reviewCount,
		Files:           files,
		OCRResults:      ocrResults,
		Observations:    observations,
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

type documentAIFields struct {
	Summary    string
	Conclusion string
	Category   string
	Confidence *float64
}

func normalizedDocumentAIFields(document *models.HealthDocument) documentAIFields {
	fields := documentAIFields{
		Summary:    document.Summary,
		Conclusion: document.AIConclusion,
		Category:   document.Category,
		Confidence: document.Confidence,
	}
	if parsed, ok := parseStoredAIJSON(document.Summary); ok {
		if parsed.Summary != "" {
			fields.Summary = parsed.Summary
		}
		if parsed.Conclusion != "" {
			fields.Conclusion = parsed.Conclusion
		}
		if parsed.Category != "" {
			fields.Category = normalizeDocumentCategory(parsed.Category, document.Category)
		}
		if parsed.Confidence != nil {
			fields.Confidence = parsed.Confidence
		}
	}
	return fields
}

type storedAIJSON struct {
	Summary    string
	Conclusion string
	Category   string
	Confidence *float64
}

func parseStoredAIJSON(value string) (storedAIJSON, bool) {
	text := strings.TrimSpace(value)
	if text == "" || !strings.Contains(text, "{") || !strings.Contains(text, "}") {
		return storedAIJSON{}, false
	}
	jsonText := text
	if start := strings.Index(text, "{"); start >= 0 {
		if end := strings.LastIndex(text, "}"); end > start {
			jsonText = text[start : end+1]
		}
	}
	var parsed struct {
		Summary    string `json:"summary"`
		Conclusion string `json:"conclusion"`
		Category   string `json:"category"`
		Confidence any    `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(jsonText), &parsed); err != nil {
		return storedAIJSON{}, false
	}
	var confidence *float64
	if parsed.Confidence != nil {
		parsedConfidence := clampConfidence(parseAIConfidence(parsed.Confidence))
		confidence = &parsedConfidence
	}
	return storedAIJSON{
		Summary:    strings.TrimSpace(parsed.Summary),
		Conclusion: strings.TrimSpace(parsed.Conclusion),
		Category:   strings.TrimSpace(parsed.Category),
		Confidence: confidence,
	}, true
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

func normalizeDocumentStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "ready", "needs_review", "uploaded", "processing", "failed":
		return strings.TrimSpace(value)
	default:
		return "ready"
	}
}

func normalizeAbnormalFlag(value string) string {
	switch strings.TrimSpace(value) {
	case "high", "low", "normal":
		return strings.TrimSpace(value)
	default:
		return "normal"
	}
}

func normalizeReviewStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "confirmed", "rejected", "pending":
		return strings.TrimSpace(value)
	default:
		return "confirmed"
	}
}

func normalizeObservationName(value string) string {
	replacer := strings.NewReplacer(" ", "_", "-", "_", "%", "percent")
	return strings.ToLower(replacer.Replace(strings.TrimSpace(value)))
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

type labObservationRule struct {
	Name           string
	NormalizedName string
	Code           string
	Unit           string
	MetricType     string
	ReferenceText  string
	ValidateMin    float64
	ValidateMax    float64
	ReferenceLow   *float64
	ReferenceHigh  *float64
	Patterns       []*regexp.Regexp
}

var labObservationRules = []labObservationRule{
	{
		Name:           "肌酸激酶",
		NormalizedName: "creatine_kinase",
		Code:           "CK",
		Unit:           "U/L",
		MetricType:     "lab:creatine-kinase",
		ReferenceText:  "成人常见参考范围约 24-174 U/L，不同医院可能不同",
		ValidateMin:    20,
		ValidateMax:    20000,
		ReferenceLow:   floatPtr(24),
		ReferenceHigh:  floatPtr(174),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)肌酸激酶[^0-9]{0,24}(?:大于|人于|>|＞)?\s*(\d{1,5}(?:\.\d+)?)\s*U\s*[/／]?\s*[Ll1I]`),
		},
	},
	{
		Name:           "C反应蛋白",
		NormalizedName: "c_reactive_protein",
		Code:           "CRP",
		Unit:           "mg/L",
		MetricType:     "lab:c-reactive-protein",
		ReferenceText:  "成人常见参考范围约 0-6 mg/L，不同医院可能不同",
		ValidateMin:    0,
		ValidateMax:    500,
		ReferenceLow:   floatPtr(0),
		ReferenceHigh:  floatPtr(6),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:C反应蛋白|CRP)[^0-9]{0,24}(?:显著升高|升高|结果为|结果)?\s*[\(（]?\s*(\d{1,4}(?:\.\d+)?)\s*mg\s*[/／]?\s*[Ll1I]`),
		},
	},
	{
		Name:           "中性粒细胞百分比",
		NormalizedName: "neutrophil_percent",
		Code:           "NEUT%",
		Unit:           "%",
		MetricType:     "lab:neutrophil-percent",
		ReferenceText:  "成人常见参考范围约 40-75%，不同医院可能不同",
		ValidateMin:    0,
		ValidateMax:    100,
		ReferenceLow:   floatPtr(40),
		ReferenceHigh:  floatPtr(75),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:中性粒细胞百分比|嗜中性粒细胞百分比|NEUT%)[^0-9]{0,24}(?:升高|降低|偏高|偏低)?\s*[\(（]?\s*(\d{1,3}(?:\.\d+)?)\s*%`),
		},
	},
	{
		Name:           "淋巴细胞百分比",
		NormalizedName: "lymphocyte_percent",
		Code:           "LYMPH%",
		Unit:           "%",
		MetricType:     "lab:lymphocyte-percent",
		ReferenceText:  "成人常见参考范围约 20-50%，不同医院可能不同",
		ValidateMin:    0,
		ValidateMax:    100,
		ReferenceLow:   floatPtr(20),
		ReferenceHigh:  floatPtr(50),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:淋巴细胞百分比|LYMPH%)[^0-9]{0,24}(?:升高|降低|偏高|偏低)?\s*[\(（]?\s*(\d{1,3}(?:\.\d+)?)\s*%`),
		},
	},
	{
		Name:           "肌钙蛋白TNI",
		NormalizedName: "troponin_i",
		Code:           "TNI",
		Unit:           "ng/mL",
		MetricType:     "lab:troponin-i",
		ReferenceText:  "常见参考范围约 0-0.041 ng/mL，不同医院可能不同",
		ValidateMin:    0,
		ValidateMax:    100,
		ReferenceLow:   floatPtr(0),
		ReferenceHigh:  floatPtr(0.041),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:肌钙蛋白(?:[（(]?\s*TNI\s*[）)]?)?|TNI)[^0-9]{0,24}(?:结果为|结果)\s*(\d(?:\.\d+)?)\s*ng\s*[/／]?\s*m[lL]`),
		},
	},
	{
		Name:           "尿比重",
		NormalizedName: "urine_specific_gravity",
		Code:           "USG",
		Unit:           "",
		MetricType:     "lab:urine-specific-gravity",
		ReferenceText:  "常见参考范围约 1.003-1.030，不同医院可能不同",
		ValidateMin:    1,
		ValidateMax:    1.05,
		ReferenceLow:   floatPtr(1.003),
		ReferenceHigh:  floatPtr(1.030),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:尿比重|比重|SG)[^0-9]{0,12}(\d\.\d{3})`),
		},
	},
	{
		Name:           "尿pH",
		NormalizedName: "urine_ph",
		Code:           "UPH",
		Unit:           "",
		MetricType:     "lab:urine-ph",
		ReferenceText:  "常见参考范围约 5.0-8.0，不同医院可能不同",
		ValidateMin:    4,
		ValidateMax:    9,
		ReferenceLow:   floatPtr(5),
		ReferenceHigh:  floatPtr(8),
		Patterns: []*regexp.Regexp{
			regexp.MustCompile(`(?i)(?:尿pH|pH|PH|pll)[^0-9]{0,12}(\d(?:\.\d+)?)`),
		},
	},
}

func extractMetricInputsFromText(text string, recordedAt time.Time, documentTitle string, documentID uuid.UUID) []CreateMetricInput {
	cleaned := normalizeMetricText(text)
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

func extractObservationModelsFromText(text string, observedAt time.Time) []models.ExtractedObservation {
	cleaned := normalizeMetricText(text)
	if strings.TrimSpace(cleaned) == "" {
		return nil
	}

	observedAtCopy := observedAt
	observations := make([]models.ExtractedObservation, 0, len(labObservationRules))
	seen := map[string]struct{}{}
	confidence := 0.68
	for _, rule := range labObservationRules {
		value, ok := firstLabRuleValue(cleaned, rule)
		if !ok {
			continue
		}
		key := rule.MetricType
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		valueCopy := value
		observations = append(observations, models.ExtractedObservation{
			Name:           rule.Name,
			NormalizedName: rule.NormalizedName,
			CodeSystem:     "local",
			Code:           rule.Code,
			ValueNumber:    &valueCopy,
			ValueText:      strconv.FormatFloat(value, 'f', -1, 64),
			Unit:           rule.Unit,
			ReferenceLow:   rule.ReferenceLow,
			ReferenceHigh:  rule.ReferenceHigh,
			ReferenceText:  rule.ReferenceText,
			AbnormalFlag:   abnormalFlag(value, rule.ReferenceLow, rule.ReferenceHigh),
			ObservedAt:     &observedAtCopy,
			SourceBBoxJSON: datatypes.JSON([]byte("{}")),
			Confidence:     &confidence,
			ReviewStatus:   "pending",
		})
	}
	return observations
}

func metricInputsFromObservations(observations []models.ExtractedObservation, recordedAt time.Time, documentTitle string, documentID uuid.UUID) []CreateMetricInput {
	if len(observations) == 0 {
		return nil
	}
	notesPrefix := "OCR/AI 来源：" + documentTitle + " #" + documentID.String()
	metrics := make([]CreateMetricInput, 0, len(observations))
	seen := map[string]struct{}{}
	for _, observation := range observations {
		if observation.ValueNumber == nil {
			continue
		}
		metricType := labMetricType(observation.NormalizedName)
		if metricType == "" {
			continue
		}
		if _, ok := seen[metricType]; ok {
			continue
		}
		seen[metricType] = struct{}{}
		metricRecordedAt := recordedAt
		if observation.ObservedAt != nil {
			metricRecordedAt = *observation.ObservedAt
		}
		metrics = append(metrics, CreateMetricInput{
			MetricType:   metricType,
			PrimaryValue: *observation.ValueNumber,
			Unit:         observation.Unit,
			RecordedAt:   metricRecordedAt,
			Notes:        notesPrefix + "；项目：" + observation.Name,
		})
	}
	return metrics
}

func labMetricType(normalizedName string) string {
	for _, rule := range labObservationRules {
		if rule.NormalizedName == normalizedName {
			return rule.MetricType
		}
	}
	return ""
}

func firstLabRuleValue(text string, rule labObservationRule) (float64, bool) {
	for _, pattern := range rule.Patterns {
		match := pattern.FindStringSubmatch(text)
		if len(match) < 2 {
			continue
		}
		value, err := strconv.ParseFloat(match[1], 64)
		if err != nil {
			continue
		}
		if value < rule.ValidateMin || value > rule.ValidateMax {
			continue
		}
		return value, true
	}
	return 0, false
}

func abnormalFlag(value float64, low *float64, high *float64) string {
	if low != nil && value < *low {
		return "low"
	}
	if high != nil && value > *high {
		return "high"
	}
	return "normal"
}

func normalizeMetricText(text string) string {
	replacer := strings.NewReplacer(
		"／", "/",
		"：", ":",
		"（", "(",
		"）", ")",
		"ｍ", "m",
		"ｇ", "g",
		"Ｌ", "L",
		"ｌ", "l",
		"Ⅰ", "I",
		"升商", "升高",
	)
	return replacer.Replace(text)
}

func floatPtr(value float64) *float64 {
	return &value
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
