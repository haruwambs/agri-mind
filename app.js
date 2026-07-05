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

// ────────── Auth ──────────
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
        // Get the full profile
        const { data: profile } = await db.from('profiles').select('*').eq('id', session.user.id).single();
        
        // Use display_name if it exists and is not empty, otherwise use email prefix, then fallback
        let displayName = 'Farmer';
        if (profile?.display_name && profile.display_name.trim() !== '') {
            displayName = profile.display_name;
        } else if (session.user.email) {
            displayName = session.user.email.split('@')[0];
        }
        
        currentUser = { 
            id: session.user.id, 
            email: session.user.email, 
            displayName: displayName,
            profile: profile || {}
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
    
    // Save the display_name to profiles table
    await db.from('profiles').upsert({ 
        id: data.user.id, 
        display_name: displayName, 
        email: email 
    });
    
    // Force a refresh to get the profile
    await checkSession();
    showToast(`Welcome, ${displayName}!`);
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
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkSession();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        updateAuthUI();
    }
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
            const { data: pf } = await db.from('profiles').select('display_name').eq('id', p.user_id).single(); 
            if (pf?.display_name) dn = pf.display_name;
            else if (pf?.email) dn = pf.email.split('@')[0];
        }
        const postDiv = document.createElement('div');
        postDiv.className = 'forum-post';
        postDiv.innerHTML = `<strong>${escapeHtml(dn)}</strong><small>${new Date(p.created_at).toLocaleString()}</small><p>${escapeHtml(p.content)}</p>${p.image_url?`<img src="${p.image_url}" style="max-width:100%;border-radius:12px;margin:8px 0;">`:''}${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}<button class="btn-outline reply-toggle" data-post="${p.id}">Reply</button>`;
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

async function deleteForumPost(id) {
    await db.from('forum_posts').delete().eq('id', id);
    showToast('Deleted'); loadForum(); loadDashboardStats();
}

// ────────── Groups ──────────
async function loadGroups() {
    const { data: groups } = await db.from('groups').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('groupsList');
    if (!groups || groups.length === 0) { container.innerHTML = '<p>No groups yet. Create one!</p>'; return; }
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
        // Get poster's display name
        let posterName = 'Anonymous';
        if (j.user_id) {
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', j.user_id).single();
            if (pf?.display_name) posterName = pf.display_name;
            else if (pf?.email) posterName = pf.email.split('@')[0];
        }
        
        const isOwner = currentUser && currentUser.id === j.user_id;
        const hasApplied = currentUser && !isOwner;
        
        container.innerHTML += `<div class="job-item">
            <strong>${escapeHtml(j.title)}</strong>
            <p>${escapeHtml(j.description||'')}</p>
            ${j.location?`<p>📍 ${escapeHtml(j.location)}</p>`:''}
            <small>Posted by: ${escapeHtml(posterName)}</small>
            ${isOwner ? `<button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
            ${hasApplied ? `<button class="btn-outline apply-btn" data-job="${j.id}" style="margin-left:8px;">Apply Now</button>` : ''}
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
    
    // Check if already applied
    const { data: existing } = await db.from('job_applications').select('*').match({ job_id: parseInt(jobId), applicant_id: currentUser.id });
    if (existing && existing.length > 0) { 
        showToast('You already applied to this job', true); 
        return; 
    }
    
    const msg = prompt('Add a message with your application (optional):');
    const { error } = await db.from('job_applications').insert({ 
        job_id: parseInt(jobId), 
        applicant_id: currentUser.id, 
        applicant_message: msg || 'I am interested in this position.',
        message: msg || 'I am interested.',
        status: 'pending' 
    });
    
    if (error) { 
        showToast('Failed to apply: ' + error.message, true); 
        return; 
    }
    
    showToast('Application submitted successfully!');
    loadJobs();
}

