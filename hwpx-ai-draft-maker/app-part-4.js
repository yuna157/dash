const HWPX_STYLE = {
  title: { para: '22', char: '18' },
  meta: { para: '26', char: '10' },
  heading: { para: '23', char: '7' },
  summary: { para: '25', char: '9' },
  body: { para: '25', char: '9' },
  bullet: { para: '25', char: '9', marker: '○ ' },
  dash: { para: '32', char: '9', marker: '- ' },
  dot: { para: '32', char: '9', marker: '· ' },
  note: { para: '25', char: '25', marker: '※ ' },
  caption: { para: '35', char: '20' },
};

function makeTitleParagraph(secPr, text, pid) {
  const safe = escapeXml(text);
  return `<hp:p id="${pid}" paraPrIDRef="${HWPX_STYLE.title.para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${HWPX_STYLE.title.char}">${secPr}</hp:run>` +
    `<hp:run charPrIDRef="${HWPX_STYLE.title.char}"><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl><hp:t>${safe}</hp:t></hp:run>` +
    `</hp:p>`;
}

function makeParagraph(kind, text, pid) {
  const style = HWPX_STYLE[kind] || HWPX_STYLE.body;
  const marker = style.marker || '';
  const body = marker + stripLeadingMarker(String(text || ''), kind);
  return `<hp:p id="${pid}" paraPrIDRef="${style.para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${style.char}"><hp:t>${escapeXml(body)}</hp:t></hp:run>` +
    `</hp:p>`;
}

function makeTableWrapper(table, pid) {
  const headers = (table.headers || []).map(String);
  let rows = (table.rows || []).map((r) => Array.isArray(r) ? r.map(String) : []);
  let colCnt = headers.length || Math.max(0, ...rows.map((r) => r.length));
  if (!colCnt) return makeParagraph('body', '[표 내용 없음]', pid);
  colCnt = Math.min(colCnt, 6);
  const normalizedHeaders = Array.from({ length: colCnt }, (_, i) => headers[i] || `항목 ${i + 1}`);
  rows = rows.map((row) => Array.from({ length: colCnt }, (_, i) => row[i] || ''));

  const widths = computeColumnWidths(normalizedHeaders, rows);
  const rowHeights = [3600, ...rows.map((row) => estimateTableRowHeight(row, widths))];
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
  const tableId = 2100000000 + (pid % 7000000);

  const headerRow = `<hp:tr>${normalizedHeaders.map((cell, ci) => makeTableCell(cell, ci, 0, widths[ci], rowHeights[0], true)).join('')}</hp:tr>`;
  const bodyRows = rows.map((row, ri) => `<hp:tr>${row.map((cell, ci) => makeTableCell(cell, ci, ri + 1, widths[ci], rowHeights[ri + 1], false)).join('')}</hp:tr>`).join('');

  const tbl = `<hp:tbl id="${tableId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length + 1}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="4" noAdjust="1">` +
    `<hp:sz width="48188" widthRelTo="ABSOLUTE" height="${totalHeight}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:inMargin left="283" right="283" top="141" bottom="141"/>` +
    headerRow + bodyRows + `</hp:tbl>`;

  return `<hp:p id="${pid}" paraPrIDRef="29" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="21">${tbl}</hp:run></hp:p>`;
}

function makeTableCell(text, col, row, width, height, header) {
  const border = header ? '5' : '4';
  const para = header ? '26' : (String(text).length > 20 ? '33' : '27');
  const char = header ? '13' : (String(text).length > 20 ? '15' : '14');
  const lines = String(text || '').split(/\n+/).filter((x) => x.length) || [''];
  const paragraphs = lines.map((line, i) => `<hp:p id="${i ? 0 : 2147483648}" paraPrIDRef="${para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${char}"><hp:t>${escapeXml(line)}</hp:t></hp:run></hp:p>`).join('');
  return `<hp:tc name="" header="0" hasMargin="${String(text).length > 20 ? 1 : 0}" protect="0" editable="0" dirty="0" borderFillIDRef="${border}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraphs}</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
    `<hp:cellSz width="${width}" height="${height}"/>` +
    `<hp:cellMargin left="510" right="510" top="141" bottom="141"/>` +
    `</hp:tc>`;
}

function computeColumnWidths(headers, rows) {
  const n = headers.length;
  if (n === 4 && headers.some((h) => /시간/.test(h)) && headers.some((h) => /주요|내용/.test(h))) {
    return [7371, 5000, 25000, 10817];
  }
  const weights = headers.map((h, i) => {
    const maxLen = Math.max(String(h).length, ...rows.map((r) => String(r[i] || '').length));
    return Math.min(4.2, Math.max(1, Math.sqrt(maxLen + 2)));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((48188 * w) / sum));
  widths[widths.length - 1] += 48188 - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function estimateTableRowHeight(row, widths) {
  let lines = 1;
  row.forEach((cell, i) => {
    const approxChars = Math.max(5, Math.floor((widths[i] || 8000) / 650));
    lines = Math.max(lines, Math.ceil(String(cell || '').length / approxChars));
  });
  return Math.max(3600, Math.min(8500, 2400 + lines * 1200));
}

function draftToPlainText(draft) {
  if (!draft) return '';
  const lines = [draft.title];
  if (draft.reportMeta) lines.push(draft.reportMeta);
  if (draft.summary) lines.push('', '요약', draft.summary);
  for (const section of draft.sections || []) {
    lines.push('', section.heading);
    for (const block of section.blocks || []) {
      if (block.type === 'table') {
        if (block.caption) lines.push(`< ${stripAngleCaption(block.caption)} >`);
        if (block.headers?.length) lines.push(block.headers.join(' | '));
        for (const row of block.rows || []) lines.push(row.join(' | '));
      } else {
        const marker = HWPX_STYLE[block.type]?.marker || '';
        lines.push(marker + stripLeadingMarker(block.text || '', block.type));
      }
    }
  }
  if (draft.missingInfo?.length) {
    lines.push('', '[추가 확인 필요]');
    draft.missingInfo.forEach((x) => lines.push(`- ${x}`));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function setByPath(object, path, value) {
  const parts = String(path).split('.');
  let target = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (target[key] == null) return;
    target = target[key];
  }
  const lastRaw = parts[parts.length - 1];
  const last = /^\d+$/.test(lastRaw) ? Number(lastRaw) : lastRaw;
  target[last] = value;
}

function stripLeadingMarker(text, type) {
  const s = String(text || '').trim();
  const patterns = {
    bullet: /^○\s*/,
    dash: /^-\s*/,
    dot: /^·\s*/,
    note: /^※\s*/,
  };
  return patterns[type] ? s.replace(patterns[type], '') : s;
}

function stripAngleCaption(text) {
  return String(text || '').trim().replace(/^<\s*/, '').replace(/\s*>$/, '').trim();
}

function extensionOf(name) {
  const match = String(name).toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : '';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeFileName(name) {
  return String(name || '행정문서_초안').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
