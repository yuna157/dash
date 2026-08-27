/*
 * 한글문서 초안 메이커
 * - Gemini Interactions API 기반 구조화 초안 생성
 * - HWPX/DOCX/PDF/TXT/MD 참고자료 로컬 텍스트 추출
 * - 행정안전부 AI 친화 행정문서 원칙 기반 미리보기/검증
 * - HWPX 템플릿 패키징(JSZip)
 *
 * 보안 주의: 순수 HTML/CSS/JS 프로토타입 특성상 API 키가 브라우저에서 사용됩니다.
 * 운영 서비스에서는 서버 프록시와 비밀키 저장소를 사용하세요.
 */

const HWPX_TEMPLATE_BASE64 = (window.HWPX_TEMPLATE_BASE64_PARTS || []).join('');
const MAX_REFERENCE_CHARS = 32000;

const state = {
  docType: 'report',
  rules: new Set(['factsOnly', 'noGuess', 'summary', 'simpleTable']),
  files: [],
  draft: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  Object.assign(els, {
    apiKey: $('#apiKey'),
    modelName: $('#modelName'),
    thinkingLevel: $('#thinkingLevel'),
    titleInput: $('#titleInput'),
    orgInput: $('#orgInput'),
    metaInput: $('#metaInput'),
    factsInput: $('#factsInput'),
    instructionInput: $('#instructionInput'),
    charCount: $('#charCount'),
    fileInput: $('#fileInput'),
    uploadZone: $('#uploadZone'),
    fileList: $('#fileList'),
    generateBtn: $('#generateBtn'),
    statusBox: $('#statusBox'),
    statusTitle: $('#statusTitle'),
    statusText: $('#statusText'),
    emptyState: $('#emptyState'),
    paper: $('#paper'),
    previewView: $('#previewView'),
    outlineView: $('#outlineView'),
    downloadBtn: $('#downloadBtn'),
    copyBtn: $('#copyBtn'),
    jsonBtn: $('#jsonBtn'),
    sampleBtn: $('#sampleBtn'),
    resetBtn: $('#resetBtn'),
    toggleKey: $('#toggleKey'),
    structureScore: $('#structureScore'),
    complianceScore: $('#complianceScore'),
    outlineList: $('#outlineList'),
    checkList: $('#checkList'),
    missingList: $('#missingList'),
    toast: $('#toast'),
  });

  bindEvents();
  updateCharCount();
});

function bindEvents() {
  els.factsInput.addEventListener('input', updateCharCount);

  $$('.doc-type').forEach((button) => {
    button.addEventListener('click', () => {
      state.docType = button.dataset.type;
      $$('.doc-type').forEach((x) => x.classList.toggle('active', x === button));
    });
  });

  $$('.rule-chip').forEach((button) => {
    button.addEventListener('click', () => {
      const rule = button.dataset.rule;
      if (state.rules.has(rule)) state.rules.delete(rule);
      else state.rules.add(rule);
      button.classList.toggle('active', state.rules.has(rule));
    });
  });

  $$('.toolbar-tab').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      $$('.toolbar-tab').forEach((x) => x.classList.toggle('active', x === button));
      els.previewView.hidden = view !== 'preview';
      els.outlineView.hidden = view !== 'outline';
    });
  });

  els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  ['dragenter', 'dragover'].forEach((eventName) => {
    els.uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      els.uploadZone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    els.uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      els.uploadZone.classList.remove('dragging');
    });
  });
  els.uploadZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

  els.generateBtn.addEventListener('click', generateDraft);
  els.sampleBtn.addEventListener('click', loadSampleDraft);
  els.resetBtn.addEventListener('click', resetAll);
  els.downloadBtn.addEventListener('click', downloadHwpx);
  els.copyBtn.addEventListener('click', copyDraftText);
  els.jsonBtn.addEventListener('click', downloadJson);

  els.toggleKey.addEventListener('click', () => {
    const show = els.apiKey.type === 'password';
    els.apiKey.type = show ? 'text' : 'password';
    els.toggleKey.textContent = show ? '숨김' : '보기';
  });

  els.paper.addEventListener('input', (e) => {
    const target = e.target.closest('[data-path]');
    if (!target || !state.draft) return;
    setByPath(state.draft, target.dataset.path, target.innerText.trim());
    renderQuality();
  });
}

