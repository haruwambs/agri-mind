// ═══════════════════════════════════════════
// SUPABASE CREDENTIALS
// ═══════════════════════════════════════════
const SUPABASE_URL = 'https://injbsydeejivijbeatep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluamJzeWRlZWppdmlqYmVhdGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ4MzEsImV4cCI6MjA5NTMxMDgzMX0.pc-QfLVYUHk5Ky3DClI0b4ThXjLHsUsDcT8qlUOSuKA';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// ────────── Helpers ──────────
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

// ────────── Theme ──────────
const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('theme') === 'light') document.body.classList.add('light');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

// ────────── Auth (FIXED - username properly saved and retrieved) ──────────
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
        // Get profile - wait for it to exist
        let profile = null;
        let retries = 0;
        while (retries < 3) {
            const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single();
            if (data) {
                profile = data;
                break;
            }
            retries++;
            await new Promise(r => setTimeout(r, 500));
        }
        
        // Determine display name
        let displayName = 'Farmer';
        if (profile?.display_name && profile.display_name.trim() !== '') {
            displayName = profile.display_name.trim();
        } else if (session.user.email) {
            displayName = session.user.email.split('@')[0];
        }
        
        currentUser = { 
            id: session.user.id, 
            email: session.user.email, 
            displayName: displayName 
        };
        
        console.log('Session loaded. Display name:', displayName);
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
    
    const nameToSave = displayName?.trim() || email.split('@')[0];
    console.log('Signup - saving display_name:', nameToSave, 'for user:', data.user.id);
    
    // Save profile immediately
    const { error: profileError } = await db.from('profiles').upsert({ 
        id: data.user.id, 
        display_name: nameToSave, 
        email: email 
    }, { onConflict: 'id' });
    
    if (profileError) {
        console.error('Error saving profile:', profileError);
    } else {
        console.log('Profile saved successfully');
    }
    
    // Wait a moment then check session
    await new Promise(r => setTimeout(r, 1000));
    await checkSession();
    showToast(`Welcome, ${nameToSave}!`);
}

async function login(email, password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    await checkSession();
    showToast(`Welcome back, ${currentUser?.displayName || 'farmer'}!`);
}

async function logout() {
    await db.auth.signOut();
    currentUser = null;
    updateAuthUI();
    showToast('Logged out');
}

db.auth.onAuthStateChange((event, session) => { 
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') checkSession();
    else if (event === 'SIGNED_OUT') { currentUser = null; updateAuthUI(); }
});

// ────────── Weather ──────────
async function loadWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-1.28&longitude=36.82&current_weather=true');
        const data = await res.json();
        if (data.current_weather) {
            document.getElementById('weatherWidget').innerHTML = `<p>🌡️ Temp: ${data.current_weather.temperature}°C</p><p>💨 Wind: ${data.current_weather.windspeed} km/h</p>`;
        }
    } catch { document.getElementById('weatherWidget').textContent = 'Weather unavailable'; }
}

// ────────── Dashboard ──────────
async function loadDashboardStats() {
    if (!currentUser) return;
    const { count: fc } = await db.from('forum_posts').select('*', { count: 'exact', head: true });
    const { count: rc } = await db.from('farm_records').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
    const { count: jc } = await db.from('job_listings').select('*', { count: 'exact', head: true });
    const { count: tc } = await db.from('tutorials').select('*', { count: 'exact', head: true });
    document.getElementById('statRecords').textContent = rc || 0;
    document.getElementById('statJobs').textContent = jc || 0;
    document.getElementById('statTuts').textContent = tc || 0;
    document.getElementById('statForum').textContent = fc || 0;
    loadWeather();
}

// ────────── Forum ──────────
async function loadForum() {
    const container = document.getElementById('forumList');
    const { data: posts } = await db.from('forum_posts').select('*').order('created_at', { ascending: false });
    if (!posts || posts.length === 0) { container.innerHTML = '<div style="text-align:center;padding:20px;">No posts yet.</div>'; return; }
    container.innerHTML = '';
    for (const p of posts) {
        let dn = 'Anonymous';
        if (p.user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', p.user_id).single(); 
            if (pf?.display_name && pf.display_name.trim() !== '') dn = pf.display_name.trim();
            else if (pf?.email) dn = pf.email.split('@')[0];
        }
        const postDiv = document.createElement('div');
        postDiv.className = 'forum-post';
        postDiv.innerHTML = `<strong>${escapeHtml(dn)}</strong><small>${new Date(p.created_at).toLocaleString()}</small><p>${escapeHtml(p.content)}</p>${p.image_url?`<img src="${p.image_url}" style="max-width:100%;border-radius:12px;margin:8px 0;">`:''}${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}`;
        container.appendChild(postDiv);
    }
}

async function addForumPost(content, imageFile) {
    if (!currentUser) return showToast('Please login', true);
    let imageUrl = null;
    if (imageFile) {
        const fp = `forum/${Date.now()}_${imageFile.name}`;
        const { error } = await db.storage.from('avatars').upload(fp, imageFile);
        if (!error) { const { data } = db.storage.from('avatars').getPublicUrl(fp); if (data) imageUrl = data.publicUrl; }
    }
    await db.from('forum_posts').insert({ user_id: currentUser.id, content, image_url: imageUrl });
    showToast('Post shared!'); loadForum(); loadDashboardStats();
}

async function deleteForumPost(id) { await db.from('forum_posts').delete().eq('id', id); showToast('Deleted'); loadForum(); loadDashboardStats(); }

