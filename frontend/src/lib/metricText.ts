export function parseMetricText(text: string) {
  const patterns = [
    { type: 'blood-pressure', label: /(?:血压|\bbp\b)/i, value: /(?:血压|\bbp\b)\s*[:：为是]?\s*(\d{2,3})\s*[/／]\s*(\d{2,3})/i },
    { type: 'weight', label: /(?:体重|\bweight\b)/i, value: /(?:体重|\bweight\b)\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i },
    { type: 'blood-sugar', label: /(?:血糖|葡萄糖|\bglucose\b|\bglu\b)/i, value: /(?:血糖|葡萄糖|\bglucose\b|\bglu\b)\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i },
    { type: 'heart-rate', label: /(?:心率|脉搏|\bheart(?: rate)?\b)/i, value: /(?:心率|脉搏|\bheart(?: rate)?\b)\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i },
    { type: 'temperature', label: /(?:体温|\btemperature\b)/i, value: /(?:体温|\btemperature\b)\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i },
    { type: 'bmi', label: /\bbmi\b/i, value: /\bbmi\b\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i },
  ]
  const candidates = patterns.filter((pattern) => pattern.label.test(text))
  if (candidates.length > 1) throw new Error('这句话包含多项指标，请每次预填一项，避免漏记。')
  const pattern = candidates[0]
  const matches = pattern ? [...text.matchAll(new RegExp(pattern.value.source, 'gi'))] : []
  if (matches.length !== 1) throw new Error('请在指标名称后写一个数值，例如“今天8点体重72.4”。血压请同时填写两个值。')
  if (/(?:(?<!公)斤|磅|\blbs?\b|mg\s*\/\s*d[lL]|°F|华氏)/i.test(text)) {
    throw new Error('请先换算为表单标注的单位，再确认数值。')
  }
  return { type: pattern.type, primary: matches[0][1], secondary: matches[0][2] ?? '' }
}