function updateCharCount() {
  els.charCount.textContent = `${els.factsInput.value.length.toLocaleString()} / 12,000`;
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function setStatus(title, text) {
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
}

function setLoading(loading) {
  els.generateBtn.disabled = loading;
  els.statusBox.hidden = !loading;
  if (!loading) {
    setStatus('초안을 작성하고 있습니다', '핵심 사실을 문서 구조로 재배치하는 중…');
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!['hwpx', 'docx', 'pdf', 'txt', 'md'].includes(ext)) {
      showToast(`${file.name}: 지원하지 않는 형식입니다.`, true);
      continue;
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item = { id, file, name: file.name, ext, size: file.size, status: '읽는 중', text: '' };
    state.files.push(item);
    renderFileList();

    try {
      item.text = await extractTextFromFile(file, ext);
      item.status = item.text.trim() ? `${item.text.length.toLocaleString()}자 추출` : '텍스트 없음';
    } catch (error) {
      console.error(error);
      item.status = '읽기 실패';
      item.error = error.message;
    }
    renderFileList();
  }
  els.fileInput.value = '';
}

function renderFileList() {
  els.fileList.innerHTML = state.files.map((item) => `
    <div class="file-item" data-file-id="${escapeHtml(item.id)}">
      <div class="file-type">${escapeHtml(item.ext.toUpperCase())}</div>
      <div class="file-info">
        <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span>${formatBytes(item.size)} · ${escapeHtml(item.status)}</span>
      </div>
      <button class="file-remove" type="button" aria-label="삭제" data-remove-file="${escapeHtml(item.id)}">×</button>
    </div>`).join('');

  $$('[data-remove-file]').forEach((button) => {
    button.addEventListener('click', () => {
      state.files = state.files.filter((x) => x.id !== button.dataset.removeFile);
      renderFileList();
    });
  });
}

async function extractTextFromFile(file, ext) {
  if (ext === 'txt' || ext === 'md') return file.text();
  if (ext === 'hwpx') return extractHwpxText(await file.arrayBuffer());
  if (ext === 'docx') return extractDocxText(await file.arrayBuffer());
  if (ext === 'pdf') return extractPdfText(await file.arrayBuffer());
  return '';
}

async function extractHwpxText(arrayBuffer) {
  requireJsZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const preview = zip.file('Preview/PrvText.txt');
  if (preview) {
    const text = await preview.async('string');
    if (text.trim()) return text;
  }
  const sections = Object.keys(zip.files).filter((name) => /^Contents\/section\d+\.xml$/i.test(name)).sort();
  const chunks = [];
  for (const name of sections) {
    const xml = await zip.file(name).async('string');
    chunks.push(xmlToText(xml));
  }
  return chunks.join('\n');
}

async function extractDocxText(arrayBuffer) {
  requireJsZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('DOCX 본문을 찾지 못했습니다.');
  return xmlToText(await doc.async('string'));
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs-loader]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('PDF.js를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.dataset.pdfjsLoader = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('PDF.js를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    document.head.appendChild(script);
  });
  if (!window.pdfjsLib) throw new Error('PDF.js 초기화에 실패했습니다.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}

async function extractPdfText(arrayBuffer) {
  const pdfjs = await ensurePdfJs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  const limit = Math.min(pdf.numPages, 40);
  for (let i = 1; i <= limit; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n');
}

function xmlToText(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const nodes = Array.from(doc.querySelectorAll('t'));
  if (nodes.length) return nodes.map((n) => n.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
  return (doc.documentElement?.textContent || '').replace(/\s+/g, ' ').trim();
}

function requireJsZip() {
  if (!window.JSZip) throw new Error('내장 HWPX 압축 모듈을 초기화하지 못했습니다.');
}

async function generateDraft() {
  const apiKey = els.apiKey.value.trim();
  const title = els.titleInput.value.trim();
  const facts = els.factsInput.value.trim();

  if (!apiKey) return showToast('Gemini API Key를 입력해 주세요.', true);
  if (!title) return showToast('문서 제목을 입력해 주세요.', true);
  if (!facts) return showToast('핵심 사실을 입력해 주세요.', true);

  setLoading(true);
  try {
    setStatus('참고자료를 정리하고 있습니다', '첨부 문서에서 사실과 문서 표현을 추출하는 중…');
    const references = buildReferenceText();

    setStatus('문서 구조를 설계하고 있습니다', '문서 유형에 맞는 제목·요약·항목 위계를 구성하는 중…');
    const prompt = buildUserPrompt({ title, facts, references });

    setStatus('Gemini가 초안을 작성하고 있습니다', '사실관계 유지, 서술식 문장, 표 단순화 원칙을 적용하는 중…');
    const draft = await callGeminiInteractions(apiKey, prompt);
    state.draft = normalizeDraft(draft, title);

    renderDraft();
    renderQuality();
    els.emptyState.hidden = true;
    els.paper.hidden = false;
    els.downloadBtn.disabled = false;
    els.copyBtn.disabled = false;
    els.jsonBtn.disabled = false;

    showToast('AI 초안이 생성되었습니다. 미리보기에서 바로 수정할 수 있습니다.');
  } catch (error) {
    console.error(error);
    showToast(error.message || '초안 생성 중 오류가 발생했습니다.', true);
  } finally {
    setLoading(false);
  }
}

function buildReferenceText() {
  if (!state.files.length) return '첨부 참고자료 없음';
  let result = '';
  for (const item of state.files) {
    if (!item.text) continue;
    const remaining = MAX_REFERENCE_CHARS - result.length;
    if (remaining <= 0) break;
    const chunk = item.text.slice(0, Math.max(0, remaining));
    result += `\n\n===== 참고자료: ${item.name} =====\n${chunk}`;
  }
  return result || '첨부 참고자료에서 추출 가능한 텍스트가 없음';
}

function buildUserPrompt({ title, facts, references }) {
  const typeGuide = {
    report: '보고서·계획안형. 제목 → 보고 메타정보 → 요약 → 1. 추진 배경 → 2. 주요 내용 → 3. 향후 계획을 기본 골격으로 하되 내용에 따라 2~5개 절로 조정함.',
    education: '교육·행사 계획형. 제목 → □ 추진 배경 → □ 교육 개요 → ○ 일시/방법/대상/내용 → ※ 유의사항 → 필요한 경우 단순 일정표 순서로 구성함.',
    briefing: '업무보고·회의자료형. 제목 → 요약 → 1. 현황/배경 → 2. 핵심 쟁점 → 3. 조치 또는 추진사항 → 4. 요청·검토사항 중심으로 구성함.',
    press: '보도자료 초안형. 제목 → 핵심 요약 → 주요 내용 → 시민/정책 체감 효과 → 향후 일정 순으로 구성하되 과장·홍보성 추정 표현을 금지함.',
  }[state.docType];

  const activeRules = Array.from(state.rules).map((x) => ({
    factsOnly: '사용자와 참고자료에 명시된 사실을 우선하며 새로운 수치·고유명사·일정을 만들어내지 않음.',
    noGuess: '확실하지 않은 내용은 문서 본문에서 단정하지 말고 missingInfo에 검토사항으로 남김.',
    summary: '문서 앞부분에 전체 내용을 2~5문장으로 압축한 요약을 둠.',
    simpleTable: '표는 정보 관계가 분명할 때만 사용하며 셀 병합·표 안의 표·대각선·장식용 표를 사용하지 않음.',
    concise: '문서 분량을 1~2쪽 수준으로 간결하게 구성하고 중복 문장을 제거함.',
  }[x])).filter(Boolean).join('\n- ');

  return `
아래 정보만을 근거로 한국 공공기관 내부 행정문서 초안을 작성하라.

[문서 유형]
${typeGuide}

[문서 제목]
${title}

[기관·부서]
${els.orgInput.value.trim() || '미입력'}

[보고 방식/일자]
${els.metaInput.value.trim() || '미입력'}

[핵심 사실]
${facts}

[추가 작성 지시]
${els.instructionInput.value.trim() || '없음'}

[참고자료]
${references}

[반드시 지킬 작성 규칙]
1. 사람과 AI가 모두 맥락을 이해하도록 주어와 서술어가 드러나는 서술식 문장으로 작성함.
2. 본문 문장은 공공기관 보고서에서 자연스러운 '~함', '~임', '~할 예정임' 계열로 끝맺음. 다만 제목·표 제목·명사형 항목명은 예외임.
3. 특수기호는 실제 유니코드 문자 □, ○, -, ·, ※를 사용함.
4. 보고서형의 대항목은 '1. 추진 배경'처럼 번호 항목을 우선하고, 교육계획형은 '□ 추진 배경' 형식을 우선함.
5. 요약은 사용자 입력에서 확인되는 핵심 목적·대상·일정·추진방식을 압축하되 없는 수치를 만들지 않음.
6. 표가 필요하면 headers와 rows만으로 단순한 2차원 표를 작성함. 셀 병합을 전제하지 않음.
7. 이미지·조직도·차트를 제안하는 경우에도 내용을 텍스트로 설명할 수 있도록 작성함.
8. 민감한 개인정보나 입력에 없는 담당자 연락처를 만들어내지 않음.
9. 확인이 필요한 빈칸·불명확한 수치·근거가 있으면 missingInfo 배열에 구체적으로 적음.
10. 아래 JSON 스키마에 맞는 데이터만 반환함.
- ${activeRules || '기본 규칙 적용'}
`;
}