// ────────── My Applications (FIXED - shows poster info) ──────────
async function loadMyApplications() {
    if (!currentUser) return;
    const container = document.getElementById('myApplicationsList');
    
    // Get all applications by this user
    const { data: apps } = await db.from('job_applications')
        .select('*')
        .eq('applicant_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    if (!apps || apps.length === 0) { 
        container.innerHTML = '<p>You haven\'t applied to any jobs yet.</p>'; 
        return; 
    }
    
    container.innerHTML = '';
    
    for (const a of apps) {
        // Get the job details
        const { data: job } = await db.from('job_listings')
            .select('title,description,location,user_id')
            .eq('id', a.job_id)
            .single();
        
        // Get the poster's profile
        let posterName = 'Unknown';
        let posterEmail = 'N/A';
        let posterPhone = 'N/A';
        
        if (job?.user_id) {
            const { data: pf } = await db.from('profiles')
                .select('display_name,email,phone')
                .eq('id', job.user_id)
                .single();
            if (pf) {
                posterName = pf.display_name || pf.email?.split('@')[0] || 'Unknown';
                posterEmail = pf.email || 'N/A';
                posterPhone = pf.phone || 'N/A';
            }
        }
        
        const statusColor = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
        
        container.innerHTML += `<div class="job-item" style="border-left:5px solid ${statusColor};">
            <strong>${escapeHtml(job?.title || 'Unknown Job')}</strong>
            ${job?.location ? `<p>📍 ${escapeHtml(job.location)}</p>` : ''}
            <p>${escapeHtml(job?.description || '')}</p>
            <small>Posted by: ${escapeHtml(posterName)}</small>
            <br><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
            <br><span style="color:${statusColor};font-weight:600;">Status: ${a.status}</span>
            ${a.status === 'accepted' ? `
                <div style="margin-top:8px;padding:10px;background:rgba(16,185,129,0.1);border-radius:8px;">
                    <p><strong>📧 Email:</strong> ${escapeHtml(posterEmail)}</p>
                    <p><strong>📱 Phone:</strong> ${escapeHtml(posterPhone)}</p>
                    <button class="btn-primary contact-poster-btn" data-email="${escapeHtml(posterEmail)}" data-name="${escapeHtml(posterName)}" style="font-size:12px;padding:6px 14px;margin-top:8px;">
                        <i class="fas fa-envelope"></i> Contact ${escapeHtml(posterName)}
                    </button>
                </div>
            ` : ''}
        </div>`;
    }
}

// ────────── Applications (for job posters) ──────────
async function loadApplications() {
    if (!currentUser) return;
    const container = document.getElementById('applicationsList');
    
    const { data: myJobs } = await db.from('job_listings').select('id,title').eq('user_id', currentUser.id);
    if (!myJobs || myJobs.length === 0) { 
        container.innerHTML = '<p>No jobs posted yet.</p>'; 
        return; 
    }
    
    container.innerHTML = '';
    
    for (const job of myJobs) {
        const { data: apps } = await db.from('job_applications')
            .select('*')
            .eq('job_id', job.id)
            .order('created_at', { ascending: false });
        
        if (apps && apps.length > 0) {
            container.innerHTML += `<h4 style="color:var(--accent);">📋 ${escapeHtml(job.title)} (${apps.length} applicants)</h4>`;
            
            for (const a of apps) {
                // Get applicant profile
                let applicantName = 'Unknown';
                let applicantEmail = 'N/A';
                let applicantPhone = 'N/A';
                let applicantLocation = 'N/A';
                
                if (a.applicant_id) {
                    const { data: pf } = await db.from('profiles')
                        .select('display_name,email,phone,location')
                        .eq('id', a.applicant_id)
                        .single();
                    if (pf) {
                        applicantName = pf.display_name || pf.email?.split('@')[0] || 'Unknown';
                        applicantEmail = pf.email || 'N/A';
                        applicantPhone = pf.phone || 'N/A';
                        applicantLocation = pf.location || 'N/A';
                    }
                }
                
                const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
                
                container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};">
                    <strong>${escapeHtml(applicantName)}</strong>
                    <br><small>📧 ${escapeHtml(applicantEmail)}</small>
                    ${a.status === 'accepted' ? `
                        <br><small>📱 ${escapeHtml(applicantPhone)}</small>
                        <br><small>📍 ${escapeHtml(applicantLocation)}</small>
                    ` : ''}
                    <br><small>Message: ${escapeHtml(a.applicant_message || 'No message')}</small>
                    <br><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
                    <br><span style="color:${sc};font-weight:600;">Status: ${a.status}</span>
                    ${a.status === 'pending' ? `
                        <div style="margin-top:8px;">
                            <button class="btn-outline accept-app" data-id="${a.id}" style="font-size:12px;padding:4px 12px;margin-right:8px;">✅ Accept</button>
                            <button class="btn-outline reject-app" data-id="${a.id}" style="font-size:12px;padding:4px 12px;border-color:#dc2626;color:#dc2626;">❌ Reject</button>
                        </div>
                    ` : ''}
                    ${a.status === 'accepted' ? `
                        <div style="margin-top:8px;">
                            <button class="btn-primary contact-applicant-btn" data-email="${escapeHtml(applicantEmail)}" data-name="${escapeHtml(applicantName)}" style="font-size:12px;padding:6px 14px;">
                                <i class="fas fa-envelope"></i> Send Message
                            </button>
                        </div>
                    ` : ''}
                </div>`;
            }
        }
    }
    
    if (container.innerHTML === '') container.innerHTML = '<p>No applications received yet.</p>';
}

async function updateApplicationStatus(appId, status) { 
    await db.from('job_applications').update({ status }).eq('id', appId); 
    showToast(`Application ${status}!`); 
    loadApplications();
    loadMyApplications();
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
    container.innerHTML = '';
    for (const m of msgs) {
        let fromName = 'Unknown', toName = 'Unknown';
        if (m.from_user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name').eq('id', m.from_user_id).single(); 
            fromName = pf?.display_name || pf?.email?.split('@')[0] || 'Unknown';
        }
        if (m.to_user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name').eq('id', m.to_user_id).single(); 
            toName = pf?.display_name || pf?.email?.split('@')[0] || 'Unknown';
        }
        container.innerHTML += `<div class="msg-item"><strong>${escapeHtml(fromName)}</strong> → ${escapeHtml(toName)}: ${escapeHtml(m.text)}<br><small>${new Date(m.created_at).toLocaleString()}</small></div>`;
    }
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

// ────────── Search ──────────
async function globalSearch(term, category, dateFrom, dateTo) {
    const q = `%${term}%`;
    let queries = [];
    if (category==='all'||category==='forum') queries.push(db.from('forum_posts').select('content,created_at').ilike('content',q).limit(5));
    if (category==='all'||category==='records') queries.push(db.from('farm_records').select('title,created_at').ilike('title',q).limit(5));
    if (category==='all'||category==='jobs') queries.push(db.from('job_listings').select('title,created_at').ilike('title',q).limit(5));
    if (category==='all'||category==='tutorials') queries.push(db.from('tutorials').select('title,created_at').ilike('title',q).limit(5));
    const resultsArr = await Promise.all(queries);
    const results = [];
    resultsArr.forEach(res => {
        if (res.data) res.data.forEach(r => {
            if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) results.push(r.content||r.title);
        });
    });
    document.getElementById('searchResults').innerHTML = results.length ? results.map(t => `<div style="padding:12px;"><i class="fas fa-search"></i> ${escapeHtml(t.substring(0,100))}</div>`).join('') : '<p>No matches found.</p>';
}

// ────────── Chat ──────────
async function wikiAnswer(question) {
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}?redirect=true`);
        const data = await res.json();
        return data.extract ? data.extract.substring(0, 550) : 'No info found.';
    } catch { return 'Connection error.'; }
}