// ────────── Groups ──────────
async function loadGroups() {
    const { data: groups } = await db.from('groups').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('groupsList');
    if (!groups || groups.length === 0) { container.innerHTML = '<p>No groups yet.</p>'; return; }
    container.innerHTML = groups.map(g => `<div class="forum-post"><strong>${escapeHtml(g.name)}</strong> <small>${escapeHtml(g.category)}</small><p>${escapeHtml(g.description||'')}</p></div>`).join('');
}

async function createGroup() {
    if (!currentUser) return showToast('Please login', true);
    const name = document.getElementById('groupName').value.trim();
    if (!name) return showToast('Group name required', true);
    await db.from('groups').insert({ name, description: document.getElementById('groupDesc').value, category: document.getElementById('groupCategory').value, location: document.getElementById('groupLocation').value, created_by: currentUser.id });
    showToast('Group created!');
    document.getElementById('groupName').value = '';
    loadGroups();
}

// ────────── Records ──────────
async function loadRecords() {
    if (!currentUser) return;
    const { data: records } = await db.from('farm_records').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    const container = document.getElementById('recordsList');
    if (!records || records.length === 0) { container.innerHTML = '<p>No records yet.</p>'; return; }
    container.innerHTML = records.map(r => `<div class="record-item"><strong>${escapeHtml(r.title)}</strong><p>${escapeHtml(r.detail||'')}</p>${r.location?`<p>📍 ${escapeHtml(r.location)}</p>`:''}<small>${new Date(r.created_at).toLocaleString()}</small><button class="delete-btn" data-type="record" data-id="${r.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
}

async function addRecord(title, detail, location) {
    if (!currentUser) return showToast('Please login', true);
    await db.from('farm_records').insert({ user_id: currentUser.id, title, detail, location });
    showToast('Saved!'); loadRecords(); loadDashboardStats();
}

async function deleteRecord(id) { await db.from('farm_records').delete().eq('id', id); showToast('Deleted'); loadRecords(); loadDashboardStats(); }

// ────────── Jobs ──────────
async function loadJobs() {
    const { data: jobs } = await db.from('job_listings').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('jobsList');
    if (!jobs || jobs.length === 0) { container.innerHTML = '<p>No jobs available.</p>'; return; }
    container.innerHTML = '';
    for (const j of jobs) {
        let posterName = 'Anonymous';
        if (j.user_id) {
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', j.user_id).single();
            if (pf?.display_name && pf.display_name.trim() !== '') posterName = pf.display_name.trim();
            else if (pf?.email) posterName = pf.email.split('@')[0];
        }
        const isOwner = currentUser && currentUser.id === j.user_id;
        container.innerHTML += `<div class="job-item">
            <strong>${escapeHtml(j.title)}</strong>
            <p>${escapeHtml(j.description||'')}</p>
            ${j.location?`<p>📍 ${escapeHtml(j.location)}</p>`:''}
            <small>Posted by: ${escapeHtml(posterName)}</small>
            ${isOwner ? `<button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
            ${!isOwner && currentUser ? `<button class="btn-outline apply-btn" data-job="${j.id}" style="margin-left:8px;">Apply Now</button>` : ''}
        </div>`;
    }
}

async function addJob(title, description, location) {
    if (!currentUser) return showToast('Please login', true);
    await db.from('job_listings').insert({ user_id: currentUser.id, title, description, location });
    showToast('Job posted!'); loadJobs(); loadDashboardStats();
}

async function deleteJob(id) { await db.from('job_listings').delete().eq('id', id); showToast('Deleted'); loadJobs(); }

async function applyToJob(jobId) {
    if (!currentUser) { showToast('Please login first', true); return; }
    const { data: existing } = await db.from('job_applications').select('*').match({ job_id: parseInt(jobId), applicant_id: currentUser.id });
    if (existing && existing.length > 0) { showToast('You already applied', true); return; }
    const msg = prompt('Add a message (optional):');
    await db.from('job_applications').insert({ job_id: parseInt(jobId), applicant_id: currentUser.id, applicant_message: msg || 'I am interested.', message: msg || 'I am interested.', status: 'pending' });
    showToast('Applied!'); loadJobs();
}

// ────────── Applications ──────────
async function loadApplications() {
    if (!currentUser) return;
    const container = document.getElementById('applicationsList');
    const { data: myJobs } = await db.from('job_listings').select('id,title').eq('user_id', currentUser.id);
    if (!myJobs || myJobs.length === 0) { container.innerHTML = '<p>No jobs posted yet.</p>'; return; }
    container.innerHTML = '';
    for (const job of myJobs) {
        const { data: apps } = await db.from('job_applications').select('*').eq('job_id', job.id).order('created_at', { ascending: false });
        if (apps && apps.length > 0) {
            container.innerHTML += `<h4 style="color:var(--accent);margin-bottom:10px;">📋 ${escapeHtml(job.title)} (${apps.length} applicants)</h4>`;
            for (const a of apps) {
                let applicantEmail = 'N/A', applicantName = 'Unknown';
                if (a.applicant_id) {
                    const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', a.applicant_id).single();
                    if (pf) { applicantEmail = pf.email || 'N/A'; applicantName = pf.display_name?.trim() || pf.email?.split('@')[0] || 'Unknown'; }
                }
                const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
                container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};">
                    <strong>${escapeHtml(applicantName)}</strong>
                    <p>📧 ${escapeHtml(applicantEmail)}</p>
                    <p>💬 ${escapeHtml(a.applicant_message || 'No message')}</p>
                    <small>${new Date(a.created_at).toLocaleDateString()}</small>
                    <br><span style="color:${sc};">Status: ${a.status}</span>
                    ${a.status==='pending'?`<div style="margin-top:8px;"><button class="btn-outline accept-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;margin-right:8px;">✅ Accept</button><button class="btn-outline reject-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;border-color:#dc2626;color:#dc2626;">❌ Reject</button></div>`:''}
                    ${a.status==='accepted'?`<button class="btn-primary contact-applicant-btn" data-email="${escapeHtml(applicantEmail)}" data-name="${escapeHtml(applicantName)}" style="font-size:12px;padding:6px 14px;margin-top:8px;"><i class="fas fa-envelope"></i> Contact</button>`:''}
                </div>`;
            }
        }
    }
    if (container.innerHTML === '') container.innerHTML = '<p>No applications received yet.</p>';
}

// ────────── My Applications ──────────
async function loadMyApplications() {
    if (!currentUser) return;
    const container = document.getElementById('myApplicationsList');
    const { data: apps } = await db.from('job_applications').select('*').eq('applicant_id', currentUser.id).order('created_at', { ascending: false });
    if (!apps || apps.length === 0) { container.innerHTML = '<p>You haven\'t applied to any jobs yet.</p>'; return; }
    container.innerHTML = '';
    for (const a of apps) {
        const { data: job } = await db.from('job_listings').select('title,description,location,user_id').eq('id', a.job_id).single();
        let employerEmail = 'N/A', employerName = 'Unknown';
        if (job?.user_id) {
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', job.user_id).single();
            if (pf) { employerEmail = pf.email || 'N/A'; employerName = pf.display_name?.trim() || pf.email?.split('@')[0] || 'Unknown'; }
        }
        const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
        container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};">
            <strong>${escapeHtml(job?.title||'Unknown Job')}</strong>
            ${job?.location?`<p>📍 ${escapeHtml(job.location)}</p>`:''}
            <p>${escapeHtml(job?.description||'')}</p>
            <small>Employer: ${escapeHtml(employerName)}</small>
            <br><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
            <br><span style="color:${sc};">Status: ${a.status}</span>
            ${a.status==='accepted'?`<div style="margin-top:10px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;"><h4 style="color:#10B981;">Accepted!</h4><p>📧 ${escapeHtml(employerEmail)}</p><button class="btn-primary contact-poster-btn" data-email="${escapeHtml(employerEmail)}" data-name="${escapeHtml(employerName)}" style="font-size:12px;padding:8px 16px;margin-top:6px;"><i class="fas fa-envelope"></i> Message ${escapeHtml(employerName)}</button></div>`:''}
            ${a.status==='rejected'?`<p style="color:#dc2626;">Not accepted.</p>`:''}
            ${a.status==='pending'?`<p style="color:#f59e0b;">⏳ Waiting review...</p>`:''}
        </div>`;
    }
}

async function updateApplicationStatus(appId, status) { 
    await db.from('job_applications').update({ status }).eq('id', appId); 
    showToast(`Application ${status}!`); 
    loadApplications(); loadMyApplications();
}

// ────────── Market ──────────
async function loadMarket() {
    const { data: products } = await db.from('products').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('marketList');
    if (!products || products.length === 0) { container.innerHTML = '<p>No products listed.</p>'; return; }
    container.innerHTML = products.map(p => `<div class="product-item">${p.image_url?`<img src="${p.image_url}" style="max-width:100px;border-radius:10px;">`:''}<strong>${escapeHtml(p.name)}</strong> - ${escapeHtml(p.price)}${p.location?`<br><small>📍 ${escapeHtml(p.location)}</small>`:''}<br><small>${escapeHtml(p.category)}</small>${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="product" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');
}

async function addProduct(name, price, category, location, imageFile) {
    if (!currentUser) return showToast('Please login', true);
    let imageUrl = null;
    if (imageFile) {
        const fp = `products/${Date.now()}_${imageFile.name}`;
        const { error } = await db.storage.from('avatars').upload(fp, imageFile);
        if (!error) { const { data } = db.storage.from('avatars').getPublicUrl(fp); if (data) imageUrl = data.publicUrl; }
    }
    await db.from('products').insert({ user_id: currentUser.id, name, price, category, location, image_url: imageUrl });
    showToast('Product listed!'); loadMarket();
}

async function deleteProduct(id) { await db.from('products').delete().eq('id', id); showToast('Deleted'); loadMarket(); }

// ────────── Messages ──────────
async function loadMessages() {
    if (!currentUser) return;
    const { data: msgs } = await db.from('messages').select('*').or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`).order('created_at', { ascending: false });
    const container = document.getElementById('messagesList');
    if (!msgs || msgs.length === 0) { container.innerHTML = '<p>No messages yet.</p>'; return; }
    container.innerHTML = msgs.map(m => `<div class="msg-item"><strong>${escapeHtml(m.text)}</strong><br><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('');
}

async function sendMessage(toEmail, text) {
    if (!currentUser) return showToast('Please login', true);
    const { data: users } = await db.from('profiles').select('id').eq('email', toEmail).limit(1);
    if (!users || users.length === 0) return showToast('User not found', true);
    await db.from('messages').insert({ from_user_id: currentUser.id, to_user_id: users[0].id, text });
    showToast('Message sent!'); loadMessages();
}

// ────────── Tutorials ──────────
async function loadTutorials() {
    const { data: tuts } = await db.from('tutorials').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('videosList');
    if (!tuts || tuts.length === 0) { container.innerHTML = '<p>No tutorials shared yet.</p>'; return; }
    container.innerHTML = tuts.map(t => `<div class="tutorial-item"><i class="fas fa-play-circle" style="color:#10B981;"></i> <strong>${escapeHtml(t.title)}</strong><br><a href="${escapeHtml(t.url)}" target="_blank">Watch Tutorial →</a><p>${escapeHtml(t.description||'')}</p>${currentUser&&currentUser.id===t.user_id?`<button class="delete-btn" data-type="tutorial" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');
}

async function addTutorial(title, url, description) {
    if (!currentUser) return showToast('Please login', true);
    await db.from('tutorials').insert({ user_id: currentUser.id, title, url, description });
    showToast('Tutorial shared!'); loadTutorials(); loadDashboardStats();
}

async function deleteTutorial(id) { await db.from('tutorials').delete().eq('id', id); showToast('Deleted'); loadTutorials(); }

// ────────── Calendar ──────────
async function loadCalendar() {
    if (!currentUser) return;
    const { data: events } = await db.from('calendar_events').select('*').eq('user_id', currentUser.id).order('event_date', { ascending: true });
    const container = document.getElementById('calendarList');
    if (!events || events.length === 0) { container.innerHTML = '<p>No events yet.</p>'; return; }
    container.innerHTML = events.map(e => `<div class="record-item"><strong>${escapeHtml(e.title)}</strong> - ${e.event_date}<br><small>${escapeHtml(e.notes||'')}</small><button class="delete-btn" data-type="calendar" data-id="${e.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
}

async function addEvent() {
    if (!currentUser) return;
    const title = document.getElementById('eventTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    if (!title || !date) return showToast('Title and date required', true);
    await db.from('calendar_events').insert({ user_id: currentUser.id, title, event_date: date, notes: document.getElementById('eventNotes').value });
    showToast('Event added!');
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    loadCalendar();
}

async function deleteCalendarEvent(id) { await db.from('calendar_events').delete().eq('id', id); showToast('Deleted'); loadCalendar(); }

// ────────── Calculator ──────────
function calculateYield() {
    const crop = document.getElementById('cropType').value;
    const area = parseFloat(document.getElementById('areaInput').value);
    const yields = { maize: 3.5, rice: 4.2, wheat: 2.8, beans: 1.2 };
    document.getElementById('yieldResult').textContent = (area > 0) ? `Estimated: ${(area * yields[crop]).toFixed(1)} tons` : 'Enter valid area.';
}

// ────────── Search (UPDATED - includes user search) ──────────
async function globalSearch(term, category, dateFrom, dateTo) {
    const q = `%${term}%`;
    const results = [];
    
    // Search forum posts
    if (category==='all'||category==='forum') {
        const { data } = await db.from('forum_posts').select('content,created_at,user_id').ilike('content',q).limit(5);
        if (data) data.forEach(r => {
            if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) {
                results.push({ type: 'Forum Post', text: r.content?.substring(0,100), date: r.created_at });
            }
        });
    }
    
    // Search farm records
    if (category==='all'||category==='records') {
        const { data } = await db.from('farm_records').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => {
            if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) {
                results.push({ type: 'Farm Record', text: r.title, date: r.created_at });
            }
        });
    }
    
    // Search jobs
    if (category==='all'||category==='jobs') {
        const { data } = await db.from('job_listings').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => {
            if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) {
                results.push({ type: 'Job', text: r.title, date: r.created_at });
            }
        });
    }
    
    // Search tutorials
    if (category==='all'||category==='tutorials') {
        const { data } = await db.from('tutorials').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => {
            if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) {
                results.push({ type: 'Tutorial', text: r.title, date: r.created_at });
            }
        });
    }
    
    // NEW: Search users/profiles
    if (category==='all') {
        const { data: users } = await db.from('profiles').select('display_name,email,phone,location,created_at').ilike('display_name',q).limit(10);
        if (users) users.forEach(u => {
            results.push({ 
                type: 'User', 
                text: `${u.display_name || 'User'} (${u.email || 'No email'})${u.location ? ' - ' + u.location : ''}${u.phone ? ' - ' + u.phone : ''}`,
                date: u.created_at 
            });
        });
        
        // Also search by email if no display_name matches found
        if (results.filter(r => r.type === 'User').length === 0) {
            const { data: usersByEmail } = await db.from('profiles').select('display_name,email,phone,location,created_at').ilike('email',q).limit(5);
            if (usersByEmail) usersByEmail.forEach(u => {
                results.push({ 
                    type: 'User', 
                    text: `${u.display_name || 'User'} (${u.email || 'No email'})${u.location ? ' - ' + u.location : ''}${u.phone ? ' - ' + u.phone : ''}`,
                    date: u.created_at 
                });
            });
        }
    }
    
    // Display results
    const container = document.getElementById('searchResults');
    if (results.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;">No matches found. Try a different search term.</p>';
        return;
    }
    
    // Sort by date
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = results.map(r => `
        <div style="padding:12px;margin-bottom:8px;background:var(--card-bg);border-radius:12px;border-left:3px solid var(--accent);">
            <span style="font-size:0.7rem;color:var(--accent);font-weight:600;">${r.type}</span>
            <p style="margin:4px 0;">${escapeHtml(r.text)}</p>
            <small style="color:var(--text-secondary);">${r.date ? new Date(r.date).toLocaleDateString() : ''}</small>
        </div>
    `).join('');
}

