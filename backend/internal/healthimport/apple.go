package healthimport

import (
	"archive/zip"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const MaxUploadBytes int64 = 256 << 20
const MaxXMLBytes int64 = 1 << 30
const MaxSamples = 500000

type Sample struct {
	MetricType         string
	Source             string
	Device             string
	Unit               string
	Value              float64
	OriginalValue      string
	OriginalUnit       string
	StartOffsetMinutes int
	EndOffsetMinutes   int
	Start              time.Time
	End                time.Time
	Date               string
}

type Result struct {
	Samples     []Sample
	Unsupported int
	Invalid     int
	Duplicates  int
}

type quantity struct {
	metric string
	unit   string
}

var quantities = map[string]quantity{
	"HKQuantityTypeIdentifierHeartRate":                {"heart-rate", "count/min"},
	"HKQuantityTypeIdentifierRestingHeartRate":         {"resting-heart-rate", "count/min"},
	"HKQuantityTypeIdentifierWalkingHeartRateAverage":  {"walking-heart-rate", "count/min"},
	"HKQuantityTypeIdentifierHeartRateVariabilitySDNN": {"heart-rate-variability", "ms"},
	"HKQuantityTypeIdentifierBodyMass":                 {"weight", "kg"},
	"HKQuantityTypeIdentifierBodyFatPercentage":        {"body-fat", "%"},
	"HKQuantityTypeIdentifierOxygenSaturation":         {"oxygen-saturation", "%"},
	"HKQuantityTypeIdentifierStepCount":                {"steps", "count"},
	"HKQuantityTypeIdentifierActiveEnergyBurned":       {"active-energy", "kcal"},
}

var deviceFields = regexp.MustCompile(`(?:^|[,<]\s*)(name|manufacturer|model|hardware|localIdentifier|UDIDeviceIdentifier):\s*([^,>]+)`)

func normalizeDevice(device string) string {
	fields := map[string]string{}
	for _, match := range deviceFields.FindAllStringSubmatch(device, -1) {
		fields[match[1]] = strings.TrimSpace(match[2])
	}
	parts := []string{}
	for _, name := range []string{"name", "manufacturer", "model", "hardware", "localIdentifier", "UDIDeviceIdentifier"} {
		if value := fields[name]; value != "" {
			parts = append(parts, name+": "+value)
		}
	}
	if len(parts) == 0 {
		return strings.TrimSpace(device)
	}
	return strings.Join(parts, ", ")
}

func (s Sample) Key() string {
	return strings.Join([]string{s.MetricType, s.Source, s.Device, s.Unit,
		strconv.FormatFloat(s.Value, 'g', -1, 64), s.Start.UTC().Format(time.RFC3339Nano), s.End.UTC().Format(time.RFC3339Nano)}, "\x00")
}

// Read accepts a Health export directly or locates its XML within a ZIP without extracting files to disk.
func Read(ctx context.Context, file io.ReaderAt, size int64) (*Result, error) {
	if size <= 0 || size > MaxUploadBytes {
		return nil, errors.New("请选择不超过 256 MB 的 Apple 健康 XML 或 ZIP 文件")
	}
	var signature [4]byte
	_, _ = file.ReadAt(signature[:], 0)
	if string(signature[:2]) != "PK" {
		return parse(ctx, io.NewSectionReader(file, 0, size))
	}
	archive, err := zip.NewReader(file, size)
	if err != nil {
		return nil, errors.New("ZIP 文件无法读取，请重新导出")
	}
	var candidate *zip.File
	for _, entry := range archive.File {
		name := path.Base(entry.Name)
		if strings.EqualFold(name, "export.xml") || strings.EqualFold(name, "导出.xml") {
			if candidate != nil {
				return nil, errors.New("ZIP 中存在多个健康导出文件，请单独选择 export.xml")
			}
			candidate = entry
		}
	}
	if candidate == nil {
		return nil, errors.New("ZIP 中未找到健康导出 XML，请解压后选择 export.xml")
	}
	if candidate.UncompressedSize64 > uint64(MaxXMLBytes) {
		return nil, errors.New("解压后的健康 XML 超过 1 GB，本次没有导入")
	}
	reader, err := candidate.Open()
	if err != nil {
		return nil, errors.New("无法打开健康导出 XML")
	}
	defer reader.Close()
	return parse(ctx, reader)
}

func parse(ctx context.Context, reader io.Reader) (*Result, error) {
	limited := &io.LimitedReader{R: reader, N: MaxXMLBytes + 1}
	decoder := xml.NewDecoder(limited)
	result := &Result{}
	seen := make(map[string]struct{})
	depth, roots := 0, 0
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		token, err := decoder.Token()
		if limited.N <= 0 {
			return nil, errors.New("健康 XML 超过 1 GB，本次没有导入")
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, errors.New("健康 XML 不完整或格式无效，本次没有导入")
		}
		switch element := token.(type) {
		case xml.StartElement:
			depth++
			if depth > 64 {
				return nil, errors.New("XML 层级过深")
			}
			if depth == 1 {
				roots++
				if roots != 1 || element.Name.Local != "HealthData" {
					return nil, errors.New("文件不是 Apple 健康导出数据")
				}
			}
			if depth != 2 {
				continue
			}
			if element.Name.Local == "Workout" || element.Name.Local == "ActivitySummary" || element.Name.Local == "Correlation" {
				result.Unsupported++
			}
			if element.Name.Local != "Record" {
				continue
			}
			attrs := make(map[string]string)
			for _, attr := range element.Attr {
				attrs[attr.Name.Local] = attr.Value
			}
			spec, supported := quantities[attrs["type"]]
			if !supported {
				result.Unsupported++
				continue
			}
			sample, err := makeSample(attrs, spec)
			if err != nil {
				result.Invalid++
				continue
			}
			key := sample.Key()
			if _, exists := seen[key]; exists {
				result.Duplicates++
				continue
			}
			seen[key] = struct{}{}
			result.Samples = append(result.Samples, sample)
			if len(result.Samples) > MaxSamples {
				return nil, errors.New("支持的样本超过 50 万条，本次没有导入")
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(element)) != "" {
				return nil, errors.New("XML 根节点外存在无效内容")
			}
		}
	}
	if roots != 1 || depth != 0 {
		return nil, errors.New("健康 XML 缺少完整根节点")
	}
	return result, nil
}

