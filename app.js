const API_BASE = 'https://agrimind-api.wambsharu0.workers.dev';

let currentUser = null;
let authToken = localStorage.getItem('agriToken') || null;
let mobilenetModel = null;

// ---------- Helpers ----------
function showToast(msg, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = isError ? '#dc2626' : '#10B981';
  toast.style.color = 'white';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ---------- API helper (attaches token) ----------
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
}

// ---------- Auth ----------
async function checkSession() {
  if (!authToken) { currentUser = null; updateAuthUI(); return; }
  const res = await api(`${API_BASE}/api/auth/session`);
  if (res.ok) {
    currentUser = await res.json();
  } else {
    authToken = null; localStorage.removeItem('agriToken'); currentUser = null;
  }
  updateAuthUI();
  if (currentUser) loadDashboardStats();
}

function updateAuthUI() {
  const authSection = document.getElementById('authSection');
  const userGreeting = document.getElementById('userGreeting');
  if (currentUser) {
    authSection.style.display = 'none';
    userGreeting.style.display = 'block';
    userGreeting.innerHTML = `<i class="fas fa-user-check"></i> ${escapeHtml(currentUser.displayName)}`;
  } else {
    authSection.style.display = 'flex';
    userGreeting.style.display = 'none';
  }
}

async function login(email, password) {
  const res = await api(`${API_BASE}/api/auth/login`, {
    method: 'POST', body: JSON.stringify({ email, password })
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
  const data = await res.json();
  authToken = data.token; localStorage.setItem('agriToken', authToken);
  currentUser = { id: data.id, email: data.email, displayName: data.displayName };
  updateAuthUI(); showToast(`Welcome, ${currentUser.displayName}!`); loadDashboardStats();
}

async function register(email, password, displayName) {
  const res = await api(`${API_BASE}/api/auth/register`, {
    method: 'POST', body: JSON.stringify({ email, password, displayName })
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
  const data = await res.json();
  authToken = data.token; localStorage.setItem('agriToken', authToken);
  currentUser = { id: data.id, email: data.email, displayName: data.displayName };
  updateAuthUI(); showToast(`Welcome, ${currentUser.displayName}!`); loadDashboardStats();
}

function logout() {
  authToken = null; localStorage.removeItem('agriToken'); currentUser = null;
  updateAuthUI(); showToast('Logged out');
}

// ---------- Dashboard ----------
async function loadDashboardStats() {
  if (!currentUser) return;
  const [f,r,j,t] = await Promise.all([
    api(`${API_BASE}/api/forum`), api(`${API_BASE}/api/records`),
    api(`${API_BASE}/api/jobs`), api(`${API_BASE}/api/tutorials`)
  ]);
  const fp = await f.json(), rc = await r.json(), jb = await j.json(), tu = await t.json();
  document.getElementById('statRecords').textContent = rc.length;
  document.getElementById('statJobs').textContent = jb.length;
  document.getElementById('statTuts').textContent = tu.length;
  document.getElementById('statForum').textContent = fp.length;
}

// ---------- Forum ----------
async function loadForum() {
  const res = await api(`${API_BASE}/api/forum`);
  const posts = await res.json();
  const c = document.getElementById('forumList');
  if (!posts.length) { c.innerHTML = '<div style="text-align:center;padding:20px;">No discussions yet.</div>'; return; }
  c.innerHTML = posts.map(p => `
    <div class="forum-post">
      <strong>${escapeHtml(p.author)}</strong> <small>${new Date(p.created_at).toLocaleString()}</small>
      <p>${escapeHtml(p.content)}</p>
      <button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addForumPost(content) {
  if (!currentUser) return showToast('Please login', true);
  await api(`${API_BASE}/api/forum`, { method: 'POST', body: JSON.stringify({ content }) });
  loadForum(); loadDashboardStats();
}

async function deleteForumPost(id) {
  await api(`${API_BASE}/api/forum?id=${id}`, { method: 'DELETE' });
  loadForum(); loadDashboardStats();
}

// ---------- Records ----------
async function loadRecords() {
  const res = await api(`${API_BASE}/api/records`);
  const records = await res.json();
  const c = document.getElementById('recordsList');
  if (!records.length) { c.innerHTML = '<p style="text-align:center;">No farm records yet.</p>'; return; }
  c.innerHTML = records.map(r => `
    <div class="record-item">
      <strong>${escapeHtml(r.title)}</strong>
      <p>${escapeHtml(r.detail)}</p>
      <small>${new Date(r.created_at).toLocaleString()}</small>
      <button class="delete-btn" data-type="record" data-id="${r.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addRecord(title, detail) {
  await api(`${API_BASE}/api/records`, { method: 'POST', body: JSON.stringify({ title, detail }) });
  loadRecords(); loadDashboardStats();
}

async function deleteRecord(id) {
  await api(`${API_BASE}/api/records?id=${id}`, { method: 'DELETE' });
  loadRecords(); loadDashboardStats();
}

// ---------- Jobs ----------
async function loadJobs() {
  const res = await api(`${API_BASE}/api/jobs`);
  const jobs = await res.json();
  const c = document.getElementById('jobsList');
  if (!jobs.length) { c.innerHTML = '<p style="text-align:center;">No job listings available.</p>'; return; }
  c.innerHTML = jobs.map(j => `
    <div class="job-item">
      <strong>${escapeHtml(j.title)}</strong>
      <p>${escapeHtml(j.description)}</p>
      <small>Posted by ${escapeHtml(j.author)}</small>
      <button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addJob(title, description) {
  await api(`${API_BASE}/api/jobs`, { method: 'POST', body: JSON.stringify({ title, description }) });
  loadJobs(); loadDashboardStats();
}

async function deleteJob(id) {
  await api(`${API_BASE}/api/jobs?id=${id}`, { method: 'DELETE' });
  loadJobs(); loadDashboardStats();
}

// ---------- Market ----------
async function loadMarket() {
  const res = await api(`${API_BASE}/api/market`);
  const products = await res.json();
  const c = document.getElementById('marketList');
  if (!products.length) { c.innerHTML = '<p style="text-align:center;">No products listed.</p>'; return; }
  c.innerHTML = products.map(p => `
    <div class="product-item">
      <strong>${escapeHtml(p.name)}</strong> - ${escapeHtml(p.price)}
      <br><small>Seller: ${escapeHtml(p.seller)}</small>
      <button class="delete-btn" data-type="product" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addProduct(name, price) {
  await api(`${API_BASE}/api/market`, { method: 'POST', body: JSON.stringify({ name, price }) });
  loadMarket();
}

async function deleteProduct(id) {
  await api(`${API_BASE}/api/market?id=${id}`, { method: 'DELETE' });
  loadMarket();
}

// ---------- Messages ----------
async function loadMessages() {
  if (!currentUser) return;
  const res = await api(`${API_BASE}/api/messages`);
  const msgs = await res.json();
  const c = document.getElementById('messagesList');
  if (!msgs.length) { c.innerHTML = '<p>Your messages will appear here.</p>'; return; }
  c.innerHTML = msgs.map(m => `
    <div class="msg-item">
      <strong>${escapeHtml(m.from_name)}</strong> → ${escapeHtml(m.to_name)}: ${escapeHtml(m.text)}
      <br><small>${new Date(m.created_at).toLocaleString()}</small>
    </div>`).join('');
}

async function sendMessage(toEmail, text) {
  await api(`${API_BASE}/api/messages`, { method: 'POST', body: JSON.stringify({ toEmail, text }) });
  loadMessages();
}

// ---------- Tutorials ----------
async function loadTutorials() {
  const res = await api(`${API_BASE}/api/tutorials`);
  const tutorials = await res.json();
  const c = document.getElementById('videosList');
  if (!tutorials.length) { c.innerHTML = '<div style="text-align:center;padding:20px;">No tutorials shared yet.</div>'; return; }
  c.innerHTML = tutorials.map(t => `
    <div class="tutorial-item">
      <i class="fas fa-play-circle" style="color:#10B981;"></i> 
      <strong>${escapeHtml(t.title)}</strong>
      <br><a href="${escapeHtml(t.url)}" target="_blank" style="color:#10B981;">Watch Tutorial →</a>
      <p>${escapeHtml(t.description)}</p>
      <small>Shared by ${escapeHtml(t.author)}</small>
      <button class="delete-btn" data-type="tutorial" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addTutorial(title, url, description) {
  await api(`${API_BASE}/api/tutorials`, { method: 'POST', body: JSON.stringify({ title, url, description }) });
  loadTutorials(); loadDashboardStats();
}

async function deleteTutorial(id) {
  await api(`${API_BASE}/api/tutorials?id=${id}`, { method: 'DELETE' });
  loadTutorials(); loadDashboardStats();
}

// ---------- Search ----------
async function globalSearch(term) {
  const res = await api(`${API_BASE}/api/search?q=` + encodeURIComponent(term));
  const results = await res.json();
  const c = document.getElementById('searchResults');
  if (!results.length) { c.innerHTML = '<p style="padding:20px;">No matches found.</p>'; return; }
  c.innerHTML = results.map(r => `<div style="padding:12px; border-bottom:1px solid #333;"><i class="fas fa-search"></i> ${escapeHtml(r.text)}</div>`).join('');
}

// ---------- Pest Detection (unchanged) ----------
async function loadModel() { if (!mobilenetModel) { mobilenetModel = await mobilenet.load(); } return mobilenetModel; }
async function classifyPest(img) {
  const model = await loadModel();
  const preds = await model.classify(img);
  if (!preds || !preds.length) return 'Analysis failed.';
  const top = preds[0];
  let advice = `Analysis: ${top.className} (${(top.probability*100).toFixed(1)}%)`;
  const name = top.className.toLowerCase();
  if (name.includes('worm') || name.includes('caterpillar') || name.includes('beetle') || name.includes('aphid')) advice += '<br><br>Pest detected – use neem oil.';
  else if (name.includes('fungus') || name.includes('mold') || name.includes('blight')) advice += '<br><br>Fungal issue – improve air circulation.';
  else advice += '<br><br>Monitor crop.';
  return advice;
}

// ---------- Farming Assistant ----------
async function wikiAnswer(q) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}?redirect=true`);
    const d = await res.json();
    return d.extract ? d.extract.substring(0, 550) : 'No info found.';
  } catch { return 'Connection error.'; }
}

// ---------- Page navigation ----------
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
  document.getElementById(pageId).classList.add('active-page');
  document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
  document.querySelector(`.nav-links li[data-page="${pageId}"]`).classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  if (pageId === 'forum') loadForum();
  else if (pageId === 'records') loadRecords();
  else if (pageId === 'jobs') loadJobs();
  else if (pageId === 'market') loadMarket();
  else if (pageId === 'messages') loadMessages();
  else if (pageId === 'tutorials') loadTutorials();
  else if (pageId === 'dashboard') loadDashboardStats();
}

// ---------- Auth modal ----------
function openModal(mode) {
  document.getElementById('modalTitle').textContent = mode === 'login' ? 'Welcome Back' : 'Create Account';
  document.getElementById('authDisplayName').style.display = mode === 'login' ? 'none' : 'block';
  document.getElementById('authModal').style.display = 'flex';
}
function closeModal() {
  document.getElementById('authModal').style.display = 'none';
  ['authEmail','authPass','authDisplayName'].forEach(id => document.getElementById(id).value = '');
}

// ---------- DOM ready ----------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hamburgerBtn').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
  };
  document.getElementById('sidebarOverlay').onclick = () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  };

  document.querySelectorAll('.nav-links li').forEach(li => li.onclick = e => { e.preventDefault(); showPage(li.dataset.page); });

  document.getElementById('loginBtn').onclick = () => openModal('login');
  document.getElementById('signupBtn').onclick = () => openModal('signup');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('authModal').onclick = e => { if (e.target === document.getElementById('authModal')) closeModal(); };

  let authMode = 'login';
  document.getElementById('loginBtn').addEventListener('click', () => authMode = 'login');
  document.getElementById('signupBtn').addEventListener('click', () => authMode = 'signup');

  document.getElementById('authSubmitBtn').onclick = async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;
    const display = document.getElementById('authDisplayName').value.trim();
    try {
      if (authMode === 'login') {
        await login(email, pass);
      } else {
        if (!display) return showToast('Display name required', true);
        await register(email, pass, display);
      }
      closeModal();
    } catch (e) { showToast(e.message, true); }
  };

  document.getElementById('userGreeting').onclick = logout;

  document.getElementById('postForumBtn').onclick = () => {
    const c = document.getElementById('forumContent').value.trim();
    if (c) { addForumPost(c); document.getElementById('forumContent').value = ''; }
  };
  document.getElementById('addRecordBtn').onclick = () => {
    const t = document.getElementById('recordTitle').value.trim();
    const d = document.getElementById('recordDetail').value.trim();
    if (t) { addRecord(t, d); document.getElementById('recordTitle').value = ''; document.getElementById('recordDetail').value = ''; }
  };
  document.getElementById('postJobBtn').onclick = () => {
    const t = document.getElementById('jobTitle').value.trim();
    const d = document.getElementById('jobDesc').value.trim();
    if (t) { addJob(t, d); document.getElementById('jobTitle').value = ''; document.getElementById('jobDesc').value = ''; }
  };
  document.getElementById('addProductBtn').onclick = () => {
    const n = document.getElementById('productName').value.trim();
    const p = document.getElementById('productPrice').value.trim();
    if (n && p) { addProduct(n, p); document.getElementById('productName').value = ''; document.getElementById('productPrice').value = ''; }
  };
  document.getElementById('sendMsgBtn').onclick = () => {
    const to = document.getElementById('msgTo').value.trim();
    const tx = document.getElementById('msgText').value.trim();
    if (to && tx) { sendMessage(to, tx); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
  };
  document.getElementById('doSearchBtn').onclick = () => {
    const q = document.getElementById('searchInput').value.trim();
    if (q) globalSearch(q); else showToast('Enter a search term', true);
  };
  document.getElementById('addVideoBtn').onclick = () => {
    const t = document.getElementById('videoTitle').value.trim();
    const u = document.getElementById('videoUrl').value.trim();
    const d = document.getElementById('videoDesc').value.trim();
    if (t && u) { addTutorial(t, u, d); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; document.getElementById('videoDesc').value = ''; }
  };

  // Pest detection
  document.getElementById('identifyPestBtn').onclick = async () => {
    const file = document.getElementById('pestImageInput').files[0];
    if (!file) return showToast('Select an image', true);
    const reader = new FileReader();
    reader.onload = async e => {
      document.getElementById('pestPreview').src = e.target.result;
      document.getElementById('pestPreview').style.display = 'block';
      document.getElementById('pestResult').innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Analyzing...';
      const img = new Image(); img.src = e.target.result;
      await new Promise(r => img.onload = r);
      document.getElementById('pestResult').innerHTML = `<i class="fas fa-microscope"></i> ${await classifyPest(img)}`;
    };
    reader.readAsDataURL(file);
  };

  // Chat
  document.getElementById('sendChatBtn').onclick = async () => {
    const input = document.getElementById('chatInput').value.trim();
    if (!input) return;
    const chat = document.getElementById('chatMessages');
    chat.innerHTML += `<div class="message-bubble user-msg">${escapeHtml(input)}</div>`;
    document.getElementById('chatInput').value = '';
    const reply = await wikiAnswer(input);
    chat.innerHTML += `<div class="message-bubble bot-msg">${escapeHtml(reply)}</div>`;
    chat.scrollTop = chat.scrollHeight;
  };

  // Deletion
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    if (!currentUser) return showToast('Login to delete', true);
    const { type, id } = btn.dataset;
    if (type === 'forum') await deleteForumPost(id);
    else if (type === 'record') await deleteRecord(id);
    else if (type === 'job') await deleteJob(id);
    else if (type === 'product') await deleteProduct(id);
    else if (type === 'tutorial') await deleteTutorial(id);
  });

  loadModel().catch(console.warn);
  checkSession();
  showPage('dashboard');
});
