import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMetricText } from '../src/lib/metricText.ts'

test('uses the value beside the metric instead of a time or date', () => {
  assert.deepEqual(parseMetricText('今天8点体重72.4公斤'), { type: 'weight', primary: '72.4', secondary: '' })
  assert.equal(parseMetricText('9月6日血糖5.2').primary, '5.2')
})
test('does not silently discard multiple readings or assume foreign units', () => {
  for (const text of ['血压125/82，体重72.4', '体重72，体重73', '体重140斤', '血糖90 mg/dL', '体重还没测，今天8点起床']) {
    assert.throws(() => parseMetricText(text))
  }
})
test('preserves both supplied blood pressure values', () => {
  assert.deepEqual(parseMetricText('血压：125／82'), { type: 'blood-pressure', primary: '125', secondary: '82' })
  assert.throws(() => parseMetricText('血压125'))
})
