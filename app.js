// --- API Base URL (your Worker) ---
const API_BASE = 'https://agrimind-api.wambsharu0.workers.dev';

// --- Global State ---
let currentUser = null;
let mobilenetModel = null;

// --- UI Helpers ---
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

// --- Auth ---
async function checkSession() {
    const res = await fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' });
    if (res.ok) {
        currentUser = await res.json();
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

async function login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
    }
    currentUser = await res.json();
    updateAuthUI();
    showToast(`Welcome back, ${currentUser.displayName}!`);
    loadDashboardStats();
}

async function register(email, password, displayName) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
        credentials: 'include'
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
    }
    return login(email, password);
}

async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    currentUser = null;
    updateAuthUI();
    showToast('Logged out');
}

// --- Dashboard Stats ---
async function loadDashboardStats() {
    if (!currentUser) return;
    const [forumRes, recordsRes, jobsRes, tutorialsRes] = await Promise.all([
        fetch(`${API_BASE}/api/forum`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/records`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/jobs`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/tutorials`, { credentials: 'include' })
    ]);
    const forumPosts = await forumRes.json();
    const records = await recordsRes.json();
    const jobs = await jobsRes.json();
    const tutorials = await tutorialsRes.json();

    document.getElementById('statRecords').textContent = records.length;
    document.getElementById('statJobs').textContent = jobs.length;
    document.getElementById('statTuts').textContent = tutorials.length;
    document.getElementById('statForum').textContent = forumPosts.length;
}

// --- Forum ---
async function loadForum() {
    const res = await fetch(`${API_BASE}/api/forum`, { credentials: 'include' });
    const posts = await res.json();
    const container = document.getElementById('forumList');
    if (!posts.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;">No discussions yet.</div>';
        return;
    }
    container.innerHTML = posts.map(p => `
        <div class="forum-post">
            <strong>${escapeHtml(p.author)}</strong> <small>${new Date(p.created_at).toLocaleString()}</small>
            <p>${escapeHtml(p.content)}</p>
            <button class="delete-btn" data-type="forum" data-id="${p.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

async function addForumPost(content) {
    if (!currentUser) return showToast('Please login', true);
    await fetch(`${API_BASE}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include'
    });
    loadForum();
    loadDashboardStats();
}

async function deleteForumPost(id) {
    await fetch(`${API_BASE}/api/forum?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadForum();
    loadDashboardStats();
}

// --- Records ---
async function loadRecords() {
    const res = await fetch(`${API_BASE}/api/records`, { credentials: 'include' });
    const records = await res.json();
    const container = document.getElementById('recordsList');
    if (!records.length) {
        container.innerHTML = '<p style="text-align:center;">No farm records yet.</p>';
        return;
    }
    container.innerHTML = records.map(r => `
        <div class="record-item">
            <strong>${escapeHtml(r.title)}</strong>
            <p>${escapeHtml(r.detail)}</p>
            <small>${new Date(r.created_at).toLocaleString()}</small>
            <button class="delete-btn" data-type="record" data-id="${r.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

async function addRecord(title, detail) {
    await fetch(`${API_BASE}/api/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, detail }),
        credentials: 'include'
    });
    loadRecords();
    loadDashboardStats();
}

async function deleteRecord(id) {
    await fetch(`${API_BASE}/api/records?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadRecords();
    loadDashboardStats();
}

// --- Jobs ---
async function loadJobs() {
    const res = await fetch(`${API_BASE}/api/jobs`, { credentials: 'include' });
    const jobs = await res.json();
    const container = document.getElementById('jobsList');
    if (!jobs.length) {
        container.innerHTML = '<p style="text-align:center;">No job listings available.</p>';
        return;
    }
    container.innerHTML = jobs.map(j => `
        <div class="job-item">
            <strong>${escapeHtml(j.title)}</strong>
            <p>${escapeHtml(j.description)}</p>
            <small>Posted by ${escapeHtml(j.author)}</small>
            <button class="delete-btn" data-type="job" data-id="${j.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

async function addJob(title, description) {
    await fetch(`${API_BASE}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
        credentials: 'include'
    });
    loadJobs();
    loadDashboardStats();
}

async function deleteJob(id) {
    await fetch(`${API_BASE}/api/jobs?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadJobs();
    loadDashboardStats();
}

// --- Marketplace ---
async function loadMarket() {
    const res = await fetch(`${API_BASE}/api/market`, { credentials: 'include' });
    const products = await res.json();
    const container = document.getElementById('marketList');
    if (!products.length) {
        container.innerHTML = '<p style="text-align:center;">No products listed.</p>';
        return;
    }
    container.innerHTML = products.map(p => `
        <div class="product-item">
            <strong>${escapeHtml(p.name)}</strong> - ${escapeHtml(p.price)}
            <br><small>Seller: ${escapeHtml(p.seller)}</small>
            <button class="delete-btn" data-type="product" data-id="${p.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

async function addProduct(name, price) {
    await fetch(`${API_BASE}/api/market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price }),
        credentials: 'include'
    });
    loadMarket();
}

async function deleteProduct(id) {
    await fetch(`${API_BASE}/api/market?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadMarket();
}

// --- Messages ---
async function loadMessages() {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE}/api/messages`, { credentials: 'include' });
    const msgs = await res.json();
    const container = document.getElementById('messagesList');
    if (!msgs.length) {
        container.innerHTML = '<p>Your messages will appear here.</p>';
        return;
    }
    container.innerHTML = msgs.map(m => `
        <div class="msg-item">
            <strong>${escapeHtml(m.from_name)}</strong> → ${escapeHtml(m.to_name)}: ${escapeHtml(m.text)}
            <br><small>${new Date(m.created_at).toLocaleString()}</small>
        </div>
    `).join('');
}

async function sendMessage(toEmail, text) {
    await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail, text }),
        credentials: 'include'
    });
    loadMessages();
}