// ────────── Chat ──────────
async function wikiAnswer(question) {
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}?redirect=true`);
        const data = await res.json();
        return data.extract ? data.extract.substring(0, 550) : 'No info found.';
    } catch { return 'Connection error.'; }
}

// ────────── Profile ──────────
async function loadProfile() {
    if (!currentUser) { document.getElementById('profileContent').innerHTML = '<p>Please login to see your profile.</p>'; return; }
    const { data: pd } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
    const displayName = pd?.display_name?.trim() || currentUser.email?.split('@')[0] || 'Farmer';
    
    document.getElementById('profileName').textContent = displayName;
    document.getElementById('profileEmail').textContent = currentUser.email || 'No email';
    document.getElementById('profilePhone').textContent = '📱 Phone: ' + (pd?.phone || 'Not set');
    document.getElementById('profileLocation').textContent = '📍 Location: ' + (pd?.location || 'Not set');
    document.getElementById('profileBio').textContent = '💬 ' + (pd?.bio || 'No bio yet');
    document.getElementById('profileSince').textContent = pd?.created_at ? 'Member since: ' + new Date(pd.created_at).toLocaleDateString() : '';
    
    document.getElementById('editDisplayName').value = pd?.display_name || '';
    document.getElementById('editPhone').value = pd?.phone || '';
    document.getElementById('editLocation').value = pd?.location || '';
    document.getElementById('editBio').value = pd?.bio || '';
    
    const { count: fc } = await db.from('forum_posts').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: rc } = await db.from('farm_records').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: jc } = await db.from('job_listings').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: pc } = await db.from('products').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: tc } = await db.from('tutorials').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    
    document.getElementById('profileForumCount').textContent = fc || 0;
    document.getElementById('profileRecordsCount').textContent = rc || 0;
    document.getElementById('profileJobsCount').textContent = jc || 0;
    document.getElementById('profileProductsCount').textContent = pc || 0;
    document.getElementById('profileTutorialsCount').textContent = tc || 0;
    
    document.getElementById('avatarUpload').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const { error } = await db.storage.from('avatars').upload(`${currentUser.id}/profile.jpg`, file, { upsert: true });
        if (!error) { document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl; showToast('Profile picture updated!'); }
    };
}

// ═══════════════════════════════════════════
// REAL HSV COLOR ANALYSIS
// ═══════════════════════════════════════════

function analyzeLeafColors(imageData) {
    const pixels = imageData.data;
    let total = 0, green = 0, yellow = 0, brown = 0, dark = 0, white = 0, darkSpots = 0;
    for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
        let h = 0;
        if (diff > 0) { if (max === r) h = ((g - b) / diff) % 6; else if (max === g) h = (b - r) / diff + 2; else h = (r - g) / diff + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
        const s = max > 0 ? (diff / max) * 100 : 0;
        const v = (max / 255) * 100;
        total++;
        if (h >= 60 && h <= 170 && s > 15 && v > 20) green++;
        else if (h >= 35 && h <= 65 && s > 20 && v > 40) yellow++;
        else if (h >= 10 && h <= 40 && s > 30 && v > 10 && v < 70) brown++;
        else if (v < 25 && s < 30) { dark++; if (dark % 3 === 0) darkSpots++; }
        else if (s < 15 && v > 70) white++;
    }
    return { greenPct: total ? +(green/total*100).toFixed(1) : 0, yellowPct: total ? +(yellow/total*100).toFixed(1) : 0, brownPct: total ? +(brown/total*100).toFixed(1) : 0, darkPct: total ? +(dark/total*100).toFixed(1) : 0, whitePct: total ? +(white/total*100).toFixed(1) : 0, darkSpots };
}

function diagnoseFromColors(c) {
    const symptoms = [], issues = [];
    let score = 0, conf = 0;
    if (c.brownPct > 5 && c.darkSpots > 3) { symptoms.push({ text: 'Brown holes', found: true }); issues.push('Possible FAW'); score += 3; conf += 25; }
    else if (c.brownPct > 3) { symptoms.push({ text: 'Minor spots', found: true }); score += 1; conf += 10; }
    else { symptoms.push({ text: 'No brown damage', found: false }); conf += 15; }
    if (c.yellowPct > 10) { symptoms.push({ text: 'Yellow >10%', found: true }); issues.push('Deficiency'); score += 2; conf += 20; }
    else if (c.yellowPct > 5) { symptoms.push({ text: 'Slight yellow', found: true }); score += 1; conf += 10; }
    else { symptoms.push({ text: 'No yellow', found: false }); conf += 10; }
    if (c.greenPct < 50) { symptoms.push({ text: 'Low chlorophyll', found: true }); issues.push('Stressed'); score += 2; conf += 15; }
    else { symptoms.push({ text: 'Healthy green', found: false }); conf += 20; }
    if (c.whitePct > 8) { symptoms.push({ text: 'White patches', found: true }); issues.push('Mildew'); score += 2; conf += 15; }
    else { symptoms.push({ text: 'No mildew', found: false }); conf += 5; }
    return { symptoms, issues, plant: c.greenPct > 60 ? 'Healthy' : c.greenPct > 40 ? 'Stressed' : 'Broadleaf', confidence: Math.min(conf, 95), recommendation: score >= 5 ? 'URGENT: Treat!' : score >= 3 ? 'Monitor.' : score >= 1 ? 'Minor.' : 'Healthy.', severity: score, colors: c };
}

// ═══════════════════════════════════════════
// CROP DATABASE
// ═══════════════════════════════════════════

const CROP_DB = {
    maize: { name: 'Maize', pests: { fall_armyworm: { name: 'Fall Armyworm', severity: 'high', lossPct: 15, dosage: 200, note: 'Most destructive during vegetative stage.' }, stalk_borer: { name: 'Stalk Borer', severity: 'high', lossPct: 20, dosage: 150, note: 'Apply at knee-high stage.' }, aphids: { name: 'Aphids', severity: 'medium', lossPct: 8, dosage: 100, note: 'Check under leaves.' } }, yieldValue: 2533 },
    tomato: { name: 'Tomato', pests: { late_blight: { name: 'Late Blight', severity: 'critical', lossPct: 30, dosage: 300, note: 'Spreads rapidly in cool wet conditions.' }, aphids: { name: 'Aphids', severity: 'medium', lossPct: 10, dosage: 250, note: 'Also transmits viruses.' } }, yieldValue: 5000 },
    rice: { name: 'Rice', pests: { blast: { name: 'Rice Blast', severity: 'high', lossPct: 25, dosage: 180, note: 'Favored by high nitrogen.' } }, yieldValue: 3200 },
    beans: { name: 'Beans', pests: { aphids: { name: 'Aphids', severity: 'medium', lossPct: 12, dosage: 120, note: 'Check flowering stage.' } }, yieldValue: 1800 },
    cabbage: { name: 'Cabbage', pests: { diamondback_moth: { name: 'Diamondback Moth', severity: 'high', lossPct: 22, dosage: 160, note: 'Rotate chemicals.' } }, yieldValue: 2800 }
};

// ═══════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════

let currentSensorGPS = null;
let currentSensorLight = null;
let sensorScans = [];
let savedChems = JSON.parse(localStorage.getItem('agrimind_chems') || '[]');
let scoutingActive = false;
let scoutSteps = 0, scoutScans = 0, scoutInfections = 0, scoutDist = 0;
let scoutLastStep = Date.now(), scoutLastAccel = { x: 0, y: 0, z: 0 };
let scoutTimer = null, scoutStepsSinceScan = 0, scoutPendingScan = false;

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
    const el = document.getElementById(pageId);
    if (el) el.classList.add('active-page');
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    const nav = document.querySelector(`.nav-links li[data-page="${pageId}"]`);
    if (nav) nav.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    switch(pageId){
        case 'forum': loadForum(); break;
        case 'groups': loadGroups(); break;
        case 'records': loadRecords(); break;
        case 'jobs': loadJobs(); break;
        case 'applications': loadApplications(); break;
        case 'myapplications': loadMyApplications(); break;
        case 'market': loadMarket(); break;
        case 'messages': loadMessages(); break;
        case 'tutorials': loadTutorials(); break;
        case 'profile': loadProfile(); break;
        case 'calendar': loadCalendar(); break;
        case 'dashboard': loadDashboardStats(); break;
    }
}

function showPhonePage(pageId, btn) {
    showPage(pageId);
    document.querySelectorAll('.phone-nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════
// FARM MATH, SENSOR HUB, AUTO-SCOUT
// ═══════════════════════════════════════════

function populatePests() {
    const pestSelect = document.getElementById('mathPest');
    pestSelect.innerHTML = '';
    Object.entries(CROP_DB[document.getElementById('mathCrop').value].pests).forEach(([key, pest]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${pest.name} (${pest.severity.toUpperCase()})`;
        pestSelect.appendChild(opt);
    });
    updateDosageFromPest(); updateCostPerMl();
}
function updateDosageFromPest() { const d = CROP_DB[document.getElementById('mathCrop').value].pests[document.getElementById('mathPest').value]; if (d) document.getElementById('mathDosage').value = d.dosage; }
function updateCostPerMl() { document.getElementById('mathCostPerMl').textContent = 'K' + ((parseFloat(document.getElementById('mathContPrice').value)||150) / (parseFloat(document.getElementById('mathContSize').value)||250)).toFixed(2); }
function updateFarmSlider() { document.getElementById('mathFarmDisplay').textContent = parseFloat(document.getElementById('mathFarmSlider').value).toFixed(1); }
function saveChemical() {
    const chem = { name: document.getElementById('mathChemName').value.trim(), size: document.getElementById('mathContSize').value, price: document.getElementById('mathContPrice').value, dosage: document.getElementById('mathDosage').value, unit: document.getElementById('mathDosageUnit').value };
    if (!chem.name) { showToast('Enter name', true); return; }
    const idx = savedChems.findIndex(c => c.name.toLowerCase() === chem.name.toLowerCase());
    if (idx >= 0) savedChems[idx] = chem; else savedChems.push(chem);
    if (savedChems.length > 10) savedChems.shift();
    localStorage.setItem('agrimind_chems', JSON.stringify(savedChems));
    showToast('Saved!'); renderSavedChems();
}
function loadChem(idx) { const c = savedChems[idx]; document.getElementById('mathChemName').value = c.name; document.getElementById('mathContSize').value = c.size; document.getElementById('mathContPrice').value = c.price; document.getElementById('mathDosage').value = c.dosage; document.getElementById('mathDosageUnit').value = c.unit; updateCostPerMl(); }
function deleteChem(idx) { savedChems.splice(idx, 1); localStorage.setItem('agrimind_chems', JSON.stringify(savedChems)); renderSavedChems(); }
function renderSavedChems() {
    if (savedChems.length === 0) { document.getElementById('savedChems').style.display = 'none'; return; }
    document.getElementById('savedChems').style.display = 'block';
    document.getElementById('savedChems').innerHTML = '<label style="color:var(--accent);">Saved</label>' + savedChems.map((c, i) => `<div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--input-bg);border-radius:10px;margin-bottom:4px;font-size:0.8rem;"><span><strong>${escapeHtml(c.name)}</strong></span><div><button class="btn-outline" onclick="loadChem(${i})" style="padding:2px 8px;font-size:0.65rem;">Load</button><button onclick="deleteChem(${i})" style="background:none;border:1px solid var(--danger);color:var(--danger);border-radius:4px;padding:2px 6px;font-size:0.65rem;margin-left:4px;">X</button></div></div>`).join('');
}
function calcFarmMath() {
    const crop = document.getElementById('mathCrop').value, pestKey = document.getElementById('mathPest').value;
    const contSize = parseFloat(document.getElementById('mathContSize').value)||250, contPrice = parseFloat(document.getElementById('mathContPrice').value)||150;
    const dosage = parseFloat(document.getElementById('mathDosage').value)||200, unit = document.getElementById('mathDosageUnit').value;
    const farmSize = parseFloat(document.getElementById('mathFarmSlider').value);
    const pestData = CROP_DB[crop].pests[pestKey], cropData = CROP_DB[crop];
    let dph = dosage; if (unit==='acre') dph*=2.471; else if (unit==='20L') dph*=5;
    const totalMl = dph*farmSize, totalCost = totalMl*(contPrice/contSize), potentialLoss = cropData.yieldValue*farmSize*(pestData.lossPct/100);
    document.getElementById('mathResult').innerHTML = `<div class="math-result"><h3 style="color:var(--accent);">${cropData.name} x ${pestData.name}</h3><div class="grid-2cols"><div>${totalMl.toFixed(1)}ml</div><div>${Math.ceil(totalMl/contSize)} bottles</div><div>K${totalCost.toFixed(2)}</div><div>K${(potentialLoss-totalCost).toFixed(2)} saved</div></div></div>`;
    showToast('Done!');
}

