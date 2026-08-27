const SAMPLE_DRAFT = {
  title: 'AI 친화적 행정문서 작성 시범실시 교육 계획(안)',
  reportMeta: '',
  summary: 'AI 시대 범정부 AI 친화적 공문서 작성 가이드라인을 행정문서 작성에 적용하기 위해 소속기관 직원을 대상으로 시범실시 교육을 추진함. 교육은 온나라 PC영상회의 방식으로 운영하고, 문서혁신 사례와 작성 방법, 지원도구를 안내함.',
  sections: [
    {
      heading: '□ 추진 배경',
      blocks: [
        { type: 'bullet', text: 'AI 시대 범정부 AI 친화적 공문서 작성 가이드라인을 행정문서 작성에 적용하기 위한 교육을 실시함' }
      ]
    },
    {
      heading: '□ 교육 개요',
      blocks: [
        { type: 'bullet', text: '일시: 2026. 3. 16.(월) 14:00~15:10' },
        { type: 'bullet', text: '방법: 온나라 PC영상회의' },
        { type: 'bullet', text: '대상: 행안부 소속기관 직원(부서별 2명 이상)' },
        { type: 'note', text: '부서별 총괄팀장과 서무는 참석하여 부서 내 내용을 안내하도록 함' },
        { type: 'bullet', text: '내용: AI 친화적 행정문서 작성 시범실시 안내' },
        {
          type: 'table',
          caption: 'AI 친화적 행정문서 작성 시범실시 교육 세부계획',
          headers: ['시간계획', '소요시간', '주요내용', '비고'],
          rows: [
            ['14:00~14:30', '30분', 'AI 친화적 문서혁신 방법 및 성과', '사례 발표'],
            ['14:30~14:55', '25분', '시범실시 계획 및 AI 친화적 행정문서 작성 방법 설명', '담당부서'],
            ['14:55~15:00', '5분', '지능형플랫폼 지원도구 소개', '담당부서'],
            ['15:00~15:10', '10분', '질의응답(Q&A)', '담당부서']
          ]
        }
      ]
    }
  ],
  missingInfo: []
};

function resetAll() {
  state.docType = 'report';
  state.files = [];
  state.draft = null;
  state.rules = new Set(['factsOnly', 'noGuess', 'summary', 'simpleTable']);

  els.titleInput.value = '';
  els.orgInput.value = '';
  els.metaInput.value = '';
  els.factsInput.value = '';
  els.instructionInput.value = '';
  renderFileList();
  updateCharCount();

  $$('.doc-type').forEach((x) => x.classList.toggle('active', x.dataset.type === 'report'));
  $$('.rule-chip').forEach((x) => x.classList.toggle('active', state.rules.has(x.dataset.rule)));

  els.paper.innerHTML = '';
  els.paper.hidden = true;
  els.emptyState.hidden = false;
  els.downloadBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.jsonBtn.disabled = true;
  showToast('새 문서 입력 상태로 초기화했습니다.');
}

async function copyDraftText() {
  if (!state.draft) return;
  try {
    await navigator.clipboard.writeText(draftToPlainText(state.draft));
    showToast('문서 텍스트를 복사했습니다.');
  } catch (_) {
    fallbackCopy(draftToPlainText(state.draft));
    showToast('문서 텍스트를 복사했습니다.');
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function downloadJson() {
  if (!state.draft) return;
  downloadBlob(new Blob([JSON.stringify(state.draft, null, 2)], { type: 'application/json;charset=utf-8' }), `${safeFileName(state.draft.title)}.json`);
}

async function downloadHwpx() {
  if (!state.draft) return;
  try {
    requireJsZip();
    els.downloadBtn.disabled = true;
    els.downloadBtn.textContent = 'HWPX 만드는 중…';
    const blob = await buildHwpxBlob(state.draft);
    downloadBlob(blob, `${safeFileName(state.draft.title)}.hwpx`);
    showToast('HWPX 초안을 만들었습니다. 한글에서 열어 최종 검토하세요.');
  } catch (error) {
    console.error(error);
    showToast(`HWPX 생성 실패: ${error.message}`, true);
  } finally {
    els.downloadBtn.disabled = false;
    els.downloadBtn.textContent = 'HWPX 다운로드';
  }
}

async function buildHwpxBlob(draft) {
  const templateBytes = base64ToUint8Array(HWPX_TEMPLATE_BASE64);
  const templateZip = await JSZip.loadAsync(templateBytes);
  const sectionFile = templateZip.file('Contents/section0.xml');
  if (!sectionFile) throw new Error('템플릿의 Contents/section0.xml을 찾지 못했습니다.');
  const sectionXml = await sectionFile.async('string');
  const headIndex = sectionXml.indexOf('<hp:p');
  if (headIndex < 0) throw new Error('템플릿 본문 구조를 인식하지 못했습니다.');
  const head = sectionXml.slice(0, headIndex);
  const secMatch = sectionXml.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/);
  let secPr = secMatch ? secMatch[0] : '';
  secPr = secPr.replace(/<hp:margin\s+header="[^"]+"\s+footer="[^"]+"\s+gutter="[^"]+"\s+left="[^"]+"\s+right="[^"]+"\s+top="[^"]+"\s+bottom="[^"]+"\s*\/>/,
    '<hp:margin header="2834" footer="2834" gutter="0" left="5669" right="5669" top="4251" bottom="4252"/>');

  const blocks = [];
  let pid = 1000;
  blocks.push(makeTitleParagraph(secPr, draft.title, pid++));
  if (draft.reportMeta) blocks.push(makeParagraph('meta', draft.reportMeta, pid++));
  if (draft.summary) {
    blocks.push(makeParagraph('heading', '요약', pid++));
    blocks.push(makeParagraph('summary', draft.summary, pid++));
  }

  for (const section of draft.sections || []) {
    blocks.push(makeParagraph('heading', section.heading, pid++));
    for (const block of section.blocks || []) {
      if (block.type === 'table') {
        if (block.caption) blocks.push(makeParagraph('caption', `< ${stripAngleCaption(block.caption)} >`, pid++));
        blocks.push(makeTableWrapper(block, pid++));
      } else {
        blocks.push(makeParagraph(block.type, block.text || '', pid++));
      }
    }
  }

  const newSection = head + blocks.join('') + '</hs:sec>';
  const outputZip = new JSZip();
  const mimetype = await templateZip.file('mimetype').async('string');
  outputZip.file('mimetype', mimetype, { compression: 'STORE' });

  const names = Object.keys(templateZip.files).filter((name) => name !== 'mimetype' && !name.endsWith('/'));
  for (const name of names) {
    if (name === 'Contents/section0.xml') {
      outputZip.file(name, newSection);
    } else if (name === 'Preview/PrvText.txt') {
      outputZip.file(name, draftToPlainText(draft));
    } else if (name === 'Preview/PrvImage.png') {
      continue;
    } else {
      const data = await templateZip.file(name).async('uint8array');
      outputZip.file(name, data);
    }
  }

  return outputZip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/haansofthwpx' });
}

