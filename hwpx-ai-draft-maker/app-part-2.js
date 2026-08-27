const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    reportMeta: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['body', 'bullet', 'dash', 'dot', 'note', 'table'] },
                text: { type: 'string' },
                caption: { type: 'string' },
                headers: { type: 'array', items: { type: 'string' } },
                rows: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'string' } }
                }
              },
              required: ['type']
            }
          }
        },
        required: ['heading', 'blocks']
      }
    },
    missingInfo: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'reportMeta', 'summary', 'sections', 'missingInfo']
};

async function callGeminiInteractions(apiKey, prompt) {
  const model = els.modelName.value.trim() || 'gemini-flash-latest';
  const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = {
    model,
    input: prompt,
    store: false,
    system_instruction: buildSystemInstruction(),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: DRAFT_SCHEMA,
    },
    generation_config: {
      max_output_tokens: 8192,
      thinking_level: els.thinkingLevel.value || 'medium',
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new Error(`Gemini API에 연결하지 못했습니다. 브라우저 네트워크/CORS 또는 API 키 설정을 확인하세요. (${networkError.message})`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    if ([400, 404, 405].includes(response.status)) {
      return callGeminiGenerateContent(apiKey, prompt, model);
    }
    throw new Error(formatGeminiError(response.status, errorText));
  }

  const data = await response.json();
  const text = extractInteractionText(data);
  return parseJsonOutput(text);
}

async function callGeminiGenerateContent(apiKey, prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemInstruction() }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: DRAFT_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatGeminiError(response.status, errorText));
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return parseJsonOutput(text);
}

function buildSystemInstruction() {
  return `당신은 대한민국 공공기관 행정문서 편집자다. 사용자가 제공한 사실과 참고자료를 기반으로 AI 친화적인 행정문서 초안을 구조화한다. 사실을 보강한다는 이유로 입력에 없는 수치, 날짜, 법령, 인명, 연락처, 성과를 만들어내지 않는다. 문서는 사람이 바로 검토·수정할 수 있는 수준으로 명확하게 쓰며, 서술식 문장과 유니코드 항목기호를 사용한다. 결과는 요청된 JSON 스키마만 반환한다.`;
}

function extractInteractionText(data) {
  const chunks = [];
  for (const step of data?.steps || []) {
    if (step.type !== 'model_output') continue;
    for (const part of step.content || []) {
      if (part.type === 'text' && part.text) chunks.push(part.text);
    }
  }
  if (!chunks.length && typeof data?.output_text === 'string') chunks.push(data.output_text);
  if (!chunks.length) throw new Error('Gemini 응답에서 문서 본문을 찾지 못했습니다.');
  return chunks.join('\n');
}

function parseJsonOutput(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
    }
    throw new Error('Gemini가 반환한 JSON을 해석하지 못했습니다. 다시 생성해 주세요.');
  }
}

function formatGeminiError(status, errorText) {
  let detail = errorText;
  try {
    const parsed = JSON.parse(errorText);
    detail = parsed?.error?.message || parsed?.message || errorText;
  } catch (_) {}
  if (status === 400) return `Gemini 요청 형식 또는 모델 이름을 확인하세요. ${detail}`;
  if (status === 401 || status === 403) return `Gemini API Key 권한을 확인하세요. ${detail}`;
  if (status === 429) return `Gemini API 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요. ${detail}`;
  return `Gemini API 오류 (${status}): ${detail}`;
}

function normalizeDraft(input, fallbackTitle = '') {
  const draft = input && typeof input === 'object' ? structuredClone(input) : {};
  draft.title = String(draft.title || fallbackTitle || '행정문서 초안').trim();
  draft.reportMeta = String(draft.reportMeta || [els.metaInput?.value, els.orgInput?.value].filter(Boolean).join(' / ') || '').trim();
  draft.summary = String(draft.summary || '').trim();
  draft.sections = Array.isArray(draft.sections) ? draft.sections : [];
  draft.sections = draft.sections.map((section, si) => ({
    heading: String(section?.heading || `${si + 1}. 주요 내용`).trim(),
    blocks: Array.isArray(section?.blocks) ? section.blocks.map((block) => normalizeBlock(block)) : [],
  }));
  draft.missingInfo = Array.isArray(draft.missingInfo) ? draft.missingInfo.map(String).filter(Boolean) : [];
  return draft;
}

