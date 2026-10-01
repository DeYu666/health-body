package healthimport

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"math"
	"strings"
	"testing"
)

func record(kind, unit, value, extra string) string {
	return fmt.Sprintf(`<Record type="HKQuantityTypeIdentifier%s" sourceName="Watch" unit="%s" value="%s" startDate="2026-09-06 00:15:00 +0800" endDate="2026-09-06 00:16:00 +0800" %s/>`, kind, unit, value, extra)
}

func readXML(content string) (*Result, error) {
	return Read(context.Background(), strings.NewReader(content), int64(len(content)))
}

func TestImportXMLUnitsDatesAndSkippedRecords(t *testing.T) {
	xml := `<HealthData>` + record("BodyMass", "lb", "150", "") + record("OxygenSaturation", "%", "0.98", "") +
		record("StepCount", "count", "0", "") + record("HeartRate", "unknown", "80", "") + record("HeartRate", "count/min", "NaN", "") +
		record("BodyFatPercentage", "%", "98", "") + `<Record type="HKCategoryTypeIdentifierSleepAnalysis"/><Workout/></HealthData>`
	result, err := readXML(xml)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Samples) != 3 || result.Invalid != 3 || result.Unsupported != 2 {
		t.Fatalf("unexpected counts: %+v", result)
	}
	if math.Abs(result.Samples[0].Value-68.0388555) > 0.000001 {
		t.Fatal("pound conversion failed")
	}
	if result.Samples[1].Value != 98 {
		t.Fatal("fraction conversion failed")
	}
	if result.Samples[1].OriginalValue != "0.98" || result.Samples[1].OriginalUnit != "%" || result.Samples[1].StartOffsetMinutes != 480 {
		t.Fatal("lost original quantity or timezone offset")
	}
	if result.Samples[0].Date != "2026-09-06" || result.Samples[0].Start.UTC().Day() != 5 {
		t.Fatal("lost source timezone")
	}
}

func TestDedupIgnoresDeviceMemoryAddressButPreservesDifferentSources(t *testing.T) {
	first := record("HeartRate", "count/min", "80", `device="&lt;&lt;HKDevice: 0xabcd&gt;, name:Apple Watch, manufacturer:Apple, model:Watch, hardware:Watch6, software:12&gt;"`)
	second := strings.ReplaceAll(strings.ReplaceAll(first, "0xabcd", "0x1234"), "software:12", "software:13")
	third := strings.ReplaceAll(first, `sourceName="Watch"`, `sourceName="Phone"`)
	result, err := readXML("<HealthData>" + first + second + third + "</HealthData>")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Samples) != 2 || result.Duplicates != 1 {
		t.Fatalf("unexpected counts: %+v", result)
	}
}

func TestRejectsMalformedOrUnrelatedFilesWithoutPartialResult(t *testing.T) {
	for _, xml := range []string{"", "hello", "<other/>", "<HealthData>", "<HealthData/><HealthData/>", "<HealthData>" + record("HeartRate", "count/min", "80", "") + "<broken>"} {
		result, err := readXML(xml)
		if err == nil || result != nil {
			t.Fatalf("accepted invalid input: %q", xml)
		}
	}
}

func TestZIPReadsOnlyHealthExportAndRejectsAmbiguity(t *testing.T) {
	for _, count := range []int{1, 2} {
		var data bytes.Buffer
		writer := zip.NewWriter(&data)
		for i := 0; i < count; i++ {
			entry, _ := writer.Create(fmt.Sprintf("folder%d/export.xml", i))
			fmt.Fprint(entry, "<HealthData>"+record("HeartRate", "count/min", "80", "")+"</HealthData>")
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		result, err := Read(context.Background(), bytes.NewReader(data.Bytes()), int64(data.Len()))
		if count == 1 && (err != nil || len(result.Samples) != 1) {
			t.Fatal("valid ZIP rejected", err)
		}
		if count == 2 && err == nil {
			t.Fatal("ambiguous ZIP accepted")
		}
	}
}

func TestCancellationAndSizeLimits(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Read(ctx, strings.NewReader("<HealthData/>"), 13); err == nil {
		t.Fatal("cancellation ignored")
	}
	if _, err := Read(context.Background(), strings.NewReader(""), MaxUploadBytes+1); err == nil {
		t.Fatal("oversize accepted")
	}
}
