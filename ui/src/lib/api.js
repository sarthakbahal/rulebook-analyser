const API_BASE = '/api'

/**
 * POST /api/query
 * @param {string} question
 * @returns {Promise<Object>} StateOutput JSON
 */
export async function queryEngine(question) {
  const res = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Query failed (${res.status}): ${detail}`)
  }
  return res.json()
}

/**
 * GET /api/eval
 * Runs the 43-question benchmark — can take several minutes.
 * @returns {Promise<{metrics: Object, results: Array}>}
 */
export async function runEval() {
  const res = await fetch(`${API_BASE}/eval`, {
    // Long timeout for eval — do NOT abort early
    signal: AbortSignal.timeout(600_000), // 10 min
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Eval failed (${res.status}): ${detail}`)
  }
  return res.json()
}

/**
 * GET /api/docs/{source}
 * @param {string} source  e.g. "academic_handbook.pdf"
 * @returns {Promise<{source: string, text: string}>}
 */
export async function getDocument(source) {
  const res = await fetch(`${API_BASE}/docs/${encodeURIComponent(source)}`)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Doc fetch failed (${res.status}): ${detail}`)
  }
  return res.json()
}

/**
 * GET /api/test-set
 * @returns {Promise<Object>} test_set.json content
 */
export async function getTestSet() {
  const res = await fetch(`${API_BASE}/test-set`)
  if (!res.ok) throw new Error(`Test-set fetch failed: ${res.statusText}`)
  return res.json()
}

/**
 * GET /api/health
 * @returns {Promise<{status: string, engine_ready: boolean}>}
 */
export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}