function analyzeLeaf(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            const ratio = Math.min(400/img.width, 400/img.height);
            canvas.width = img.width*ratio; canvas.height = img.height*ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const colors = analyzeLeafColors(ctx.getImageData(0,0,canvas.width,canvas.height));
            const diagnosis = diagnoseFromColors(colors);
            if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => { currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }; });
            sensorScans.push({ id: Date.now(), timestamp: new Date().toISOString(), gps: currentSensorGPS, diagnosis });
            document.getElementById('cameraPreview').innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:20px;"><p><strong>${diagnosis.plant}</strong> (${diagnosis.confidence}%)</p><p>${diagnosis.recommendation}</p>`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function getGPS() { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => { currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }; document.getElementById('gpsLabel').textContent = `${currentSensorGPS.lat.toFixed(3)}, ${currentSensorGPS.lon.toFixed(3)}`; }); }
function checkLight() { document.getElementById('lightLabel').textContent = 'Checked'; }
function toggleScanMap() { document.getElementById('scanMapDiv').style.display = document.getElementById('scanMapDiv').style.display==='none'?'block':'none'; }
function updateScanMapUI() {
    if (!sensorScans.length) { document.getElementById('scanMapList').innerHTML = '<p>No scans</p>'; return; }
    document.getElementById('scanMapList').innerHTML = sensorScans.map(s => `<div style="padding:8px;border-bottom:1px solid var(--border);"><strong>${s.diagnosis.plant}</strong></div>`).join('');
}