// ────────── Profile (FIXED - shows display_name) ──────────
async function loadProfile() {
    if (!currentUser) { 
        document.getElementById('profileContent').innerHTML = '<p>Please login to see your profile.</p>'; 
        return; 
    }
    
    const { data: pd } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
    
    // Use display_name if available, fallback to email prefix
    const displayName = pd?.display_name || currentUser.email?.split('@')[0] || 'Farmer';
    
    document.getElementById('profileName').textContent = displayName;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profilePhone').textContent = '📱 Phone: ' + (pd?.phone || 'Not set');
    document.getElementById('profileLocation').textContent = '📍 Location: ' + (pd?.location || 'Not set');
    document.getElementById('profileBio').textContent = '💬 ' + (pd?.bio || 'No bio yet');
    document.getElementById('profileSince').textContent = pd?.created_at ? 'Member since: ' + new Date(pd.created_at).toLocaleDateString() : '';
    
    document.getElementById('editDisplayName').value = pd?.display_name || '';
    document.getElementById('editPhone').value = pd?.phone || '';
    document.getElementById('editLocation').value = pd?.location || '';
    document.getElementById('editBio').value = pd?.bio || '';
    
    try {
        document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;
    } catch(e) {}
    
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
        if (!error) { 
            document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl; 
            showToast('Profile picture updated!'); 
        }
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
        if (diff > 0) {
            if (max === r) h = ((g - b) / diff) % 6;
            else if (max === g) h = (b - r) / diff + 2;
            else h = (r - g) / diff + 4;
            h = Math.round(h * 60);
            if (h < 0) h += 360;
        }
        const s = max > 0 ? (diff / max) * 100 : 0;
        const v = (max / 255) * 100;
        total++;
        if (h >= 60 && h <= 170 && s > 15 && v > 20) green++;
        else if (h >= 35 && h <= 65 && s > 20 && v > 40) yellow++;
        else if (h >= 10 && h <= 40 && s > 30 && v > 10 && v < 70) brown++;
        else if (v < 25 && s < 30) { dark++; if (dark % 3 === 0) darkSpots++; }
        else if (s < 15 && v > 70) white++;
    }
    return {
        greenPct: total ? +(green/total*100).toFixed(1) : 0,
        yellowPct: total ? +(yellow/total*100).toFixed(1) : 0,
        brownPct: total ? +(brown/total*100).toFixed(1) : 0,
        darkPct: total ? +(dark/total*100).toFixed(1) : 0,
        whitePct: total ? +(white/total*100).toFixed(1) : 0,
        darkSpots
    };
}