func makeSample(attrs map[string]string, spec quantity) (Sample, error) {
	value, err := strconv.ParseFloat(attrs["value"], 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return Sample{}, errors.New("invalid quantity")
	}
	unit := attrs["unit"]
	switch {
	case spec.unit == "kg" && unit == "lb":
		value *= 0.45359237
	case spec.unit == "kcal" && unit == "kJ":
		value /= 4.184
	case spec.unit == "%" && unit == "%":
		// Health export percentages are fractions (0.98 means 98%).
		if value > 1 {
			return Sample{}, errors.New("invalid fraction")
		}
		value *= 100
	case unit != spec.unit:
		return Sample{}, fmt.Errorf("unsupported unit")
	}
	start, err := parseDate(attrs["startDate"])
	if err != nil {
		return Sample{}, err
	}
	end, err := parseDate(attrs["endDate"])
	if err != nil || end.Before(start) {
		return Sample{}, errors.New("invalid sample interval")
	}
	source := strings.TrimSpace(attrs["sourceName"])
	if source == "" {
		source = "未标注来源"
	}
	if len(source) > 1000 || len(attrs["device"]) > 4000 {
		return Sample{}, errors.New("invalid source")
	}
	_, startOffset := start.Zone()
	_, endOffset := end.Zone()
	return Sample{MetricType: spec.metric, Source: source, Device: normalizeDevice(attrs["device"]), Unit: spec.unit,
		Value: value, OriginalValue: attrs["value"], OriginalUnit: attrs["unit"], StartOffsetMinutes: startOffset / 60, EndOffsetMinutes: endOffset / 60,
		Start: start, End: end, Date: start.Format("2006-01-02")}, nil
}

func parseDate(value string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02 15:04:05 -0700", time.RFC3339Nano} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, errors.New("timestamp must include a timezone")
}
