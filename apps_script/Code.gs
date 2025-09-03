/**
 * AI-Assisted HR Screening – Apps Script backend
 * Features:
 *  - Receives applications (JSON with base64 resume)
 *  - Saves file to Drive, extracts text (OCR), scores vs criteria
 *  - Logs to Google Sheet
 *  - Sends acceptance/rejection emails automatically
 *  - Gemini Q&A endpoint
 *
 * Setup steps are in README.md
 */

// ==== CONFIG via Script Properties ====
// Set these in Extensions → Apps Script → Project Settings → Script properties
// SHEET_ID: target Google Sheet ID
// FOLDER_ID: Drive folder ID to store resumes
// GEMINI_API_KEY: Google AI Studio API key
// NEXT_STEP_LINK: URL to send accepted candidates (form/assessment link)
// JOB_DESCRIPTION: (optional) paste job description here for scoring context

function doPost(e){
  try {
    const body = e.postData && e.postData.contents ? e.postData.contents : '';
    const ct = e.postData && e.postData.type ? e.postData.type : 'application/json';

    let payload = {};
    if (ct.indexOf('application/json') > -1) {
      payload = JSON.parse(body);
    } else {
      // Fallback - try JSON anyway
      payload = JSON.parse(body || '{}');
    }

    if (payload.kind === 'submit') {
      const res = handleSubmission_(payload);
      // Return minimal JSON
      return ContentService.createTextOutput(JSON.stringify({ ok: true, id: res.rowId, score: res.score, status: res.status })).setMimeType(ContentService.MimeType.JSON);
    }
    if (payload.kind === 'chat') {
      const answer = geminiAnswer_(payload.question || '');
      return ContentService.createTextOutput(JSON.stringify({ answer })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Invalid kind' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err){
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ---- Main submission handler ----
function handleSubmission_(p){
  const props = PropertiesService.getScriptProperties();
  const SHEET_ID = props.getProperty('SHEET_ID');
  const FOLDER_ID = props.getProperty('FOLDER_ID');
  const NEXT_STEP_LINK = props.getProperty('NEXT_STEP_LINK') || 'https://example.com/next';
  const JOB_DESCRIPTION = props.getProperty('JOB_DESCRIPTION') || '';

  if(!SHEET_ID) throw new Error('SHEET_ID not set');

  // 1) Save resume to Drive
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const blob = Utilities.newBlob(Utilities.base64Decode(p.fileB64), p.mimeType || 'application/octet-stream', p.filename || 'resume.bin');
  const file = folder.createFile(blob).setName((p.name || 'applicant') + ' - ' + (p.filename || 'resume'));

  // 2) Extract text (via Advanced Drive API OCR for PDFs/images/DOC)
  const text = extractTextWithOCR_(file);

  // 3) Score resume
  const scoreObj = scoreResume_(text, JOB_DESCRIPTION);

  // 4) Log to Sheet
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('Applicants') || ss.insertSheet('Applicants');
  if (sh.getLastRow() === 0){
    sh.appendRow(['Timestamp','Name','Email','Phone','ResumeURL','Score','Status','Notes']);
  }
  const row = [new Date(), p.name, p.email, p.phone, file.getUrl(), scoreObj.score, scoreObj.status, scoreObj.notes];
  sh.appendRow(row);
  const rowId = sh.getLastRow();

  // 5) Email decision
  sendDecisionEmail_(p.email, p.name, scoreObj.score, scoreObj.status, NEXT_STEP_LINK);

  return { rowId, score: scoreObj.score, status: scoreObj.status };
}

// ---- OCR text extraction using Advanced Drive Service ----
// Enable: Services ( + ) → Drive API (Advanced) → On
// Also enable Drive API in Google Cloud project
function extractTextWithOCR_(file){
  try{
    const resource = { title: file.getName(), mimeType: file.getMimeType() };
    const options = { ocr: true };
    const blob = file.getBlob();
    const newFile = Drive.Files.insert(resource, blob, options);
    const doc = DocumentApp.openById(newFile.id);
    const text = doc.getBody().getText();
    // Clean up intermediate doc if desired
    // Drive.Files.remove(newFile.id);
    return text || '';
  }catch(e){
    return '';
  }
}

// ---- Scoring ----
// Reads keyword weights from "Criteria" sheet if available, else uses built-in defaults.
function scoreResume_(resumeText, jobDescription){
  const t = (resumeText || '').toLowerCase();
  const jd = (jobDescription || '').toLowerCase();
  const ssid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  let criteria = [];
  try{
    const sh = SpreadsheetApp.openById(ssid).getSheetByName('Criteria');
    if (sh){
      const values = sh.getDataRange().getValues();
      // Expect header: Keyword | Weight (0-10)
      for (let r=1; r<values.length; r++){
        const kw = String(values[r][0] || '').trim();
        const wt = Number(values[r][1] || 0);
        if (kw) criteria.push({ kw: kw.toLowerCase(), wt });
      }
    }
  }catch(e){}

  if (criteria.length === 0){
    // defaults
    criteria = [
      { kw: 'python', wt: 8 },
      { kw: 'javascript', wt: 7 },
      { kw: 'llm', wt: 6 },
      { kw: 'machine learning', wt: 8 },
      { kw: 'prompt engineering', wt: 5 },
      { kw: 'google apps script', wt: 5 },
      { kw: 'react', wt: 4 },
      { kw: 'node', wt: 4 },
      { kw: 'sql', wt: 5 },
      { kw: 'internship', wt: 3 },
    ];
  }

  // Compute keyword coverage score
  let total = 0, got = 0;
  let hits = [];
  criteria.forEach(c => {
    total += c.wt;
    if (t.indexOf(c.kw) > -1 || jd.indexOf(c.kw) > -1){
      got += c.wt;
      hits.push(c.kw);
    }
  });
  let score = total ? Math.round((got / total) * 100) : 0;

  // Simple adjustment: length & education signal
  const bonus = (t.match(/\b(b\.?tech|m\.?tech|bachelor|master|iit|university)\b/g) || []).length > 0 ? 5 : 0;
  score = Math.min(100, score + bonus);

  const status = score >= 85 ? 'PASS' : 'REJECT';
  const notes = 'Matched: ' + hits.join(', ');
  return { score, status, notes };
}

// ---- Email notifications ----
function sendDecisionEmail_(email, name, score, status, nextLink){
  const subjPass = `Next step for your application (Score ${score}%)`;
  const subjRej = `Update on your application (Score ${score}%)`;

  if (status === 'PASS'){
    const body = `Hi ${name},\n\nGreat news! Your application scored ${score}%.\n` +
      `Please proceed to the next step here: ${nextLink}\n\nBest,\nHR Team`;
    MailApp.sendEmail(email, subjPass, body);
  } else {
    const body = `Hi ${name},\n\nThank you for applying. Your application scored ${score}% ` +
      `which is below our current benchmark. We appreciate your interest and encourage you to reapply in the future.\n\nBest,\nHR Team`;
    MailApp.sendEmail(email, subjRej, body);
  }
}

// ---- Gemini Q&A ----
function geminiAnswer_(question){
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if(!apiKey) return "Gemini API key not configured.";
  const roleInfo = PropertiesService.getScriptProperties().getProperty('JOB_DESCRIPTION') || 'You are a helpful assistant that answers FAQs about a software internship role at our company.';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: "Job context: " + roleInfo + "\n\nQuestion: " + question }]
    }]
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const obj = JSON.parse(res.getContentText() || '{}');
  const text = (((obj || {}).candidates || [])[0] || {}).content;
  const answer = text && text.parts && text.parts[0] && text.parts[0].text ? text.parts[0].text : 'No response.';
  return answer;
}
