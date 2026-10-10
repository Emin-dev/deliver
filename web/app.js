import { detectContainer, formatBytes, readPolicy, presets } from './domain.js';
const $ = id => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const maxBytes = 64 * 1024 * 1024;
let engine, generation = 0, activeController = null, previewUrl = null, report = null, observation = null, origin = null, metadataWarning = null;
const downloadUrls = new Set();
let digestQueue = Promise.resolve();
const manualItems = [
  ['picture', 'Picture, framing, and opening / closing frames'],
  ['sound', 'Audio playback and intelligibility'],
  ['captions', 'Required captions and on-screen wording'],
  ['client', 'Customer brief, exceptions, and final sign-off'],
];
function announce(text) { $('live-status').textContent = text; }
function setProgress(text) { $('progress-text').textContent = text; announce(text); }
function message(text, type = 'session-note') { $(type).textContent = text; $(type).hidden = !text; }
function field(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function runEngine(request) {
  if (!engine) throw new Error('The local Rust engine is not ready. Reload and try again.');
  const input = encoder.encode(JSON.stringify(request));
  const ptr = engine.allocate(input.length);
  if (!ptr) throw new Error('The request exceeds the local engine limit.');
  let packed;
  try { new Uint8Array(engine.memory.buffer, ptr, input.length).set(input); packed = engine.evaluate(ptr, input.length); }
  finally { engine.release(ptr, input.length); }
  const outPtr = Number(packed & 0xffffffffn), length = Number(packed >> 32n);
  let response;
  try { response = JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, outPtr, length))); }
  finally { engine.release(outPtr, length); }
  if (!response.ok) throw new Error(response.error);
  return response.report;
}
function policy() { return readPolicy(Object.fromEntries(['preset','policy-name','policy-version','width','height','min-duration','max-duration','max-size','container'].map(id => [id, $(id).value]))); }
function resetManual() { for (const [id] of manualItems) $(`manual-${id}`).value = 'unknown'; $('review-note').value = ''; updateManualSummary(); }
function humanSummary() { const statuses = manualItems.map(([id]) => $(`manual-${id}`).value); return {pass:statuses.filter(s => s === 'pass').length,fail:statuses.filter(s => s === 'fail').length,unknown:statuses.filter(s => s === 'unknown').length,not_applicable:statuses.filter(s => s === 'not_applicable').length}; }
function updateManualSummary() { const summary = humanSummary(); $('manual-summary').textContent = `${summary.pass} passed · ${summary.fail} need work · ${summary.unknown} not reviewed · ${summary.not_applicable} not applicable`; }
function hideResults() { report = null; $('results').hidden = true; $('manual-section').hidden = true; $('export').disabled = true; $('step2').classList.remove('active'); $('step3').classList.remove('active'); document.querySelector('.export-note').textContent = 'Review a file to create your report'; }
function releasePreview() { $('preview').pause(); $('preview').removeAttribute('src'); $('preview').load(); if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } }
function stopCurrent() { generation++; activeController?.abort(); activeController = null; releasePreview(); $('inspect-progress').hidden = true; }
function resetFile() { stopCurrent(); observation = null; origin = null; metadataWarning = null; hideResults(); resetManual(); $('selected-panel').hidden = true; $('drop-zone').hidden = false; $('file-input').value = ''; message('', 'error'); message(''); }
function clearFile(text = 'File removed. Choose another video.') { resetFile(); message(text); announce(text); $('file-input').focus(); }
function showReport() {
  if (!observation) return;
  report = runEngine({ policy: policy(), asset: observation });
  $('results').hidden = false; $('manual-section').hidden = false; $('export').disabled = false;
  $('step2').classList.add('active'); $('step3').classList.add('active');
  $('pass-count').textContent = report.pass; $('fail-count').textContent = report.fail; $('unknown-count').textContent = report.unknown;
  $('result-banner').classList.toggle('has-fail', report.fail > 0);
  $('result-icon').dataset.state = report.fail ? 'fail' : 'review';
  $('outcome').textContent = report.fail ? 'A few details need attention.' : report.unknown > 5 ? 'Limited inspection. More checks needed.' : 'Supported checks pass. Review still needed.';
  $('outcome-detail').textContent = report.fail ? `${report.fail} requirement${report.fail === 1 ? '' : 's'} not met. ${report.unknown} technical checks remain unknown.` : `${report.pass} supported checks pass. ${report.unknown} technical checks remain unknown.`;
  $('hash').textContent = report.asset.sha256 || 'Not available';
  const rows = report.checks.filter(c => c.id !== 'sha256').map(c => {
    const row = field('div', 'check-row'); const details = field('div');
    details.append(field('p', 'check-title', c.title), field('p', 'check-observed', c.observed), field('p', 'check-expected', `Expected: ${c.expected}`));
    row.append(details, field('span', `status-tag status-${c.status}`, {pass:'PASS',fail:'NEEDS WORK',unknown:'UNKNOWN'}[c.status]));
    return row;
  });
  $('checks').replaceChildren(...rows);
  document.querySelector('.export-note').textContent = 'JSON · includes unknowns and self-reported QC';
  announce(`Review complete. ${report.pass} pass, ${report.fail} need work, ${report.unknown} unknown. Human review is still required.`);
}
function fillPolicy(key) {
  const isCustom = key === 'custom'; $('custom-identity').hidden = !isCustom;
  const ids = ['width','height','min-duration','max-duration','max-size','container'];
  ids.forEach(id => $(id).disabled = !isCustom);
  if (!isCustom) { const p = presets[key]; for (const id of ids) $(id).value = p[id]; $('preset-description').textContent = p.description; }
  else $('preset-description').textContent = 'Set your own limits. Increase the version when your requirements change. The full values are embedded in every export.';
}
function policyChanged() {
  message('', 'error');
  try { policy(); if (observation) { resetManual(); showReport(); message('Requirements changed. Human QC was reset for this policy.'); } }
  catch (e) { hideResults(); resetManual(); message(e.message, 'error'); }
}
function readBytes(blob, signal) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort',abort);
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(new Error('The selected file could not be read.')); };
    reader.onabort = () => { cleanup(); reject(new DOMException('Inspection canceled','AbortError')); };
    if (signal.aborted) { reject(new DOMException('Inspection canceled','AbortError')); return; }
    signal.addEventListener('abort',abort,{once:true}); reader.readAsArrayBuffer(blob);
  });
}
function queuedDigest(file, signal) {
  const task = digestQueue.catch(() => {}).then(async () => {
    if (signal.aborted) throw new DOMException('Inspection canceled','AbortError');
    const bytes = await readBytes(file,signal);
    if (signal.aborted) throw new DOMException('Inspection canceled','AbortError');
    return crypto.subtle.digest('SHA-256',bytes);
  });
  digestQueue = task.then(() => {}, () => {});
  return task;
}
function probeMetadata(file, signal) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'); video.preload = 'metadata'; video.muted = true;
    const url = URL.createObjectURL(file); let settled = false;
    const finish = (value, error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      video.onloadedmetadata = null; video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null, new DOMException('Inspection canceled', 'AbortError'));
    const timer = setTimeout(() => finish(null, new Error('Metadata reading timed out after 15 seconds.')), 15000);
    video.onloadedmetadata = () => finish({ width: video.videoWidth || null, height: video.videoHeight || null, duration_seconds: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null });
    video.onerror = () => finish(null, new Error('This browser could not decode the video metadata.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    video.src = url;
  });
}
async function inspect(file, fileOrigin = 'user_selected') {
  if (!engine) { message('The local engine is still loading. Please try again in a moment.', 'error'); return; }
  resetFile();
  const job = generation;
  const controller = new AbortController(); activeController = controller;
  const current = () => job === generation && !controller.signal.aborted;
  try {
    policy();
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a non-empty video file.');
    if (file.size > maxBytes) throw new Error('This demo accepts one file up to 64 MiB. Choose a smaller review copy.');
    if (encoder.encode(file.name).length > 1024) throw new Error('The filename is too long. Use a filename under 1024 UTF-8 bytes.');
    $('drop-zone').hidden = true; $('selected-panel').hidden = false; $('inspect-progress').hidden = false;
    $('filename').textContent = file.name; $('file-summary').textContent = `${formatBytes(file.size)} · ${fileOrigin === 'generated_sample' ? 'Generated test clip' : 'Selected on this device'}`;
    $('preview').hidden = true; $('preview-note').hidden = true; setProgress(`Inspecting ${file.name}. Reading the local container and video metadata. This can take up to 15 seconds.`);
    const header = new Uint8Array(await readBytes(file.slice(0,65536),controller.signal)); if (!current()) return;
    const container = detectContainer(header);
    if (container === 'unknown') throw new Error('This file does not have a supported MP4 or WebM header. Its name and MIME type are not trusted.');
    let metadata = { width:null, height:null, duration_seconds:null };
    metadataWarning = null;
    try { metadata = await probeMetadata(file, controller.signal); }
    catch (e) { if (!current() || e.name === 'AbortError') return; metadataWarning = `${e.message} Dimensions and duration remain unknown; file-size, header, and byte fingerprint checks are still available.`; }
    if (!current()) return;
    setProgress('Metadata inspection finished. Fingerprinting the selected bytes with SHA-256.');
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context. Open this demo over HTTPS or localhost.');
    const digest = await queuedDigest(file,controller.signal); if (!current()) return;
    const sha256 = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
    observation = { filename:file.name, bytes:file.size, container, ...metadata, sha256 };
    origin = fileOrigin;
    showReport();
    previewUrl = URL.createObjectURL(file); $('preview').src = previewUrl; $('preview').hidden = !!metadataWarning;
    $('preview-note').hidden = !!metadataWarning;
    $('file-summary').textContent = `${formatBytes(file.size)} · ${metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : 'Dimensions unknown'} · ${metadata.duration_seconds ? `${metadata.duration_seconds.toFixed(2)} s` : 'Duration unknown'}${fileOrigin === 'generated_sample' ? ' · Generated test clip' : ''}`;
    if (metadataWarning) { message(metadataWarning); announce(`Limited inspection complete. ${metadataWarning} ${report.pass} checks pass, ${report.fail} need work, and ${report.unknown} remain unknown.`); } else if (fileOrigin === 'generated_sample') message('Sample: a generated, silent 6-second test clip. No customer media or claimed real-world delivery is included.');
  } catch (e) { if (current()) { observation = null; hideResults(); message(e.message || 'The file could not be inspected.', 'error'); $('selected-panel').hidden = true; $('drop-zone').hidden = false; releasePreview(); announce('Inspection could not finish. ' + e.message); $('file-input').focus(); } }
  finally { if (current()) { $('inspect-progress').hidden = true; activeController = null; } }
}
for (const [id, title] of manualItems) {
  const row = field('div', 'manual-row'); const label = field('label', '', title); label.htmlFor = `manual-${id}`;
  const select = field('select'); select.id = `manual-${id}`;
  for (const [value,text] of [['unknown','Not reviewed'],['pass','Pass'],['fail','Needs work'],['not_applicable','Not applicable']]) { const option = field('option','',text); option.value = value; select.append(option); }
  select.addEventListener('change',updateManualSummary);
  row.append(label,select); $('manual-checks').append(row);
}
$('preset').addEventListener('change', () => { fillPolicy($('preset').value); policyChanged(); });
for (const id of ['policy-name','policy-version','width','height','min-duration','max-duration','max-size','container']) $(id).addEventListener('input', policyChanged);
$('file-input').addEventListener('change', e => { if (e.target.files.length === 1) inspect(e.target.files[0]); else if (e.target.files.length > 1) message('Choose one video at a time.', 'error'); });
$('clear').addEventListener('click', () => clearFile());
$('cancel').addEventListener('click', () => clearFile('Inspection canceled. No report was created.'));
const drop = $('drop-zone');
for (const event of ['dragover','dragenter']) drop.addEventListener(event,e => { e.preventDefault(); drop.classList.add('dragging'); });
for (const event of ['dragleave','drop']) drop.addEventListener(event,e => { e.preventDefault(); drop.classList.remove('dragging'); });
drop.addEventListener('drop',e => { if (e.dataTransfer.files.length !== 1) { message('Drop exactly one local video file at a time.', 'error'); return; } inspect(e.dataTransfer.files[0]); });
// Prevent navigation if a user drops a file outside the drop target.
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
$('sample').addEventListener('click', async () => {
  // Invalidate older jobs before the fetch, so a later user selection always wins.
  resetFile(); const job = generation; const controller = new AbortController(); activeController = controller;
  $('selected-panel').hidden = false; $('drop-zone').hidden = true; $('inspect-progress').hidden = false; $('preview').hidden = true; $('preview-note').hidden = true;
  $('filename').textContent = 'Preparing the generated sample'; $('file-summary').textContent = 'Fetching the bundled test clip'; setProgress('Loading the bundled generated sample. You can cancel while it loads.');
  try { const res = await fetch('assets/sample.mp4', {signal:controller.signal}); if (!res.ok) throw new Error('The sample clip could not be loaded. Choose your own file instead.'); const blob = await res.blob(); if (job !== generation || controller.signal.aborted) return; await inspect(new File([blob],'studio-test-1080p.mp4',{type:'video/mp4'}),'generated_sample'); }
  catch(e) { if (job === generation && e.name !== 'AbortError') { resetFile(); message(e.message,'error'); announce('The sample could not be loaded. ' + e.message); $('file-input').focus(); } }
});
$('export').addEventListener('click', () => {
  if (!report) return;
  const human = humanSummary();
  const evidence = { ...report, human_qc_summary:human, workflow_outcome:report.fail || human.fail ? 'changes_required' : 'manual_review_required', exported_at: new Date().toISOString(), selected_file_source: origin, metadata_warning: metadataWarning, human_qc: manualItems.map(([id,title]) => ({id,title,status:$(`manual-${id}`).value,source:'self_reported'})), handoff_notes:$('review-note').value, final_delivery_approval:'not_certified', report_authenticity:'Unsigned local report; may be edited. SHA-256 binds observations to selected file bytes only.' };
  if (downloadUrls.size >= 5) { message('Please wait a moment before downloading another report.'); return; }
  const blob = new Blob([JSON.stringify(evidence,null,2)+'\n'],{type:'application/json'}); const url = URL.createObjectURL(blob); downloadUrls.add(url);
  const a = document.createElement('a'); a.href = url; a.download = `deliver-evidence-${report.asset.sha256.slice(0,12)}-v${report.policy.version}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.delete(url); },30000);
  announce('Evidence report download requested. The JSON includes the policy, selected-byte fingerprint, unknowns, and your review.');
});
window.addEventListener('pageshow', event => { if (event.persisted) clearFile('Review session reset after returning to this page. Choose the file again to restore its preview.'); });
window.addEventListener('pagehide', () => { stopCurrent(); for (const url of downloadUrls) URL.revokeObjectURL(url); downloadUrls.clear(); });
async function init() {
  try { const response = await fetch('assets/deliver_core.wasm'); if (!response.ok) throw new Error('Engine download failed'); const wasm = await WebAssembly.instantiate(await response.arrayBuffer(),{}); engine = wasm.instance.exports; $('engine-status').textContent = 'Rust/WASM engine ready · session-only data'; $('sample').disabled = false; }
  catch { $('engine-status').textContent = 'Local engine unavailable'; message('The local validation engine could not start. Use a current browser with WebAssembly, then reload. No file has been uploaded.','error'); }
}
$('preset').value = 'hd'; fillPolicy('hd'); updateManualSummary(); init();