async function startScout() {
    scoutingActive = true; scoutSteps = 0; scoutScans = 0; scoutInfections = 0; scoutDist = 0; scoutStepsSinceScan = 0; scoutPendingScan = false;
    document.getElementById('startScoutBtn').style.display = 'none'; document.getElementById('stopScoutBtn').style.display = 'inline-block';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3 style="color:var(--accent);">Scouting</h3>';
    if (window.DeviceMotionEvent) window.addEventListener('devicemotion', detectStep);
    scoutTimer = setInterval(() => { if (scoutingActive) checkForScanPrompt(); }, 2000);
}
function stopScout() {
    scoutingActive = false; clearInterval(scoutTimer); window.removeEventListener('devicemotion', detectStep);
    document.getElementById('startScoutBtn').style.display = 'inline-block'; document.getElementById('stopScoutBtn').style.display = 'none';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3>Stopped</h3>';
    document.getElementById('scoutReport').innerHTML = `<div class="math-result"><h3>Report</h3><p>Photos: ${scoutScans} | Steps: ${scoutSteps} | ${scoutDist}m</p></div>`;
}
function detectStep(e) {
    if (!scoutingActive) return;
    const a = e.accelerationIncludingGravity; if (!a) return;
    if (Math.sqrt(a.x**2+a.y**2+a.z**2) > 12 && (Math.abs(a.x-scoutLastAccel.x)>3||Math.abs(a.y-scoutLastAccel.y)>3)) {
        if (Date.now()-scoutLastStep > 300) { scoutSteps++; scoutStepsSinceScan++; scoutDist = (scoutSteps*0.75).toFixed(1); document.getElementById('scoutSteps').textContent = scoutSteps; document.getElementById('scoutDist').textContent = scoutDist+'m'; scoutLastStep = Date.now(); }
    }
    scoutLastAccel = { x: a.x, y: a.y, z: a.z };
}
function checkForScanPrompt() { if (scoutingActive && !scoutPendingScan && scoutStepsSinceScan >= 2) { scoutPendingScan = true; showScanPrompt(); } }
function showScanPrompt() { document.getElementById('promptStepNum').textContent = scoutSteps; document.getElementById('scoutPrompt').style.display = 'block'; if (navigator.vibrate) navigator.vibrate([300,200,300]); }
function captureScoutPhoto() { document.getElementById('scoutCamera').click(); }
function handleScoutPhoto(event) {
    if (!event.target.files[0]) { scoutPendingScan = false; document.getElementById('scoutPrompt').style.display = 'none'; return; }
    scoutScans++; scoutStepsSinceScan = 0; document.getElementById('scoutScans').textContent = scoutScans;
    document.getElementById('scoutPrompt').style.display = 'none'; scoutPendingScan = false; event.target.value = '';
}

