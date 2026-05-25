// ═══════════════════════════════════════════
//  YOUR SUPABASE CREDENTIALS (already filled)
// ═══════════════════════════════════════════
const SUPABASE_URL = 'https://injbsydeejivijbeatep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluamJzeWRlZWppdmlqYmVhdGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ4MzEsImV4cCI6MjA5NTMxMDgzMX0.pc-QfLVYUHk5Ky3DClI0b4ThXjLHsUsDcT8qlUOSuKA';

// Initialize Supabase client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let mobilenetModel = null;

// ---------- UI helpers ----------
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

// ---------- Auth ----------
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session && session.user) {
    const { data: profile } = await db.from('profiles').select('display_name').eq('id', session.user.id).single();
    currentUser = {
      id: session.user.id,
      email: session.user.email,
      displayName: profile?.display_name || session.user.email
    };
  } else {
    currentUser = null;
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

async function signUp(email, password, displayName) {
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  await db.from('profiles').insert({ id: data.user.id, display_name: displayName });
  await checkSession();
  showToast(`Welcome, ${displayName}!`);
}

async function login(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await checkSession();
  showToast(`Welcome back, ${currentUser.displayName}!`);
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  updateAuthUI();
  showToast('Logged out');
}

db.auth.onAuthStateChange((event, session) => { checkSession(); });

// ---------- Dashboard ----------
async function loadDashboardStats() {
  if (!currentUser) return;
  const [
    { count: forumCount }, { count: recordsCount },
    { count: jobsCount }, { count: tutsCount }
  ] = await Promise.all([
    db.from('forum_posts').select('*', { count: 'exact', head: true }),
    db.from('farm_records').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('job_listings').select('*', { count: 'exact', head: true }),
    db.from('tutorials').select('*', { count: 'exact', head: true })
  ]);
  document.getElementById('statRecords').textContent = recordsCount;
  document.getElementById('statJobs').textContent = jobsCount;
  document.getElementById('statTuts').textContent = tutsCount;
  document.getElementById('statForum').textContent = forumCount;
}

// ---------- Forum ----------
async function loadForum() {
  const { data: posts } = await db.from('forum_posts')
    .select('id, content, created_at, user_id, profiles!inner(display_name)')
    .order('created_at', { ascending: false });
  const container = document.getElementById('forumList');
  if (!posts || posts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;">No discussions yet.</div>';
    return;
  }
  container.innerHTML = posts.map(p => `
    <div class="forum-post">
      <strong>${escapeHtml(p.profiles.display_name)}</strong>
      <small>${new Date(p.created_at).toLocaleString()}</small>
      <p>${escapeHtml(p.content)}</p>
      ${currentUser && currentUser.id === p.user_id ? `<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
    </div>`).join('');
}

async function addForumPost(content) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('forum_posts').insert({ user_id: currentUser.id, content });
  loadForum();
  loadDashboardStats();
}

async function deleteForumPost(id) {
  await db.from('forum_posts').delete().eq('id', id);
  loadForum();
  loadDashboardStats();
}

// ---------- Records ----------
async function loadRecords() {
  if (!currentUser) return;
  const { data: records } = await db.from('farm_records')
    .select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  const container = document.getElementById('recordsList');
  if (!records || records.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No farm records yet.</p>';
    return;
  }
  container.innerHTML = records.map(r => `
    <div class="record-item">
      <strong>${escapeHtml(r.title)}</strong>
      <p>${escapeHtml(r.detail)}</p>
      <small>${new Date(r.created_at).toLocaleString()}</small>
      <button class="delete-btn" data-type="record" data-id="${r.id}"><i class="fas fa-trash-alt"></i></button>
    </div>`).join('');
}

async function addRecord(title, detail) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('farm_records').insert({ user_id: currentUser.id, title, detail });
  loadRecords();
  loadDashboardStats();
}

async function deleteRecord(id) {
  await db.from('farm_records').delete().eq('id', id);
  loadRecords();
  loadDashboardStats();
}

// ---------- Jobs ----------
async function loadJobs() {
  const { data: jobs } = await db.from('job_listings')
    .select('id, title, description, created_at, user_id, profiles!inner(display_name)')
    .order('created_at', { ascending: false });
  const container = document.getElementById('jobsList');
  if (!jobs || jobs.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No job listings available.</p>';
    return;
  }
  container.innerHTML = jobs.map(j => `
    <div class="job-item">
      <strong>${escapeHtml(j.title)}</strong>
      <p>${escapeHtml(j.description)}</p>
      <small>Posted by ${escapeHtml(j.profiles.display_name)}</small>
      ${currentUser && currentUser.id === j.user_id ? `<button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
    </div>`).join('');
}

async function addJob(title, description) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('job_listings').insert({ user_id: currentUser.id, title, description });
  loadJobs();
  loadDashboardStats();
}

async function deleteJob(id) {
  await db.from('job_listings').delete().eq('id', id);
  loadJobs();
  loadDashboardStats();
}

// ---------- Market ----------
async function loadMarket() {
  const { data: products } = await db.from('products')
    .select('id, name, price, created_at, user_id, profiles!inner(display_name)')
    .order('created_at', { ascending: false });
  const container = document.getElementById('marketList');
  if (!products || products.length === 0) {
    container.innerHTML = '<p style="text-align:center;">No products listed.</p>';
    return;
  }
  container.innerHTML = products.map(p => `
    <div class="product-item">
      <strong>${escapeHtml(p.name)}</strong> - ${escapeHtml(p.price)}
      <br><small>Seller: ${escapeHtml(p.profiles.display_name)}</small>
      ${currentUser && currentUser.id === p.user_id ? `<button class="delete-btn" data-type="product" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
    </div>`).join('');
}

async function addProduct(name, price) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('products').insert({ user_id: currentUser.id, name, price });
  loadMarket();
}

async function deleteProduct(id) {
  await db.from('products').delete().eq('id', id);
  loadMarket();
}

// ---------- Messages ----------
async function loadMessages() {
  if (!currentUser) return;
  const { data: msgs } = await db.from('messages')
    .select('id, text, created_at, from_user_id, to_user_id, from:from_user_id(display_name), to:to_user_id(display_name)')
    .or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });
  const container = document.getElementById('messagesList');
  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<p>Your messages will appear here.</p>';
    return;
  }
  container.innerHTML = msgs.map(m => `
    <div class="msg-item">
      <strong>${escapeHtml(m.from.display_name)}</strong> → ${escapeHtml(m.to.display_name)}: ${escapeHtml(m.text)}
      <br><small>${new Date(m.created_at).toLocaleString()}</small>
    </div>`).join('');
}

async function sendMessage(toEmail, text) {
  if (!currentUser) return showToast('Please login', true);
  const { data: users } = await db.from('profiles').select('id').eq('email', toEmail).limit(1);
  if (!users || users.length === 0) return showToast('User not found', true);
  await db.from('messages').insert({ from_user_id: currentUser.id, to_user_id: users[0].id, text });
  loadMessages();
}

// ---------- Tutorials ----------
async function loadTutorials() {
  const { data: tutorials } = await db.from('tutorials')
    .select('id, title, url, description, created_at, user_id, profiles!inner(display_name)')
    .order('created_at', { ascending: false });
  const container = document.getElementById('videosList');
  if (!tutorials || tutorials.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;">No tutorials shared yet.</div>';
    return;
  }
  container.innerHTML = tutorials.map(t => `
    <div class="tutorial-item">
      <i class="fas fa-play-circle" style="color:#10B981;"></i> 
      <strong>${escapeHtml(t.title)}</strong>
      <br><a href="${escapeHtml(t.url)}" target="_blank" style="color:#10B981;">Watch Tutorial →</a>
      <p>${escapeHtml(t.description)}</p>
      <small>Shared by ${escapeHtml(t.profiles.display_name)}</small>
      ${currentUser && currentUser.id === t.user_id ? `<button class="delete-btn" data-type="tutorial" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
    </div>`).join('');
}

async function addTutorial(title, url, description) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('tutorials').insert({ user_id: currentUser.id, title, url, description });
  loadTutorials();
  loadDashboardStats();
}

async function deleteTutorial(id) {
  await db.from('tutorials').delete().eq('id', id);
  loadTutorials();
  loadDashboardStats();
}

// ---------- Search ----------
async function globalSearch(term) {
  const t = `%${term}%`;
  const [
    { data: forumResults }, { data: recordResults },
    { data: jobResults }, { data: tutorialResults }
  ] = await Promise.all([
    db.from('forum_posts').select('content').ilike('content', t).limit(5),
    db.from('farm_records').select('title').ilike('title', t).limit(5),
    db.from('job_listings').select('title').ilike('title', t).limit(5),
    db.from('tutorials').select('title').ilike('title', t).limit(5)
  ]);
  const results = [];
  (forumResults || []).forEach(r => results.push(`Forum: ${r.content.substring(0, 70)}...`));
  (recordResults || []).forEach(r => results.push(`Record: ${r.title}`));
  (jobResults || []).forEach(r => results.push(`Job: ${r.title}`));
  (tutorialResults || []).forEach(r => results.push(`Tutorial: ${r.title}`));
  const container = document.getElementById('searchResults');
  if (!results.length) {
    container.innerHTML = '<p style="padding:20px;">No matches found.</p>';
    return;
  }
  container.innerHTML = results.map(r => `<div style="padding:12px; border-bottom:1px solid #333;"><i class="fas fa-search"></i> ${escapeHtml(r)}</div>`).join('');
}

// ---------- Profile ----------
async function uploadAvatar(file) {
  if (!currentUser) return;
  const filePath = `${currentUser.id}/profile.jpg`;
  const { error } = await db.storage.from('avatars').upload(filePath, file, { upsert: true });
  if (error) {
    showToast('Upload failed: ' + error.message, true);
    return;
  }
  const { data } = db.storage.from('avatars').getPublicUrl(filePath);
  if (data) {
    document.getElementById('profileAvatar').src = data.publicUrl;
    showToast('Profile picture updated!');
  }
}

async function loadProfile() {
  if (!currentUser) {
    document.getElementById('profileContent').innerHTML = '<p>Please log in to see your profile.</p>';
    return;
  }
  document.getElementById('profileName').textContent = currentUser.displayName;
  document.getElementById('profileEmail').textContent = currentUser.email;

  const { data: profile } = await db.from('profiles').select('created_at').eq('id', currentUser.id).single();
  if (profile) {
    document.getElementById('profileSince').textContent = 'Member since: ' + new Date(profile.created_at).toLocaleDateString();
  }

  const avatarUrl = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;
  document.getElementById('profileAvatar').src = avatarUrl;

  const [
    { count: forumCount }, { count: recordsCount }, { count: jobsCount },
    { count: productsCount }, { count: tutorialsCount }, { count: messagesCount }
  ] = await Promise.all([
    db.from('forum_posts').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('farm_records').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('job_listings').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('products').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('tutorials').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
    db.from('messages').select('*', { count: 'exact', head: true }).or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`)
  ]);

  document.getElementById('profileForumCount').textContent = forumCount;
  document.getElementById('profileRecordsCount').textContent = recordsCount;
  document.getElementById('profileJobsCount').textContent = jobsCount;
  document.getElementById('profileProductsCount').textContent = productsCount;
  document.getElementById('profileTutorialsCount').textContent = tutorialsCount;
  document.getElementById('profileMessagesCount').textContent = messagesCount;

  document.getElementById('avatarUpload').onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadAvatar(e.target.files[0]);
    }
  };
}

// ---------- Pest Detection (unchanged) ----------
async function loadModel() { if (!mobilenetModel) { mobilenetModel = await mobilenet.load(); } return mobilenetModel; }
async function classifyPest(imageElement) {
  try {
    const model = await loadModel();
    const predictions = await model.classify(imageElement);
    if (predictions && predictions.length > 0) {
      const top = predictions[0];
      const className = top.className.toLowerCase();
      let advice = `Analysis: ${top.className} (${(top.probability*100).toFixed(1)}% confidence)`;
      if (className.includes('caterpillar') || className.includes('worm') || className.includes('beetle') || className.includes('aphid')) {
        advice += '<br><br><i class="fas fa-leaf"></i> <strong>Pest Detected:</strong> Consider applying neem oil.';
      } else if (className.includes('fungus') || className.includes('mold') || className.includes('blight')) {
        advice += '<br><br><i class="fas fa-droplet"></i> <strong>Fungal Issue:</strong> Improve air circulation.';
      } else {
        advice += '<br><br><i class="fas fa-seedling"></i> Monitor your crop closely.';
      }
      return advice;
    }
    return 'Unable to analyze. Try a clearer photo.';
  } catch (err) { return 'Analysis error.'; }
}

// ---------- Farming Assistant (unchanged) ----------
async function wikiAnswer(question) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}?redirect=true`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.extract ? data.extract.substring(0, 550) : 'No info found.';
  } catch (e) { return 'Connection error.'; }
}

// ---------- Page navigation ----------
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
  document.getElementById(pageId).classList.add('active-page');
  document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
  document.querySelector(`.nav-links li[data-page="${pageId}"]`).classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  switch (pageId) {
    case 'forum': loadForum(); break;
    case 'records': loadRecords(); break;
    case 'jobs': loadJobs(); break;
    case 'market': loadMarket(); break;
    case 'messages': loadMessages(); break;
    case 'tutorials': loadTutorials(); break;
    case 'profile': loadProfile(); break;
    case 'dashboard': loadDashboardStats(); break;
  }
}

// ---------- Auth modal ----------
function openModal(mode) {
  document.getElementById('modalTitle').innerText = mode === 'login' ? 'Welcome Back' : 'Create Account';
  document.getElementById('authDisplayName').style.display = mode === 'login' ? 'none' : 'block';
  document.getElementById('authModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPass').value = '';
  document.getElementById('authDisplayName').value = '';
}

// ---------- DOM Ready ----------
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  });

  document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', e => { e.preventDefault(); showPage(li.dataset.page); });
  });

  document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
  document.getElementById('signupBtn').addEventListener('click', () => openModal('signup'));
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('authModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  let authMode = 'login';
  document.getElementById('loginBtn').addEventListener('click', () => { authMode = 'login'; });
  document.getElementById('signupBtn').addEventListener('click', () => { authMode = 'signup'; });

  document.getElementById('authSubmitBtn').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPass').value;
    const displayName = document.getElementById('authDisplayName').value.trim();
    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        if (!displayName) return showToast('Display name required', true);
        await signUp(email, password, displayName);
      }
      closeModal();
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('userGreeting').addEventListener('click', logout);

  document.getElementById('postForumBtn').addEventListener('click', () => {
    const c = document.getElementById('forumContent').value.trim();
    if (c) { addForumPost(c); document.getElementById('forumContent').value = ''; }
  });
  document.getElementById('addRecordBtn').addEventListener('click', () => {
    const t = document.getElementById('recordTitle').value.trim();
    const d = document.getElementById('recordDetail').value.trim();
    if (t) { addRecord(t, d); document.getElementById('recordTitle').value = ''; document.getElementById('recordDetail').value = ''; }
  });
  document.getElementById('postJobBtn').addEventListener('click', () => {
    const t = document.getElementById('jobTitle').value.trim();
    const d = document.getElementById('jobDesc').value.trim();
    if (t) { addJob(t, d); document.getElementById('jobTitle').value = ''; document.getElementById('jobDesc').value = ''; }
  });
  document.getElementById('addProductBtn').addEventListener('click', () => {
    const n = document.getElementById('productName').value.trim();
    const p = document.getElementById('productPrice').value.trim();
    if (n && p) { addProduct(n, p); document.getElementById('productName').value = ''; document.getElementById('productPrice').value = ''; }
  });
  document.getElementById('sendMsgBtn').addEventListener('click', () => {
    const to = document.getElementById('msgTo').value.trim();
    const tx = document.getElementById('msgText').value.trim();
    if (to && tx) { sendMessage(to, tx); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
  });
  document.getElementById('doSearchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (q) globalSearch(q); else showToast('Enter a search term', true);
  });
  document.getElementById('addVideoBtn').addEventListener('click', () => {
    const t = document.getElementById('videoTitle').value.trim();
    const u = document.getElementById('videoUrl').value.trim();
    const d = document.getElementById('videoDesc').value.trim();
    if (t && u) { addTutorial(t, u, d); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; document.getElementById('videoDesc').value = ''; }
  });

  // Pest Detection
  document.getElementById('identifyPestBtn').addEventListener('click', async () => {
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
  });

  // Chat
  document.getElementById('sendChatBtn').addEventListener('click', async () => {
    const input = document.getElementById('chatInput').value.trim();
    if (!input) return;
    const chat = document.getElementById('chatMessages');
    chat.innerHTML += `<div class="message-bubble user-msg">${escapeHtml(input)}</div>`;
    document.getElementById('chatInput').value = '';
    const reply = await wikiAnswer(input);
    chat.innerHTML += `<div class="message-bubble bot-msg">${escapeHtml(reply)}</div>`;
    chat.scrollTop = chat.scrollHeight;
  });

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

  // Init
  loadModel().catch(console.warn);
  checkSession();
  showPage('dashboard');
});