// --- Tutorials ---
async function loadTutorials() {
    const res = await fetch(`${API_BASE}/api/tutorials`, { credentials: 'include' });
    const tutorials = await res.json();
    const container = document.getElementById('videosList');
    if (!tutorials.length) {
        container.innerHTML = '<div style="text-align:center;padding:20px;">No tutorials shared yet.</div>';
        return;
    }
    container.innerHTML = tutorials.map(t => `
        <div class="tutorial-item">
            <i class="fas fa-play-circle" style="color:#10B981;"></i> 
            <strong>${escapeHtml(t.title)}</strong>
            <br><a href="${escapeHtml(t.url)}" target="_blank" style="color:#10B981;">Watch Tutorial →</a>
            <p>${escapeHtml(t.description)}</p>
            <small>Shared by ${escapeHtml(t.author)}</small>
            <button class="delete-btn" data-type="tutorial" data-id="${t.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

async function addTutorial(title, url, description) {
    await fetch(`${API_BASE}/api/tutorials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, description }),
        credentials: 'include'
    });
    loadTutorials();
    loadDashboardStats();
}

async function deleteTutorial(id) {
    await fetch(`${API_BASE}/api/tutorials?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadTutorials();
    loadDashboardStats();
}

// --- Search ---
async function globalSearch(term) {
    const res = await fetch(`${API_BASE}/api/search?q=` + encodeURIComponent(term), { credentials: 'include' });
    const results = await res.json();
    const container = document.getElementById('searchResults');
    if (!results.length) {
        container.innerHTML = '<p style="padding:20px;">No matches found.</p>';
        return;
    }
    container.innerHTML = results.map(r => `
        <div style="padding:12px; border-bottom:1px solid #333;">
            <i class="fas fa-search"></i> ${escapeHtml(r.text)}
        </div>
    `).join('');
}

// --- Pest Detection (MobileNet) ---
async function loadModel() {
    if (!mobilenetModel) {
        mobilenetModel = await mobilenet.load();
        console.log('MobileNet model ready');
    }
    return mobilenetModel;
}

async function classifyPest(imageElement) {
    try {
        const model = await loadModel();
        const predictions = await model.classify(imageElement);
        if (predictions && predictions.length > 0) {
            const top = predictions[0];
            const className = top.className.toLowerCase();
            let pestAdvice = `Analysis Result: ${top.className} (${(top.probability*100).toFixed(1)}% confidence)`;
            if (className.includes('caterpillar') || className.includes('worm') || 
                className.includes('beetle') || className.includes('aphid')) {
                pestAdvice += `<br><br><i class="fas fa-leaf"></i> <strong>Pest Detected:</strong> Consider applying neem oil or organic pesticide.`;
            } else if (className.includes('fungus') || className.includes('mold') || className.includes('blight')) {
                pestAdvice += `<br><br><i class="fas fa-droplet"></i> <strong>Fungal Issue:</strong> Improve air circulation. Apply copper-based fungicide.`;
            } else {
                pestAdvice += `<br><br><i class="fas fa-seedling"></i> Monitor your crop closely.`;
            }
            return pestAdvice;
        }
        return 'Unable to analyze this image. Try a clearer photo.';
    } catch (err) {
        return 'Analysis error. Please try again.';
    }
}

// --- Farming Assistant ---
async function wikiAnswer(question) {
    try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}?redirect=true`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.extract) return data.extract.substring(0, 550);
        return "I couldn't find specific information on that topic.";
    } catch (e) {
        return "Connection error. Check your internet and try again.";
    }
}