function normalizeBlock(block = {}) {
  const allowed = new Set(['body', 'bullet', 'dash', 'dot', 'note', 'table']);
  const type = allowed.has(block.type) ? block.type : 'body';
  if (type === 'table') {
    const headers = Array.isArray(block.headers) ? block.headers.map((x) => String(x ?? '').trim()) : [];
    const rows = Array.isArray(block.rows) ? block.rows.map((row) => Array.isArray(row) ? row.map((x) => String(x ?? '').trim()) : []) : [];
    return {
      type,
      caption: String(block.caption || '').trim(),
      headers,
      rows,
    };
  }
  return { type, text: String(block.text || '').trim() };
}

function renderDraft() {
  if (!state.draft) return;
  const d = state.draft;
  const parts = [];
  parts.push(`<h1 class="doc-title" contenteditable="true" spellcheck="false" data-path="title">${escapeHtml(d.title)}</h1>`);
  if (d.reportMeta) {
    parts.push(`<p class="doc-meta" contenteditable="true" spellcheck="false" data-path="reportMeta">${escapeHtml(d.reportMeta)}</p>`);
  }
  if (d.summary) {
    parts.push(`<h2 class="doc-summary-title">요약</h2>`);
    parts.push(`<p class="doc-summary" contenteditable="true" spellcheck="false" data-path="summary">${escapeHtml(d.summary)}</p>`);
  }

  d.sections.forEach((section, si) => {
    parts.push(`<h2 class="doc-section-title" contenteditable="true" spellcheck="false" data-path="sections.${si}.heading">${escapeHtml(section.heading)}</h2>`);
    section.blocks.forEach((block, bi) => {
      const path = `sections.${si}.blocks.${bi}`;
      if (block.type === 'table') {
        parts.push(renderHtmlTable(block, path));
      } else {
        parts.push(renderTextBlock(block, `${path}.text`));
      }
    });
  });

  parts.push('<div class="doc-page-num">- 1 -</div>');
  els.paper.innerHTML = parts.join('');
}

function renderTextBlock(block, path) {
  const marker = { bullet: '○ ', dash: '- ', dot: '· ', note: '※ ', body: '' }[block.type] ?? '';
  const text = stripLeadingMarker(block.text, block.type);
  return `<p class="doc-block ${escapeHtml(block.type)}"><span>${escapeHtml(marker)}</span><span contenteditable="true" spellcheck="false" data-path="${escapeHtml(path)}">${escapeHtml(text)}</span></p>`;
}