function diagnoseFromColors(c) {
    const symptoms = [], issues = [];
    let score = 0, conf = 0;
    if (currentSensorLight !== null && currentSensorLight < 100) {
        return { symptoms: [{ text: 'Too dark for analysis', found: true }], issues: ['Insufficient light'], plant: 'Unknown', confidence: 0, recommendation: 'Move to better lighting.', severity: 0, colors: c };
    }
    if (c.brownPct > 5 && c.darkSpots > 3) {
        symptoms.push({ text: 'Brown circular holes detected', found: true });
        issues.push('Possible Fall Armyworm damage'); score += 3; conf += 25;
    } else if (c.brownPct > 3) {
        symptoms.push({ text: 'Minor brown spots', found: true }); score += 1; conf += 10;
    } else { symptoms.push({ text: 'No significant brown damage', found: false }); conf += 15; }
    if (c.yellowPct > 10) {
        symptoms.push({ text: 'Yellow discoloration >10%', found: true });
        issues.push('Possible nutrient deficiency or blight'); score += 2; conf += 20;
    } else if (c.yellowPct > 5) {
        symptoms.push({ text: 'Slight yellowing', found: true }); score += 1; conf += 10;
    } else { symptoms.push({ text: 'No yellow discoloration', found: false }); conf += 10; }
    if (c.greenPct < 50) {
        symptoms.push({ text: 'Low chlorophyll', found: true });
        issues.push('Plant may be stressed'); score += 2; conf += 15;
    } else { symptoms.push({ text: 'Healthy chlorophyll', found: false }); conf += 20; }
    if (c.whitePct > 8) {
        symptoms.push({ text: 'White/powdery patches', found: true });
        issues.push('Possible powdery mildew'); score += 2; conf += 15;
    } else { symptoms.push({ text: 'No powdery mildew signs', found: false }); conf += 5; }
    let plant = c.greenPct > 60 && c.yellowPct < 5 ? 'Healthy Plant' : c.greenPct > 40 ? 'Stressed Crop' : 'Broadleaf Crop';
    conf = Math.min(conf, 95);
    let rec = score >= 5 ? 'URGENT: Apply treatment!' : score >= 3 ? 'Monitor closely.' : score >= 1 ? 'Minor issues.' : 'Plant appears healthy.';
    return { symptoms, issues, plant, confidence: Math.round(conf), recommendation: rec, severity: score, colors: c };
}

// ═══════════════════════════════════════════
// CROP DATABASE
// ═══════════════════════════════════════════

const CROP_DB = {
    maize: { name: 'Maize', pests: { fall_armyworm: { name: 'Fall Armyworm', severity: 'high', lossPct: 15, dosage: 200, chemicals: ['Ampligo','Dudu-Cyber'], organic: ['Neem Oil','Bt'], note: 'Most destructive during vegetative stage.' }, stalk_borer: { name: 'Stalk Borer', severity: 'high', lossPct: 20, dosage: 150, chemicals: ['Dudu-Cyber'], organic: ['Neem Oil'], note: 'Apply at knee-high stage.' }, aphids: { name: 'Aphids', severity: 'medium', lossPct: 8, dosage: 100, chemicals: ['Acetamiprid'], organic: ['Neem Oil'], note: 'Check under leaves.' } }, yieldValue: 2533 },
    tomato: { name: 'Tomato', pests: { late_blight: { name: 'Late Blight', severity: 'critical', lossPct: 30, dosage: 300, chemicals: ['Rocket'], organic: ['Copper spray'], note: 'Spreads rapidly in cool wet conditions.' }, aphids: { name: 'Aphids', severity: 'medium', lossPct: 10, dosage: 250, chemicals: ['Acetamiprid'], organic: ['Neem Oil'], note: 'Also transmits viruses.' } }, yieldValue: 5000 },
    rice: { name: 'Rice', pests: { blast: { name: 'Rice Blast', severity: 'high', lossPct: 25, dosage: 180, chemicals: ['Tricyclazole'], organic: ['Silicon fertilizer'], note: 'Favored by high nitrogen.' } }, yieldValue: 3200 },
    beans: { name: 'Beans', pests: { aphids: { name: 'Aphids', severity: 'medium', lossPct: 12, dosage: 120, chemicals: ['Acetamiprid'], organic: ['Neem Oil'], note: 'Check flowering stage.' } }, yieldValue: 1800 },
    cabbage: { name: 'Cabbage', pests: { diamondback_moth: { name: 'Diamondback Moth', severity: 'high', lossPct: 22, dosage: 160, chemicals: ['Dudu-Cyber'], organic: ['Bt spray'], note: 'Rotate chemicals.' } }, yieldValue: 2800 }
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
let scoutTimer = null, scoutStepsSinceScan = 0;
let scoutPendingScan = false;

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
        case 'sensorhub': updateScanMapUI(); break;
    }
}