// --- Page Navigation ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
    const pageElement = document.getElementById(pageId);
    if (pageElement) pageElement.classList.add('active-page');
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-links li[data-page="${pageId}"]`);
    if (activeLink) activeLink.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    switch (pageId) {
        case 'forum': loadForum(); break;
        case 'records': loadRecords(); break;
        case 'jobs': loadJobs(); break;
        case 'market': loadMarket(); break;
        case 'messages': loadMessages(); break;
        case 'tutorials': loadTutorials(); break;
        case 'dashboard': loadDashboardStats(); break;
    }
}

// --- Auth Modal ---
function openModal(mode) {
    const modal = document.getElementById('authModal');
    const title = document.getElementById('modalTitle');
    const displayNameField = document.getElementById('authDisplayName');
    if (mode === 'login') {
        title.innerText = 'Welcome Back';
        displayNameField.style.display = 'none';
    } else {
        title.innerText = 'Create Account';
        displayNameField.style.display = 'block';
    }
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPass').value = '';
    document.getElementById('authDisplayName').value = '';
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page) showPage(page);
        });
    });

    document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
    document.getElementById('signupBtn').addEventListener('click', () => openModal('signup'));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('authModal').addEventListener('click', function (e) {
        if (e.target === this) closeModal();
    });

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
                if (!displayName) return showToast('Display name is required', true);
                await register(email, password, displayName);
            }
            closeModal();
        } catch (err) {
            showToast(err.message, true);
        }
    });

    document.getElementById('userGreeting').addEventListener('click', logout);

    // Forum
    document.getElementById('postForumBtn').addEventListener('click', () => {
        const content = document.getElementById('forumContent').value.trim();
        if (content) { addForumPost(content); document.getElementById('forumContent').value = ''; }
    });

    // Records
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        const title = document.getElementById('recordTitle').value.trim();
        const detail = document.getElementById('recordDetail').value.trim();
        if (title) { addRecord(title, detail); document.getElementById('recordTitle').value = ''; document.getElementById('recordDetail').value = ''; }
    });

    // Jobs
    document.getElementById('postJobBtn').addEventListener('click', () => {
        const title = document.getElementById('jobTitle').value.trim();
        const desc = document.getElementById('jobDesc').value.trim();
        if (title) { addJob(title, desc); document.getElementById('jobTitle').value = ''; document.getElementById('jobDesc').value = ''; }
    });

    // Market
    document.getElementById('addProductBtn').addEventListener('click', () => {
        const name = document.getElementById('productName').value.trim();
        const price = document.getElementById('productPrice').value.trim();
        if (name && price) { addProduct(name, price); document.getElementById('productName').value = ''; document.getElementById('productPrice').value = ''; }
    });

    // Messages
    document.getElementById('sendMsgBtn').addEventListener('click', () => {
        const toEmail = document.getElementById('msgTo').value.trim();
        const text = document.getElementById('msgText').value.trim();
        if (toEmail && text) { sendMessage(toEmail, text); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
    });

    // Search
    document.getElementById('doSearchBtn').addEventListener('click', () => {
        const query = document.getElementById('searchInput').value.trim();
        if (query) globalSearch(query); else showToast('Please enter a search term', true);
    });

    // Tutorials
    document.getElementById('addVideoBtn').addEventListener('click', () => {
        const title = document.getElementById('videoTitle').value.trim();
        const url = document.getElementById('videoUrl').value.trim();
        const desc = document.getElementById('videoDesc').value.trim();
        if (title && url) { addTutorial(title, url, desc); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; document.getElementById('videoDesc').value = ''; }
    });

    // Pest Detection
    document.getElementById('identifyPestBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('pestImageInput');
        const file = fileInput.files[0];
        if (!file) return showToast('Please select an image', true);
        const reader = new FileReader();
        reader.onload = async function (e) {
            const imgPreview = document.getElementById('pestPreview');
            imgPreview.src = e.target.result;
            imgPreview.style.display = 'block';
            const resultDiv = document.getElementById('pestResult');
            resultDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Analyzing...';
            try {
                const img = new Image();
                img.src = e.target.result;
                await new Promise(resolve => { img.onload = resolve; });
                const result = await classifyPest(img);
                resultDiv.innerHTML = `<i class="fas fa-microscope"></i> ${result}`;
            } catch (err) {
                resultDiv.innerHTML = 'Analysis failed. Please try again.';
            }
        };
        reader.readAsDataURL(file);
    });

    // Chat
    document.getElementById('sendChatBtn').addEventListener('click', async () => {
        const input = document.getElementById('chatInput').value.trim();
        if (!input) return;
        const chatDiv = document.getElementById('chatMessages');
        chatDiv.innerHTML += `<div class="message-bubble user-msg">${escapeHtml(input)}</div>`;
        document.getElementById('chatInput').value = '';
        const reply = await wikiAnswer(input);
        chatDiv.innerHTML += `<div class="message-bubble bot-msg">${escapeHtml(reply)}</div>`;
        chatDiv.scrollTop = chatDiv.scrollHeight;
    });

    // Deletion delegation
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.delete-btn');
        if (!btn) return;
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        if (!id) return;
        if (!currentUser) return showToast('Please login to delete', true);
        switch (type) {
            case 'forum': await deleteForumPost(id); break;
            case 'record': await deleteRecord(id); break;
            case 'job': await deleteJob(id); break;
            case 'product': await deleteProduct(id); break;
            case 'tutorial': await deleteTutorial(id); break;
        }
    });

    loadModel().then(() => console.log('MobileNet ready')).catch(console.warn);
    checkSession();
    showPage('dashboard');
});