function renderHtmlTable(block, path) {
  const headers = block.headers || [];
  const rows = block.rows || [];
  const caption = block.caption ? `<div class="table-caption" contenteditable="true" spellcheck="false" data-path="${path}.caption">&lt; ${escapeHtml(stripAngleCaption(block.caption))} &gt;</div>` : '';
  const head = headers.length ? `<thead><tr>${headers.map((h, ci) => `<th contenteditable="true" spellcheck="false" data-path="${path}.headers.${ci}">${escapeHtml(h)}</th>`).join('')}</tr></thead>` : '';
  const body = `<tbody>${rows.map((row, ri) => `<tr>${row.map((cell, ci) => {
    const long = String(cell).length > 20 ? 'long' : '';
    return `<td class="${long}" contenteditable="true" spellcheck="false" data-path="${path}.rows.${ri}.${ci}">${escapeHtml(cell)}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`;
  return `${caption}<table class="doc-table">${head}${body}</table>`;
}

function renderQuality() {
  if (!state.draft) return;
  const d = state.draft;
  els.outlineList.innerHTML = d.sections.map((section, i) => `
    <div class="outline-item"><span class="outline-num">${i + 1}</span><span>${escapeHtml(section.heading)} · ${section.blocks.length}개 블록</span></div>`).join('') || '<div class="outline-item">본문 항목 없음</div>';

  const checks = runComplianceChecks(d);
  const okCount = checks.filter((x) => x.ok).length;
  els.structureScore.textContent = `${d.sections.length}개 항목`;
  els.complianceScore.textContent = `${Math.round((okCount / checks.length) * 100)}점`;
  els.checkList.innerHTML = checks.map((check) => `
    <div class="check-item ${check.ok ? 'ok' : 'warn'}">
      <span class="check-dot">${check.ok ? '✓' : '!'}</span>
      <span>${escapeHtml(check.label)}</span>
    </div>`).join('');

  if (d.missingInfo?.length) {
    els.missingList.innerHTML = d.missingInfo.map((x) => `<div class="missing-item">${escapeHtml(x)}</div>`).join('');
  } else {
    els.missingList.innerHTML = '<div class="missing-empty">생성 결과에 별도로 표시된 확인 필요 사항이 없습니다. 최종 제출 전 사실관계는 담당자가 다시 검토하세요.</div>';
  }
}

function runComplianceChecks(d) {
  const allText = draftToPlainText(d);
  const tables = d.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'table'));
  const sentenceLike = d.sections.flatMap((s) => s.blocks).filter((b) => b.type !== 'table' && b.text);
  const endings = sentenceLike.filter((b) => /(?:함|임|예정임|필요함|있음|없음|바람|됨|됨\.|함\.|임\.)$/.test((b.text || '').trim())).length;
  const endingRate = sentenceLike.length ? endings / sentenceLike.length : 1;
  const badTable = tables.some((t) => !Array.isArray(t.headers) || (t.rows || []).some((row) => row.length !== t.headers.length));
  return [
    { ok: Boolean(d.summary?.trim()), label: '문서 앞부분에 전체 내용을 파악할 수 있는 요약이 있음' },
    { ok: endingRate >= 0.55, label: '본문이 주로 서술식 ~함/~임 계열 문장으로 작성됨' },
    { ok: /[□○\-·※]/.test(allText) || /^\d+\./m.test(allText), label: '번호항목 또는 실제 유니코드 특수기호를 사용함' },
    { ok: !badTable, label: '표가 있는 경우 열 수가 일치하는 단순 2차원 구조임' },
    { ok: !/[■◆▶▣]/.test(allText), label: '장식성 글머리표 대신 표준 항목기호를 사용함' },
    { ok: !/\b(?:010[- ]?\d{4}[- ]?\d{4}|\d{6}-?[1-4]\d{6})\b/.test(allText), label: '주민번호·휴대전화 형식의 개인정보가 초안에서 감지되지 않음' },
  ];
}

function loadSampleDraft() {
  state.docType = 'education';
  $$('.doc-type').forEach((x) => x.classList.toggle('active', x.dataset.type === 'education'));
  els.titleInput.value = 'AI 친화적 행정문서 작성 시범실시 교육 계획(안)';
  els.orgInput.value = '행정안전부';
  els.metaInput.value = '2026. 3. 16.(월) 14:00~15:10';
  els.factsInput.value = 'AI 시대 범정부 AI 친화적 공문서 작성 가이드라인을 행정문서에 적용하기 위한 교육을 실시함. 방법은 온나라 PC영상회의이며, 대상은 소속기관 직원으로 부서별 2명 이상임. 교육에서는 AI 친화적 문서혁신 사례, 시범실시 계획과 작성 방법, 지원도구 소개, 질의응답을 진행함.';
  updateCharCount();
  state.draft = normalizeDraft(SAMPLE_DRAFT, els.titleInput.value);
  renderDraft();
  renderQuality();
  els.emptyState.hidden = true;
  els.paper.hidden = false;
  els.downloadBtn.disabled = false;
  els.copyBtn.disabled = false;
  els.jsonBtn.disabled = false;
  showToast('첨부 예시 문서 구조를 반영한 샘플을 불러왔습니다.');
}