function showPhonePage(pageId, btn) {
    showPage(pageId);
    document.querySelectorAll('.phone-nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════
// FARM MATH TOOL
// ═══════════════════════════════════════════

function populatePests() {
    const crop = document.getElementById('mathCrop').value;
    const pestSelect = document.getElementById('mathPest');
    const pests = CROP_DB[crop].pests;
    pestSelect.innerHTML = '';
    Object.entries(pests).forEach(([key, pest]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${pest.name} (${pest.severity.toUpperCase()})`;
        pestSelect.appendChild(opt);
    });
    updateDosageFromPest();
    updateCostPerMl();
}

function updateDosageFromPest() {
    const crop = document.getElementById('mathCrop').value;
    const pest = document.getElementById('mathPest').value;
    const data = CROP_DB[crop].pests[pest];
    if (data) document.getElementById('mathDosage').value = data.dosage;
}

function updateCostPerMl() {
    const size = parseFloat(document.getElementById('mathContSize').value) || 250;
    const price = parseFloat(document.getElementById('mathContPrice').value) || 150;
    document.getElementById('mathCostPerMl').textContent = 'K' + (price / size).toFixed(2);
}

function updateFarmSlider() {
    document.getElementById('mathFarmDisplay').textContent = parseFloat(document.getElementById('mathFarmSlider').value).toFixed(1);
}

function saveChemical() {
    const chem = {
        name: document.getElementById('mathChemName').value.trim(),
        size: document.getElementById('mathContSize').value,
        price: document.getElementById('mathContPrice').value,
        dosage: document.getElementById('mathDosage').value,
        unit: document.getElementById('mathDosageUnit').value
    };
    if (!chem.name) { showToast('Enter chemical name first', true); return; }
    const idx = savedChems.findIndex(c => c.name.toLowerCase() === chem.name.toLowerCase());
    if (idx >= 0) savedChems[idx] = chem; else savedChems.push(chem);
    if (savedChems.length > 10) savedChems.shift();
    localStorage.setItem('agrimind_chems', JSON.stringify(savedChems));
    showToast('Chemical saved!');
    renderSavedChems();
}

function loadChem(idx) {
    const c = savedChems[idx];
    document.getElementById('mathChemName').value = c.name;
    document.getElementById('mathContSize').value = c.size;
    document.getElementById('mathContPrice').value = c.price;
    document.getElementById('mathDosage').value = c.dosage;
    document.getElementById('mathDosageUnit').value = c.unit;
    updateCostPerMl();
}

function deleteChem(idx) { savedChems.splice(idx, 1); localStorage.setItem('agrimind_chems', JSON.stringify(savedChems)); renderSavedChems(); }

function renderSavedChems() {
    if (savedChems.length === 0) { document.getElementById('savedChems').style.display = 'none'; return; }
    document.getElementById('savedChems').style.display = 'block';
    document.getElementById('savedChems').innerHTML = '<label style="color:var(--accent);">Saved Chemicals</label>' + savedChems.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--input-bg);border-radius:12px;margin-bottom:4px;font-size:0.8rem;">
            <span><strong>${escapeHtml(c.name)}</strong> | ${c.size}ml @ K${c.price}</span>
            <div style="display:flex;gap:6px;">
                <button class="btn-outline" onclick="loadChem(${i})" style="padding:4px 10px;font-size:0.7rem;">Load</button>
                <button onclick="deleteChem(${i})" style="background:none;border:1px solid var(--danger);color:var(--danger);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:0.7rem;">X</button>
            </div>
        </div>
    `).join('');
}

function calcFarmMath() {
    const crop = document.getElementById('mathCrop').value;
    const pestKey = document.getElementById('mathPest').value;
    const chemName = document.getElementById('mathChemName').value.trim() || 'Unspecified Chemical';
    const contSize = parseFloat(document.getElementById('mathContSize').value) || 250;
    const contPrice = parseFloat(document.getElementById('mathContPrice').value) || 150;
    const dosage = parseFloat(document.getElementById('mathDosage').value) || 200;
    const unit = document.getElementById('mathDosageUnit').value;
    const farmSize = parseFloat(document.getElementById('mathFarmSlider').value);
    const pestData = CROP_DB[crop].pests[pestKey];
    const cropData = CROP_DB[crop];
    const costPerMl = contPrice / contSize;
    let dosagePerHa = dosage;
    if (unit === 'acre') dosagePerHa = dosage * 2.471;
    else if (unit === '20L') dosagePerHa = dosage * 5;
    const totalMl = dosagePerHa * farmSize;
    const totalCost = totalMl * costPerMl;
    const potentialLoss = cropData.yieldValue * farmSize * (pestData.lossPct / 100);
    const savings = potentialLoss - totalCost;
    const containers = Math.ceil(totalMl / contSize);
    const roi = totalCost > 0 ? (savings / totalCost) * 100 : 0;

    document.getElementById('mathResult').innerHTML = `
        <div class="math-result">
            <h3 style="color:var(--accent);">${cropData.name} x ${pestData.name}</h3>
            <div class="grid-2cols" style="margin:14px 0;">
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${totalMl.toFixed(1)}ml</div><small>Spray Needed</small></div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${containers}</div><small>Bottles</small></div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${totalCost.toFixed(2)}</div><small>Total Cost</small></div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${savings.toFixed(2)}</div><small>Net Savings</small></div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:10px;font-size:0.85rem;">
                <div style="display:flex;justify-content:space-between;"><span>Potential Loss:</span><span style="color:var(--danger);">K${potentialLoss.toFixed(2)}</span></div>
                <div style="display:flex;justify-content:space-between;"><span>ROI:</span><span style="color:var(--accent);">${roi.toFixed(0)}%</span></div>
            </div>
            <p style="font-size:0.75rem;margin-top:8px;">${pestData.note}</p>
        </div>`;
    document.getElementById('mathResult').scrollIntoView({ behavior: 'smooth' });
    showToast('Calculation complete!');
}

// ═══════════════════════════════════════════
// SENSOR HUB
// ═══════════════════════════════════════════

function analyzeLeaf(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 400;
            const ratio = Math.min(maxSize / img.width, maxSize / img.height);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const colors = analyzeLeafColors(imageData);
            const diagnosis = diagnoseFromColors(colors);
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                    document.getElementById('gpsLabel').textContent = `${currentSensorGPS.lat.toFixed(3)}, ${currentSensorGPS.lon.toFixed(3)}`;
                });
            }
            sensorScans.push({ id: Date.now(), timestamp: new Date().toISOString(), gps: currentSensorGPS, light: currentSensorLight, diagnosis });
            displayScanResults(e.target.result, diagnosis);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function displayScanResults(imageSrc, diagnosis) {
    const preview = document.getElementById('cameraPreview');
    const c = diagnosis.colors;
    preview.innerHTML = `
        <img src="${imageSrc}" style="max-width:100%;border-radius:20px;margin-bottom:10px;max-height:300px;object-fit:contain;">
        <div class="color-bar">
            <div style="width:${c.greenPct}%;background:#22c55e;"></div>
            <div style="width:${c.yellowPct}%;background:#eab308;"></div>
            <div style="width:${c.brownPct}%;background:#92400e;"></div>
            <div style="width:${c.darkPct}%;background:#1a1a1a;"></div>
            <div style="width:${c.whitePct}%;background:#e5e5e5;"></div>
        </div>
        <p><strong>Plant:</strong> ${diagnosis.plant} | <strong>Confidence:</strong> ${diagnosis.confidence}%</p>
        <p><strong>Recommendation:</strong> ${diagnosis.recommendation}</p>
        ${diagnosis.issues.length ? `<p><strong>Issues:</strong> ${diagnosis.issues.join(', ')}</p>` : ''}`;
    updateScanMapUI();
    showToast(diagnosis.severity > 0 ? 'Issues detected!' : 'Healthy plant!');
}

function getGPS() {
    if (!navigator.geolocation) { document.getElementById('gpsLabel').textContent = 'Not supported'; return; }
    document.getElementById('gpsLabel').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(pos => {
        currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('gpsLabel').textContent = `${currentSensorGPS.lat.toFixed(3)}, ${currentSensorGPS.lon.toFixed(3)}`;
    }, () => { document.getElementById('gpsLabel').textContent = 'Denied'; }, { enableHighAccuracy: true });
}

function checkLight() {
    if ('AmbientLightSensor' in window) {
        try {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => { currentSensorLight = sensor.illuminance; updateLightLabel(); };
            sensor.onerror = () => { document.getElementById('lightLabel').textContent = 'Sensor error'; };
            sensor.start();
            setTimeout(() => sensor.stop(), 1000);
        } catch(e) { document.getElementById('lightLabel').textContent = 'Not available'; }
    } else { document.getElementById('lightLabel').textContent = 'Not supported'; }
}

function updateLightLabel() {
    const el = document.getElementById('lightLabel');
    if (!currentSensorLight) return;
    if (currentSensorLight < 100) { el.innerHTML = 'Too dark'; }
    else if (currentSensorLight < 500) { el.innerHTML = 'Moderate'; }
    else { el.innerHTML = 'Optimal'; }
}

function toggleScanMap() {
    const map = document.getElementById('scanMapDiv');
    map.style.display = map.style.display === 'none' ? 'block' : 'none';
    updateScanMapUI();
}

function updateScanMapUI() {
    const list = document.getElementById('scanMapList');
    if (!sensorScans.length) { list.innerHTML = '<p>No scans yet.</p>'; return; }
    list.innerHTML = sensorScans.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);">
            <span>${s.diagnosis.severity>0?'●':'○'}</span>
            <div><strong>${s.diagnosis.plant}</strong>${s.gps?`<br><small>${s.gps.lat.toFixed(3)}, ${s.gps.lon.toFixed(3)}</small>`:''}</div>
            <small>${new Date(s.timestamp).toLocaleTimeString()}</small>
        </div>`).join('');
}

// ═══════════════════════════════════════════
// AUTO-SCOUT
// ═══════════════════════════════════════════

async function startScout() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
    }
    scoutingActive = true;
    scoutSteps = 0; scoutScans = 0; scoutInfections = 0; scoutDist = 0; scoutStepsSinceScan = 0; scoutPendingScan = false;
    document.getElementById('startScoutBtn').style.display = 'none';
    document.getElementById('stopScoutBtn').style.display = 'inline-block';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3 style="color:var(--accent);">Scouting Active</h3>';
    document.getElementById('scoutLog').innerHTML = '';
    document.getElementById('scoutPrompt').style.display = 'none';
    if (window.DeviceMotionEvent) { window.addEventListener('devicemotion', detectStep); }
    scoutTimer = setInterval(() => { if (scoutingActive) checkForScanPrompt(); }, 2000);
}

function stopScout() {
    scoutingActive = false;
    clearInterval(scoutTimer);
    window.removeEventListener('devicemotion', detectStep);
    document.getElementById('startScoutBtn').style.display = 'inline-block';
    document.getElementById('stopScoutBtn').style.display = 'none';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3>Stopped</h3>';
    document.getElementById('scoutPrompt').style.display = 'none';
    scoutPendingScan = false;
    document.getElementById('scoutReport').innerHTML = `<div class="math-result"><h3>Scout Report</h3><p>Photos: ${scoutScans} | Issues: ${scoutInfections} | Steps: ${scoutSteps} | Distance: ${scoutDist}m</p></div>`;
}

function detectStep(e) {
    if (!scoutingActive) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    if (mag > 12 && (Math.abs(a.x-scoutLastAccel.x)>3 || Math.abs(a.y-scoutLastAccel.y)>3)) {
        const now = Date.now();
        if (now - scoutLastStep > 300) {
            scoutSteps++; scoutStepsSinceScan++;
            scoutDist = (scoutSteps * 0.75).toFixed(1);
            document.getElementById('scoutSteps').textContent = scoutSteps;
            document.getElementById('scoutDist').textContent = scoutDist + 'm';
            scoutLastStep = now;
        }
    }
    scoutLastAccel = { x: a.x, y: a.y, z: a.z };
}

function checkForScanPrompt() {
    if (!scoutingActive || scoutPendingScan) return;
    if (scoutStepsSinceScan >= 2) { scoutPendingScan = true; showScanPrompt(); }
}

function showScanPrompt() {
    document.getElementById('promptStepNum').textContent = scoutSteps;
    document.getElementById('scoutPrompt').style.display = 'block';
    if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
}

function captureScoutPhoto() { document.getElementById('scoutCamera').click(); }

function handleScoutPhoto(event) {
    const file = event.target.files[0];
    if (!file) { scoutPendingScan = false; document.getElementById('scoutPrompt').style.display = 'none'; return; }
    scoutScans++; scoutStepsSinceScan = 0;
    document.getElementById('scoutScans').textContent = scoutScans;
    document.getElementById('scoutPrompt').style.display = 'none';
    scoutPendingScan = false;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 300; canvas.height = 300;
            ctx.drawImage(img, 0, 0, 300, 300);
            const imageData = ctx.getImageData(0, 0, 300, 300);
            const colors = analyzeLeafColors(imageData);
            const diagnosis = diagnoseFromColors(colors);
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    sensorScans.push({ id: Date.now(), timestamp: new Date().toISOString(), gps: { lat: pos.coords.latitude, lon: pos.coords.longitude }, diagnosis, step: scoutSteps });
                    if (diagnosis.severity > 2) {
                        scoutInfections++;
                        document.getElementById('scoutInfections').textContent = scoutInfections;
                        showToast('Issue detected!');
                    }
                });
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function scoutLog(msg) {
    const log = document.getElementById('scoutLog');
    log.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    log.scrollTop = log.scrollHeight;
}

// ═══════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════

function openModal(mode) {
    document.getElementById('modalTitle').innerText = mode === 'login' ? 'Welcome Back' : 'Create Account';
    document.getElementById('authDisplayName').style.display = mode === 'login' ? 'none' : 'block';
    document.getElementById('authModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
    ['authEmail','authPass','authDisplayName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ═══════════════════════════════════════════
// DOM READY
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
    
    // Sidebar navigation
    document.getElementById('navLinks').addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.page) {
            e.preventDefault();
            showPage(li.dataset.page);
        }
    });

    // Auth
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
            if (authMode === 'login') await login(email, password);
            else { if (!displayName) return showToast('Display name required', true); await signUp(email, password, displayName); }
            closeModal();
        } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('userGreeting').addEventListener('click', logout);

    // Event delegation for all main content buttons
    document.querySelector('.main-content').addEventListener('click', async (e) => {
        const target = e.target;
        
        if (target.id === 'postForumBtn' || target.closest('#postForumBtn')) {
            const c = document.getElementById('forumContent').value.trim();
            if (c) { addForumPost(c, document.getElementById('forumImage').files[0]); document.getElementById('forumContent').value = ''; }
        }
        if (target.id === 'createGroupBtn' || target.closest('#createGroupBtn')) createGroup();
        if (target.id === 'addRecordBtn' || target.closest('#addRecordBtn')) {
            const t = document.getElementById('recordTitle').value.trim();
            if (t) { addRecord(t, document.getElementById('recordDetail').value, document.getElementById('recordLocation').value); document.getElementById('recordTitle').value = ''; }
        }
        if (target.id === 'postJobBtn' || target.closest('#postJobBtn')) {
            const t = document.getElementById('jobTitle').value.trim();
            if (t) { addJob(t, document.getElementById('jobDesc').value, document.getElementById('jobLocation').value); document.getElementById('jobTitle').value = ''; }
        }
        if (target.id === 'sendMsgBtn' || target.closest('#sendMsgBtn')) {
            const to = document.getElementById('msgTo').value.trim();
            const tx = document.getElementById('msgText').value.trim();
            if (to && tx) { sendMessage(to, tx); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
        }
        if (target.id === 'addEventBtn' || target.closest('#addEventBtn')) addEvent();
        if (target.id === 'calcYieldBtn' || target.closest('#calcYieldBtn')) calculateYield();
        if (target.id === 'addVideoBtn' || target.closest('#addVideoBtn')) {
            const t = document.getElementById('videoTitle').value.trim();
            const u = document.getElementById('videoUrl').value.trim();
            if (t && u) { addTutorial(t, u, document.getElementById('videoDesc').value); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; }
        }
        if (target.id === 'saveProfileBtn' || target.closest('#saveProfileBtn')) {
            if (!currentUser) return;
            const dn = document.getElementById('editDisplayName').value.trim();
            const { error } = await db.from('profiles').update({ display_name: dn, phone: document.getElementById('editPhone').value, location: document.getElementById('editLocation').value, bio: document.getElementById('editBio').value }).eq('id', currentUser.id);
            if (error) showToast('Failed to update', true);
            else { currentUser.displayName = dn || currentUser.displayName; updateAuthUI(); showToast('Profile updated!'); loadProfile(); }
        }
        if (target.id === 'sendChatBtn' || target.closest('#sendChatBtn')) {
            const input = document.getElementById('chatInput').value.trim();
            if (!input) return;
            const chat = document.getElementById('chatMessages');
            chat.innerHTML += `<div class="message-bubble user-msg">${escapeHtml(input)}</div>`;
            document.getElementById('chatInput').value = '';
            const reply = await wikiAnswer(input);
            chat.innerHTML += `<div class="message-bubble bot-msg">${escapeHtml(reply)}</div>`;
            chat.scrollTop = chat.scrollHeight;
        }
        
        // Delete buttons
        const deleteBtn = target.closest('.delete-btn');
        if (deleteBtn) {
            if (!currentUser) return showToast('Login to delete', true);
            if (!confirm('Delete this item?')) return;
            const { type, id } = deleteBtn.dataset;
            if (type==='forum') await deleteForumPost(id);
            else if (type==='record') await deleteRecord(id);
            else if (type==='job') await deleteJob(id);
            else if (type==='product') await deleteProduct(id);
            else if (type==='tutorial') await deleteTutorial(id);
            else if (type==='calendar') await deleteCalendarEvent(id);
        }
        
        // Apply job
        const applyBtn = target.closest('.apply-btn');
        if (applyBtn) { e.preventDefault(); await applyToJob(applyBtn.dataset.job); }
        
        // Accept/Reject application
        const acceptBtn = target.closest('.accept-app');
        if (acceptBtn) { await updateApplicationStatus(acceptBtn.dataset.id, 'accepted'); }
        const rejectBtn = target.closest('.reject-app');
        if (rejectBtn) { await updateApplicationStatus(rejectBtn.dataset.id, 'rejected'); }
        
        // Contact buttons
        const contactBtn = target.closest('.contact-applicant-btn') || target.closest('.contact-poster-btn');
        if (contactBtn) {
            document.getElementById('msgTo').value = contactBtn.dataset.email;
            document.getElementById('msgText').value = `Hello ${contactBtn.dataset.name}, `;
            showPage('messages');
        }
    });

    // Farm Math init
    const mathCrop = document.getElementById('mathCrop');
    if (mathCrop) {
        mathCrop.addEventListener('change', populatePests);
        document.getElementById('mathPest').addEventListener('change', updateDosageFromPest);
        document.getElementById('mathContSize').addEventListener('input', updateCostPerMl);
        document.getElementById('mathContPrice').addEventListener('input', updateCostPerMl);
        document.getElementById('mathDosage').addEventListener('input', updateCostPerMl);
        document.getElementById('mathDosageUnit').addEventListener('change', updateCostPerMl);
        populatePests();
        updateCostPerMl();
        renderSavedChems();
    }

    // Market events
    document.getElementById('marketCategoryFilter')?.addEventListener('change', loadMarket);
    document.getElementById('addProductBtn')?.addEventListener('click', () => {
        const n = document.getElementById('productName').value.trim();
        const p = document.getElementById('productPrice').value.trim();
        if (n && p) { addProduct(n, p, document.getElementById('productCategory').value, document.getElementById('productLocation').value, document.getElementById('productImage').files[0]); }
    });

    checkSession();
    showPage('dashboard');
});