// ═══════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════

function openModal(mode) { document.getElementById('modalTitle').innerText = mode==='login'?'Welcome Back':'Create Account'; document.getElementById('authDisplayName').style.display = mode==='login'?'none':'block'; document.getElementById('authModal').style.display = 'flex'; }
function closeModal() { document.getElementById('authModal').style.display = 'none'; }

// ═══════════════════════════════════════════
// DOM READY
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('hamburgerBtn').addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('active'); });
    document.getElementById('sidebarOverlay').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('active'); });
    document.getElementById('navLinks').addEventListener('click', e => { const li = e.target.closest('li'); if (li?.dataset.page) { e.preventDefault(); showPage(li.dataset.page); } });

    document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
    document.getElementById('signupBtn').addEventListener('click', () => openModal('signup'));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    let authMode = 'login';
    document.getElementById('loginBtn').addEventListener('click', () => { authMode = 'login'; });
    document.getElementById('signupBtn').addEventListener('click', () => { authMode = 'signup'; });
    document.getElementById('authSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('authEmail').value.trim(), password = document.getElementById('authPass').value, displayName = document.getElementById('authDisplayName').value.trim();
        try { if (authMode==='login') await login(email, password); else { if (!displayName) return showToast('Name required', true); await signUp(email, password, displayName); } closeModal(); } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('userGreeting').addEventListener('click', logout);

    document.querySelector('.main-content').addEventListener('click', async (e) => {
        const t = e.target;
        if (t.closest('#postForumBtn')) { const c = document.getElementById('forumContent').value.trim(); if (c) { addForumPost(c, document.getElementById('forumImage').files[0]); document.getElementById('forumContent').value = ''; } }
        if (t.closest('#createGroupBtn')) createGroup();
        if (t.closest('#addRecordBtn')) { const tt = document.getElementById('recordTitle').value.trim(); if (tt) { addRecord(tt, document.getElementById('recordDetail').value, document.getElementById('recordLocation').value); document.getElementById('recordTitle').value = ''; } }
        if (t.closest('#postJobBtn')) { const tt = document.getElementById('jobTitle').value.trim(); if (tt) { addJob(tt, document.getElementById('jobDesc').value, document.getElementById('jobLocation').value); document.getElementById('jobTitle').value = ''; } }
        if (t.closest('#sendMsgBtn')) { const to = document.getElementById('msgTo').value.trim(), tx = document.getElementById('msgText').value.trim(); if (to&&tx) sendMessage(to, tx); }
        if (t.closest('#addEventBtn')) addEvent();
        if (t.closest('#calcYieldBtn')) calculateYield();
        if (t.closest('#addVideoBtn')) { const tt = document.getElementById('videoTitle').value.trim(), u = document.getElementById('videoUrl').value.trim(); if (tt&&u) addTutorial(tt, u, document.getElementById('videoDesc').value); }
        if (t.closest('#doSearchBtn')) { const term = document.getElementById('searchInput').value.trim(); if (term) globalSearch(term, document.getElementById('searchCategory').value, document.getElementById('searchDateFrom').value, document.getElementById('searchDateTo').value); }
        if (t.closest('#saveProfileBtn')) { if (!currentUser) return; const dn = document.getElementById('editDisplayName').value.trim(); await db.from('profiles').update({ display_name: dn, phone: document.getElementById('editPhone').value, location: document.getElementById('editLocation').value, bio: document.getElementById('editBio').value }).eq('id', currentUser.id); currentUser.displayName = dn||currentUser.displayName; updateAuthUI(); showToast('Updated!'); loadProfile(); }
        if (t.closest('#sendChatBtn')) { const input = document.getElementById('chatInput').value.trim(); if (!input) return; const chat = document.getElementById('chatMessages'); chat.innerHTML += `<div class="message-bubble user-msg">${escapeHtml(input)}</div>`; document.getElementById('chatInput').value = ''; chat.innerHTML += `<div class="message-bubble bot-msg">${escapeHtml(await wikiAnswer(input))}</div>`; chat.scrollTop = chat.scrollHeight; }
        const del = t.closest('.delete-btn'); if (del) { if (!currentUser) return showToast('Login first', true); if (!confirm('Delete?')) return; const { type, id } = del.dataset; if (type==='forum') deleteForumPost(id); else if (type==='record') deleteRecord(id); else if (type==='job') deleteJob(id); else if (type==='product') deleteProduct(id); else if (type==='tutorial') deleteTutorial(id); else if (type==='calendar') deleteCalendarEvent(id); }
        if (t.closest('.apply-btn')) { e.preventDefault(); applyToJob(t.closest('.apply-btn').dataset.job); }
        if (t.closest('.accept-app')) updateApplicationStatus(t.closest('.accept-app').dataset.id, 'accepted');
        if (t.closest('.reject-app')) updateApplicationStatus(t.closest('.reject-app').dataset.id, 'rejected');
        const ct = t.closest('.contact-applicant-btn') || t.closest('.contact-poster-btn'); if (ct) { document.getElementById('msgTo').value = ct.dataset.email; document.getElementById('msgText').value = `Hello ${ct.dataset.name}, `; showPage('messages'); }
    });

    const mc = document.getElementById('mathCrop'); if (mc) { mc.addEventListener('change', populatePests); document.getElementById('mathPest').addEventListener('change', updateDosageFromPest); document.getElementById('mathContSize').addEventListener('input', updateCostPerMl); document.getElementById('mathContPrice').addEventListener('input', updateCostPerMl); document.getElementById('mathDosage').addEventListener('input', updateCostPerMl); document.getElementById('mathDosageUnit').addEventListener('change', updateCostPerMl); populatePests(); updateCostPerMl(); renderSavedChems(); }
    document.getElementById('marketCategoryFilter')?.addEventListener('change', loadMarket);
    document.getElementById('addProductBtn')?.addEventListener('click', () => { const n = document.getElementById('productName').value.trim(), p = document.getElementById('productPrice').value.trim(); if (n&&p) addProduct(n, p, document.getElementById('productCategory').value, document.getElementById('productLocation').value, document.getElementById('productImage').files[0]); });

    checkSession(); showPage('dashboard');
});
