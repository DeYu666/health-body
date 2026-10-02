package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestExtractObservationModelsFromText(t *testing.T) {
	recordedAt := time.Date(2025, 4, 29, 10, 30, 0, 0, time.UTC)
	text := `
		患者体检发现肌酸激酶大于1500U/L。
		C反应蛋白显著升高（150 mg/L），中性粒细胞百分比升高（85.8%），淋巴细胞百分比降低（8.0%）。
		肌钙蛋白（TNI）结果为0.012 ng/ml。
		尿常规：比重：1.022；pH：6.00。
	`

	observations := extractObservationModelsFromText(text, recordedAt)
	values := map[string]float64{}
	for _, observation := range observations {
		if observation.ValueNumber == nil {
			continue
		}
		values[observation.NormalizedName] = *observation.ValueNumber
	}

	expected := map[string]float64{
		"creatine_kinase":        1500,
		"c_reactive_protein":     150,
		"neutrophil_percent":     85.8,
		"lymphocyte_percent":     8.0,
		"troponin_i":             0.012,
		"urine_specific_gravity": 1.022,
		"urine_ph":               6.0,
	}
	for name, want := range expected {
		got, ok := values[name]
		if !ok {
			t.Fatalf("expected observation %s", name)
		}
		if got != want {
			t.Fatalf("observation %s = %v, want %v", name, got, want)
		}
	}
}

func TestMetricInputsFromObservations(t *testing.T) {
	recordedAt := time.Date(2025, 4, 29, 10, 30, 0, 0, time.UTC)
	observations := extractObservationModelsFromText("C反应蛋白显著升高（150 mg/L）", recordedAt)

	metrics := metricInputsFromObservations(observations, recordedAt, "高烧不退", uuid.MustParse("11111111-1111-1111-1111-111111111111"))
	if len(metrics) != 1 {
		t.Fatalf("len(metrics) = %d, want 1", len(metrics))
	}
	if metrics[0].MetricType != "lab:c-reactive-protein" {
		t.Fatalf("MetricType = %s, want lab:c-reactive-protein", metrics[0].MetricType)
	}
	if metrics[0].Unit != "mg/L" {
		t.Fatalf("Unit = %s, want mg/L", metrics[0].Unit)
	}
	if metrics[0].PrimaryValue != 150 {
		t.Fatalf("PrimaryValue = %v, want 150", metrics[0].PrimaryValue)
	}
}

func TestParseAIAnalysisContentAcceptsStringConfidence(t *testing.T) {
	output := parseAIAnalysisContent(`{
		"summary": "尿常规检查，白细胞镜检未找到。",
		"conclusion": "多项指标阴性，需结合镜检判断。",
		"category": "检验",
		"confidence": "高"
	}`, "其他")

	if output.Summary != "尿常规检查，白细胞镜检未找到。" {
		t.Fatalf("Summary = %s", output.Summary)
	}
	if output.Conclusion != "多项指标阴性，需结合镜检判断。" {
		t.Fatalf("Conclusion = %s", output.Conclusion)
	}
	if output.Category != "检验" {
		t.Fatalf("Category = %s", output.Category)
	}
	if output.Confidence != 0.85 {
		t.Fatalf("Confidence = %v, want 0.85", output.Confidence)
	}
}
