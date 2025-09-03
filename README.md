# AI-Assisted HR Screening – Easy Starter
_Last updated: 2025-08-22_

This starter gets you a working prototype with:
- Frontend (HTML/CSS/JS)
- Backend on Google Apps Script (Sheets + Drive OCR + Gmail + Gemini)
- Auto-scoring + auto-emails + Gemini FAQ chat

## 0) What you’ll need
- A Google account
- A Google Sheet (will store applicants & criteria)
- A Drive folder (to store resumes)
- Gemini API key from Google AI Studio

## 1) Create Google Sheet
1. Create a new Sheet and copy its ID from the URL.
2. Add two sheets (tabs):
   - **Applicants** (leave blank; script will add header)
   - **Criteria** with columns: `Keyword | Weight`
     Example rows:
     ```
     python | 8
     javascript | 7
     llm | 6
     machine learning | 8
     google apps script | 5
     sql | 5
     ```

## 2) Create Drive folder
- Create a folder like `HR Resumes` and copy the folder ID from the URL.

## 3) Set up Apps Script backend
1. Go to https://script.google.com/ → New project.
2. Create two files:
   - `Code.gs` (paste from `apps_script/Code.gs`)
   - `appsscript.json` (Project Settings → Show "appsscript.json" → paste from `apps_script/appsscript.json`)
3. Enable Advanced Service **Drive API** (Services → `+` → Drive API → ON).
4. In your Google Cloud project (left menu → Project Settings → Cloud Project), open the project and **enable** Drive API if prompted.
5. In **Project Settings → Script properties**, add:
   - `SHEET_ID` – your sheet ID
   - `FOLDER_ID` – your resumes folder ID
   - `GEMINI_API_KEY` – from Google AI Studio
   - `NEXT_STEP_LINK` – link to an assessment/form you want for accepted candidates
   - `JOB_DESCRIPTION` – (optional) paste role description or key info
6. Deploy: **Deploy → New deployment → Web app**
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL**.

## 4) Frontend
1. Host `index.html`, `style.css`, and `script.js` anywhere (GitHub Pages, Netlify, Vercel, or open `index.html` locally for testing).
2. Open `index.html` and set:
   ```html
   <script>
     const WEB_APP_URL = "PASTE_YOUR_WEB_APP_URL_HERE";
   </script>
   ```
3. Test a submission with a sample PDF/DOCX. You should get an email (to the applicant) with PASS/REJECT.

## 5) How scoring works
- Reads `Criteria` sheet for keywords + weights.
- Computes coverage % and adds a small bonus for education signals.
- If score ≥ 85 → **PASS** (email includes NEXT_STEP_LINK), else **REJECT**.

> Tune threshold, keywords, and weights in the `Criteria` sheet.  
> You can also set `JOB_DESCRIPTION` in Script properties for better chat context.

## 6) Gemini FAQ chat
- The frontend calls the Apps Script (`kind: "chat"`).
- The backend forwards the question to Gemini 1.5 Flash using your API key and returns the answer.
- The model uses `JOB_DESCRIPTION` as context.

## 7) Common fixes
- **CORS / no-cors:** The application submit endpoint uses `mode: "no-cors"` to avoid CORS issues on public Apps Script. The chat route returns JSON (CORS usually fine). If you see CORS errors, you can switch to an HTML Service bridge or add a simple proxy.
- **OCR accuracy:** Drive OCR is decent for PDFs/DOC/DOCX. For images or scans, ensure clarity.
- **Emails not sending:** Check `MailApp` authorization and quotas.
- **500 errors:** View **Executions** in Apps Script for logs.

## 8) Security notes
- This is a demo. Don’t collect real PII in production.
- Lock down your Web App (limit access to your domain/users) when going live.
- Consider reCAPTCHA to avoid spam.

## 9) File map
```
public/
  index.html
  style.css
  script.js
apps_script/
  Code.gs
  appsscript.json
README.md
```

Good luck! 🚀
