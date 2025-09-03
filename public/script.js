// Basic helpers
const el = (sel) => document.querySelector(sel);
const chatLog = el('#chatLog');
const statusEl = el('#applyStatus');

function appendMsg(who, text){
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Submit application (sends file as Base64 JSON to Apps Script)
el('#applyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = el('#submitBtn');
  submitBtn.disabled = true;
  statusEl.textContent = 'Uploading and scoring your resume...';

  const name = e.target.name.value.trim();
  const email = e.target.email.value.trim();
  const phone = e.target.phone.value.trim();
  const fileInput = document.getElementById('resume');
  const file = fileInput.files[0];
  if(!file){ statusEl.textContent = 'Please select a resume file.'; submitBtn.disabled = false; return; }

  const b64 = await toBase64(file);

  const payload = {
    kind: 'submit',
    name, email, phone,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileB64: b64.split(',')[1], // strip data URL prefix
  };

  try{
    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors', // For public deployments without auth; Apps Script will still receive the request
      body: JSON.stringify(payload)
    });
    // With no-cors we can't read the body; show optimistic message
    statusEl.textContent = 'Submitted! You will receive an email with next steps.';
    e.target.reset();
    fileInput.value = '';
  }catch(err){
    console.error(err);
    statusEl.textContent = 'Submission failed. Check console or try again.';
  }finally{
    submitBtn.disabled = false;
  }
});

// Gemini chat
el('#sendBtn').addEventListener('click', sendChat);
el('#userMsg').addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendChat(); });

async function sendChat(){
  const input = el('#userMsg');
  const q = input.value.trim();
  if(!q) return;
  appendMsg('user', q);
  input.value = '';

  const payload = { kind: 'chat', question: q };

  try{
    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    appendMsg('bot', data.answer || 'No answer received.');
  }catch(err){
    console.error(err);
    appendMsg('bot', 'Error getting answer. Please try again later.');
  }
}

function toBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
