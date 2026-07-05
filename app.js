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

function cleanDisplayName(email) {
    if (!email) return 'User';
    let name = email.split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();
    return name || 'User';
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
        const { data: profile } = await db.from('profiles').select('*').eq('id', session.user.id).single();
        let displayName = 'Farmer';
        if (profile?.display_name && profile.display_name.trim() !== '') {
            displayName = profile.display_name.trim();
        } else if (session.user.email) {
            displayName = cleanDisplayName(session.user.email);
        }
        currentUser = { 
            id: session.user.id, 
            email: session.user.email, 
            displayName: displayName 
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
    
    const nameToSave = displayName?.trim() || cleanDisplayName(email);
    console.log('Saving display_name:', nameToSave);
    
    const { error: upsertError } = await db.from('profiles').upsert({ 
        id: data.user.id, 
        display_name: nameToSave, 
        email: email 
    });
    
    if (upsertError) console.log('Error saving profile:', upsertError);
    
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
            else if (pf?.email) dn = cleanDisplayName(pf.email);
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

async function deleteForumPost(id) {
    await db.from('forum_posts').delete().eq('id', id);
    showToast('Deleted'); loadForum(); loadDashboardStats();
}

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

// ────────── JOBS ──────────
async function loadJobs() {
    const { data: jobs } = await db.from('job_listings').select('*').order('created_at', { ascending: false });
    const container = document.getElementById('jobsList');
    if (!jobs || jobs.length === 0) { container.innerHTML = '<p>No jobs available.</p>'; return; }
    container.innerHTML = '';
    for (const j of jobs) {
        let posterName = 'Anonymous';
        if (j.user_id) {
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', j.user_id).single();
            if (pf?.display_name && pf.display_name.trim() !== '') {
                posterName = pf.display_name.trim();
            } else if (pf?.email) {
                posterName = cleanDisplayName(pf.email);
            }
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
    showToast('Job posted!'); 
    loadJobs(); 
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
}

async function deleteJob(id) { 
    // Also delete all applications for this job
    await db.from('job_applications').delete().eq('job_id', id);
    await db.from('job_listings').delete().eq('id', id); 
    showToast('Job deleted'); 
    loadJobs(); 
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
}

async function applyToJob(jobId) {
    if (!currentUser) { showToast('Please login first', true); return; }
    
    // Check if already applied
    const { data: existing } = await db.from('job_applications')
        .select('*')
        .match({ job_id: parseInt(jobId), applicant_id: currentUser.id });
    if (existing && existing.length > 0) { 
        showToast('You already applied to this job', true); 
        return; 
    }
    
    const msg = prompt('Add a message with your application (optional):');
    if (msg === null) return; // User cancelled
    
    const { error } = await db.from('job_applications').insert({ 
        job_id: parseInt(jobId), 
        applicant_id: currentUser.id, 
        applicant_message: msg || 'I am interested in this position.',
        message: msg || 'I am interested in this position.',
        status: 'pending' 
    });
    
    if (error) {
        showToast('Failed to apply: ' + error.message, true);
        return;
    }
    
    showToast('Application submitted successfully!');
    loadJobs();
}

// ────────── APPLICATIONS ──────────
async function loadApplications() {
    if (!currentUser) return;
    const container = document.getElementById('applicationsList');
    
    const { data: myJobs } = await db.from('job_listings')
        .select('id,title')
        .eq('user_id', currentUser.id);
    
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
            container.innerHTML += `<h4 style="color:var(--accent);margin-bottom:10px;">📋 ${escapeHtml(job.title)} (${apps.length} applicants)</h4>`;
            
            for (const a of apps) {
                let applicantEmail = 'N/A';
                let applicantName = 'Applicant';
                
                if (a.applicant_id) {
                    const { data: pf } = await db.from('profiles')
                        .select('display_name,email')
                        .eq('id', a.applicant_id)
                        .single();
                    if (pf) {
                        applicantEmail = pf.email || 'N/A';
                        if (pf.display_name && pf.display_name.trim() !== '') {
                            applicantName = pf.display_name.trim();
                        } else if (pf.email) {
                            applicantName = cleanDisplayName(pf.email);
                        }
                    }
                }
                
                const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
                const showContactBtn = a.status === 'accepted' && applicantEmail !== 'N/A' && applicantEmail !== '';
                
                container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};">
                    <strong>${escapeHtml(applicantName)}</strong>
                    <p style="margin-top:4px;"><strong>📧 Email:</strong> ${escapeHtml(applicantEmail)}</p>
                    <p><strong>💬 Message:</strong> ${escapeHtml(a.applicant_message || 'No message')}</p>
                    <small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
                    <br><span style="color:${sc};font-weight:600;">Status: ${a.status}</span>
                    ${a.status === 'pending' ? `
                        <div style="margin-top:8px;display:flex;gap:8px;">
                            <button class="btn-outline accept-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;">✅ Accept</button>
                            <button class="btn-outline reject-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;border-color:#dc2626;color:#dc2626;">❌ Reject</button>
                        </div>
                    ` : ''}
                    ${showContactBtn ? `
                        <div style="margin-top:8px;">
                            <button class="btn-primary contact-applicant-btn" data-email="${escapeHtml(applicantEmail)}" data-name="${escapeHtml(applicantName)}" style="font-size:12px;padding:6px 14px;">
                                <i class="fas fa-envelope"></i> Contact ${escapeHtml(applicantName)}
                            </button>
                        </div>
                    ` : ''}
                    ${a.status === 'accepted' && !showContactBtn ? `
                        <div style="margin-top:8px;color:var(--text-secondary,#aaa);font-size:0.8rem;">
                            <i class="fas fa-info-circle"></i> No email available to contact
                        </div>
                    ` : ''}
                </div>`;
            }
        }
    }
    
    if (container.innerHTML === '') {
        container.innerHTML = '<p>No applications received yet.</p>';
    }
}

// ────────── MY APPLICATIONS ──────────
async function loadMyApplications() {
    if (!currentUser) return;
    const container = document.getElementById('myApplicationsList');
    
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
        const { data: job } = await db.from('job_listings')
            .select('title,description,location,user_id')
            .eq('id', a.job_id)
            .single();
        
        let employerEmail = 'N/A';
        let employerName = 'Employer';
        
        if (job?.user_id) {
            const { data: pf } = await db.from('profiles')
                .select('display_name,email')
                .eq('id', job.user_id)
                .single();
            if (pf) {
                employerEmail = pf.email || 'N/A';
                if (pf.display_name && pf.display_name.trim() !== '') {
                    employerName = pf.display_name.trim();
                } else if (pf.email) {
                    employerName = cleanDisplayName(pf.email);
                }
            }
        }
        
        const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
        const showContactBtn = a.status === 'accepted' && employerEmail !== 'N/A' && employerEmail !== '';
        
        container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};">
            <strong>${escapeHtml(job?.title || 'Unknown Job')}</strong>
            ${job?.location ? `<p>📍 ${escapeHtml(job.location)}</p>` : ''}
            <p>${escapeHtml(job?.description || '')}</p>
            <small>Employer: ${escapeHtml(employerName)}</small>
            <br><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
            <br><span style="color:${sc};font-weight:600;">Status: ${a.status}</span>
            ${a.status === 'accepted' && showContactBtn ? `
                <div style="margin-top:10px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                    <h4 style="color:#10B981;margin-bottom:8px;"><i class="fas fa-check-circle"></i> Accepted!</h4>
                    <p><strong>📧 Employer Email:</strong> ${escapeHtml(employerEmail)}</p>
                    <p style="font-size:0.85rem;color:var(--text-secondary,#aaa);">Contact the employer to discuss next steps.</p>
                    <button class="btn-primary contact-poster-btn" data-email="${escapeHtml(employerEmail)}" data-name="${escapeHtml(employerName)}" style="font-size:12px;padding:8px 16px;margin-top:6px;">
                        <i class="fas fa-envelope"></i> Message ${escapeHtml(employerName)}
                    </button>
                </div>
            ` : ''}
            ${a.status === 'accepted' && !showContactBtn ? `
                <div style="margin-top:10px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                    <h4 style="color:#10B981;margin-bottom:8px;"><i class="fas fa-check-circle"></i> Accepted!</h4>
                    <p style="color:var(--text-secondary,#aaa);font-size:0.85rem;">No contact email available. Check the job posting for more details.</p>
                </div>
            ` : ''}
            ${a.status === 'rejected' ? `<p style="color:#dc2626;margin-top:8px;">Not accepted. Keep applying!</p>` : ''}
            ${a.status === 'pending' ? `<p style="color:#f59e0b;margin-top:8px;">⏳ Waiting for review...</p>` : ''}
        </div>`;
    }
}

async function updateApplicationStatus(appId, status) { 
    const { error } = await db.from('job_applications')
        .update({ status })
        .eq('id', appId); 
    
    if (error) {
        showToast('Failed to update status: ' + error.message, true);
        return;
    }
    
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
        let fn = 'Unknown', tn = 'Unknown';
        if (m.from_user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', m.from_user_id).single(); 
            if (pf?.display_name && pf.display_name.trim() !== '') fn = pf.display_name.trim();
            else if (pf?.email) fn = cleanDisplayName(pf.email);
        }
        if (m.to_user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', m.to_user_id).single(); 
            if (pf?.display_name && pf.display_name.trim() !== '') tn = pf.display_name.trim();
            else if (pf?.email) tn = cleanDisplayName(pf.email);
        }
        container.innerHTML += `<div class="msg-item"><strong>${escapeHtml(fn)}</strong> → ${escapeHtml(tn)}: ${escapeHtml(m.text)}<br><small>${new Date(m.created_at).toLocaleString()}</small></div>`;
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

// ────────── Profile ──────────
async function loadProfile() {
    if (!currentUser) { 
        document.getElementById('profileContent').innerHTML = '<p>Please login to see your profile.</p>'; 
        return; 
    }
    
    const { data: pd } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
    const displayName = pd?.display_name?.trim() || cleanDisplayName(currentUser.email) || 'Farmer';
    
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
    return { greenPct: total ? +(green/total*100).toFixed(1) : 0, yellowPct: total ? +(yellow/total*100).toFixed(1) : 0, brownPct: total ? +(brown/total*100).toFixed(1) : 0, darkPct: total ? +(dark/total*100).toFixed(1) : 0, whitePct: total ? +(white/total*100).toFixed(1) : 0, darkSpots };
}

function diagnoseFromColors(c) {
    const symptoms = [], issues = [];
    let score = 0, conf = 0;
    if (c.brownPct > 5 && c.darkSpots > 3) { symptoms.push({ text: 'Brown holes detected', found: true }); issues.push('Possible FAW damage'); score += 3; conf += 25; }
    else if (c.brownPct > 3) { symptoms.push({ text: 'Minor brown spots', found: true }); score += 1; conf += 10; }
    else { symptoms.push({ text: 'No brown damage', found: false }); conf += 15; }
    if (c.yellowPct > 10) { symptoms.push({ text: 'Yellow >10%', found: true }); issues.push('Possible deficiency'); score += 2; conf += 20; }
    else if (c.yellowPct > 5) { symptoms.push({ text: 'Slight yellowing', found: true }); score += 1; conf += 10; }
    else { symptoms.push({ text: 'No yellowing', found: false }); conf += 10; }
    if (c.greenPct < 50) { symptoms.push({ text: 'Low chlorophyll', found: true }); issues.push('Plant stressed'); score += 2; conf += 15; }
    else { symptoms.push({ text: 'Healthy chlorophyll', found: false }); conf += 20; }
    if (c.whitePct > 8) { symptoms.push({ text: 'White patches', found: true }); issues.push('Possible mildew'); score += 2; conf += 15; }
    else { symptoms.push({ text: 'No mildew', found: false }); conf += 5; }
    let plant = c.greenPct > 60 ? 'Healthy Plant' : c.greenPct > 40 ? 'Stressed Crop' : 'Broadleaf Crop';
    conf = Math.min(conf, 95);
    return { symptoms, issues, plant, confidence: Math.round(conf), recommendation: score >= 5 ? 'URGENT: Treat!' : score >= 3 ? 'Monitor closely.' : score >= 1 ? 'Minor issues.' : 'Healthy.', severity: score, colors: c };
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
// FARM MATH TOOL
// ═══════════════════════════════════════════

function populatePests() {
    const crop = document.getElementById('mathCrop').value;
    const pestSelect = document.getElementById('mathPest');
    pestSelect.innerHTML = '';
    Object.entries(CROP_DB[crop].pests).forEach(([key, pest]) => {
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
    document.getElementById('savedChems').innerHTML = '<label style="color:var(--accent);">Saved</label>' + savedChems.map((c, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--input-bg);border-radius:10px;margin-bottom:4px;font-size:0.8rem;">
            <span><strong>${escapeHtml(c.name)}</strong></span>
            <div><button class="btn-outline" onclick="loadChem(${i})" style="padding:2px 8px;font-size:0.65rem;">Load</button>
            <button onclick="deleteChem(${i})" style="background:none;border:1px solid var(--danger);color:var(--danger);border-radius:4px;padding:2px 6px;font-size:0.65rem;margin-left:4px;">X</button></div>
        </div>`).join('');
}

function calcFarmMath() {
    const crop = document.getElementById('mathCrop').value;
    const pestKey = document.getElementById('mathPest').value;
    const chemName = document.getElementById('mathChemName').value.trim() || 'Chemical';
    const contSize = parseFloat(document.getElementById('mathContSize').value) || 250;
    const contPrice = parseFloat(document.getElementById('mathContPrice').value) || 150;
    const dosage = parseFloat(document.getElementById('mathDosage').value) || 200;
    const unit = document.getElementById('mathDosageUnit').value;
    const farmSize = parseFloat(document.getElementById('mathFarmSlider').value);
    const pestData = CROP_DB[crop].pests[pestKey];
    const cropData = CROP_DB[crop];
    let dosagePerHa = dosage;
    if (unit === 'acre') dosagePerHa = dosage * 2.471;
    else if (unit === '20L') dosagePerHa = dosage * 5;
    const totalMl = dosagePerHa * farmSize;
    const totalCost = totalMl * (contPrice / contSize);
    const potentialLoss = cropData.yieldValue * farmSize * (pestData.lossPct / 100);
    const savings = potentialLoss - totalCost;
    const containers = Math.ceil(totalMl / contSize);
    const roi = totalCost > 0 ? (savings / totalCost) * 100 : 0;
    document.getElementById('mathResult').innerHTML = `<div class="math-result"><h3 style="color:var(--accent);">${cropData.name} x ${pestData.name}</h3><div class="grid-2cols" style="margin:14px 0;"><div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${totalMl.toFixed(1)}ml</div><small>Spray</small></div><div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${containers}</div><small>Bottles</small></div><div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${totalCost.toFixed(2)}</div><small>Cost</small></div><div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${savings.toFixed(2)}</div><small>Savings</small></div></div><p>ROI: ${roi.toFixed(0)}% | Loss without spray: K${potentialLoss.toFixed(2)}</p></div>`;
    document.getElementById('mathResult').scrollIntoView({ behavior: 'smooth' });
    showToast('Done!');
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
            const ratio = Math.min(400 / img.width, 400 / img.height);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const colors = analyzeLeafColors(ctx.getImageData(0, 0, canvas.width, canvas.height));
            const diagnosis = diagnoseFromColors(colors);
            if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => { currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }; });
            sensorScans.push({ id: Date.now(), timestamp: new Date().toISOString(), gps: currentSensorGPS, diagnosis });
            document.getElementById('cameraPreview').innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:20px;"><p><strong>${diagnosis.plant}</strong> (${diagnosis.confidence}%)</p><p>${diagnosis.recommendation}</p>`;
            showToast(diagnosis.severity > 0 ? 'Issues detected!' : 'Healthy!');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function getGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
        currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('gpsLabel').textContent = `${currentSensorGPS.lat.toFixed(3)}, ${currentSensorGPS.lon.toFixed(3)}`;
    });
}

function checkLight() {
    document.getElementById('lightLabel').textContent = 'Sensor check done';
}

function toggleScanMap() {
    const map = document.getElementById('scanMapDiv');
    map.style.display = map.style.display === 'none' ? 'block' : 'none';
}

function updateScanMapUI() {
    const list = document.getElementById('scanMapList');
    if (!sensorScans.length) { list.innerHTML = '<p>No scans yet.</p>'; return; }
    list.innerHTML = sensorScans.map(s => `<div style="padding:8px;border-bottom:1px solid var(--border);"><strong>${s.diagnosis.plant}</strong>${s.gps?`<br><small>${s.gps.lat.toFixed(3)}, ${s.gps.lon.toFixed(3)}</small>`:''}</div>`).join('');
}

// ═══════════════════════════════════════════
// AUTO-SCOUT
// ═══════════════════════════════════════════

async function startScout() {
    scoutingActive = true;
    scoutSteps = 0; scoutScans = 0; scoutInfections = 0; scoutDist = 0; scoutStepsSinceScan = 0; scoutPendingScan = false;
    document.getElementById('startScoutBtn').style.display = 'none';
    document.getElementById('stopScoutBtn').style.display = 'inline-block';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3 style="color:var(--accent);">Scouting</h3>';
    if (window.DeviceMotionEvent) window.addEventListener('devicemotion', detectStep);
    scoutTimer = setInterval(() => { if (scoutingActive) checkForScanPrompt(); }, 2000);
}

function stopScout() {
    scoutingActive = false;
    clearInterval(scoutTimer);
    window.removeEventListener('devicemotion', detectStep);
    document.getElementById('startScoutBtn').style.display = 'inline-block';
    document.getElementById('stopScoutBtn').style.display = 'none';
    document.getElementById('scoutStatusDiv').innerHTML = '<h3>Stopped</h3>';
    document.getElementById('scoutReport').innerHTML = `<div class="math-result"><h3>Report</h3><p>Photos: ${scoutScans} | Issues: ${scoutInfections} | Steps: ${scoutSteps} | ${scoutDist}m</p></div>`;
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
    event.target.value = '';
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
}

// ═══════════════════════════════════════════
// DOM READY
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Sidebar
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });
    document.getElementById('navLinks').addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.page) { e.preventDefault(); showPage(li.dataset.page); }
    });

    // Auth
    document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
    document.getElementById('signupBtn').addEventListener('click', () => openModal('signup'));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    let authMode = 'login';
    document.getElementById('loginBtn').addEventListener('click', () => { authMode = 'login'; });
    document.getElementById('signupBtn').addEventListener('click', () => { authMode = 'signup'; });
    document.getElementById('authSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPass').value;
        const displayName = document.getElementById('authDisplayName').value.trim();
        try {
            if (authMode === 'login') await login(email, password);
            else { if (!displayName) return showToast('Name required', true); await signUp(email, password, displayName); }
            closeModal();
        } catch (err) { showToast(err.message, true); }
    });
    document.getElementById('userGreeting').addEventListener('click', logout);

    // Forum
    document.getElementById('postForumBtn').addEventListener('click', () => {
        const c = document.getElementById('forumContent').value.trim();
        const img = document.getElementById('forumImage').files[0];
        if (c) { addForumPost(c, img); document.getElementById('forumContent').value = ''; document.getElementById('forumImage').value = ''; }
    });

    // Groups
    document.getElementById('createGroupBtn').addEventListener('click', createGroup);
    document.getElementById('groupLocationFilter').addEventListener('input', loadGroups);

    // Records
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        const t = document.getElementById('recordTitle').value.trim();
        const d = document.getElementById('recordDetail').value.trim();
        const l = document.getElementById('recordLocation').value.trim();
        if (t) { addRecord(t, d, l); document.getElementById('recordTitle').value = ''; document.getElementById('recordDetail').value = ''; document.getElementById('recordLocation').value = ''; }
    });

    // JOBS - Post Job Button
    document.getElementById('postJobBtn')?.addEventListener('click', () => {
        const t = document.getElementById('jobTitle').value.trim();
        const d = document.getElementById('jobDesc').value.trim();
        const l = document.getElementById('jobLocation').value.trim();
        if (t) { 
            addJob(t, d, l); 
            document.getElementById('jobTitle').value = ''; 
            document.getElementById('jobDesc').value = ''; 
            document.getElementById('jobLocation').value = ''; 
        } else {
            showToast('Job title is required', true);
        }
    });

    // Market
    document.getElementById('addProductBtn').addEventListener('click', () => {
        const n = document.getElementById('productName').value.trim();
        const p = document.getElementById('productPrice').value.trim();
        const cat = document.getElementById('productCategory').value;
        const loc = document.getElementById('productLocation').value.trim();
        const img = document.getElementById('productImage').files[0];
        if (n && p) { addProduct(n, p, cat, loc, img); document.getElementById('productName').value = ''; document.getElementById('productPrice').value = ''; document.getElementById('productLocation').value = ''; }
    });
    document.getElementById('marketCategoryFilter').addEventListener('change', loadMarket);

    // Messages
    document.getElementById('sendMsgBtn').addEventListener('click', () => {
        const to = document.getElementById('msgTo').value.trim();
        const tx = document.getElementById('msgText').value.trim();
        if (to && tx) { sendMessage(to, tx); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
    });

    // Tutorials
    document.getElementById('addVideoBtn').addEventListener('click', () => {
        const t = document.getElementById('videoTitle').value.trim();
        const u = document.getElementById('videoUrl').value.trim();
        const d = document.getElementById('videoDesc').value.trim();
        if (t && u) { addTutorial(t, u, d); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; document.getElementById('videoDesc').value = ''; }
    });

    // Calendar
    document.getElementById('addEventBtn').addEventListener('click', addEvent);

    // Calculator
    document.getElementById('calcYieldBtn').addEventListener('click', calculateYield);

    // Profile
    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
        if (!currentUser) return;
        const dn = document.getElementById('editDisplayName').value.trim();
        const ph = document.getElementById('editPhone').value.trim();
        const loc = document.getElementById('editLocation').value.trim();
        const bio = document.getElementById('editBio').value.trim();
        const { error } = await db.from('profiles').update({ display_name: dn, phone: ph, location: loc, bio: bio }).eq('id', currentUser.id);
        if (error) showToast('Failed to update', true);
        else { currentUser.displayName = dn; updateAuthUI(); showToast('Profile updated!'); loadProfile(); }
    });

    // Search
    document.getElementById('doSearchBtn').addEventListener('click', () => {
        const term = document.getElementById('searchInput').value.trim();
        const cat = document.getElementById('searchCategory').value;
        const from = document.getElementById('searchDateFrom').value;
        const to = document.getElementById('searchDateTo').value;
        if (term) globalSearch(term, cat, from, to);
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

    // Farm Math
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

    // ────────── CLICK HANDLERS FOR DYNAMIC ELEMENTS ──────────
    document.addEventListener('click', async function(e) {
        const target = e.target;
        
        // Delete buttons (all types)
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
            return;
        }
        
        // Apply to job
        if (target.closest('.apply-btn')) { 
            e.preventDefault(); 
            const jobId = target.closest('.apply-btn').dataset.job;
            if (jobId) await applyToJob(jobId); 
            return;
        }
        
        // Accept application
        if (target.closest('.accept-app')) {
            const id = target.closest('.accept-app').dataset.id;
            if (id && confirm('Accept this applicant?')) {
                await updateApplicationStatus(id, 'accepted');
            }
            return;
        }
        
        // Reject application
        if (target.closest('.reject-app')) {
            const id = target.closest('.reject-app').dataset.id;
            if (id && confirm('Reject this applicant?')) {
                await updateApplicationStatus(id, 'rejected');
            }
            return;
        }
        
        // Contact applicant (employer contacting applicant)
        if (target.closest('.contact-applicant-btn')) {
            const btn = target.closest('.contact-applicant-btn');
            const name = btn.dataset.name || 'Applicant';
            const email = btn.dataset.email || '';
            
            if (email && email !== 'N/A' && email !== '') {
                document.getElementById('msgTo').value = email;
                document.getElementById('msgText').value = `Hello ${name}, regarding your application... `;
                showPage('messages');
                setTimeout(() => showToast(`Ready to message ${name}`), 300);
            } else {
                showToast('No email address available for this applicant', true);
            }
            return;
        }
        
        // Contact poster (applicant contacting employer)
        if (target.closest('.contact-poster-btn')) {
            const btn = target.closest('.contact-poster-btn');
            const name = btn.dataset.name || 'Employer';
            const email = btn.dataset.email || '';
            
            if (email && email !== 'N/A' && email !== '') {
                document.getElementById('msgTo').value = email;
                document.getElementById('msgText').value = `Hello ${name}, I'm following up on my application... `;
                showPage('messages');
                setTimeout(() => showToast(`Ready to message ${name}`), 300);
            } else {
                showToast('No email address available for this employer', true);
            }
            return;
        }
    });

    checkSession();
    showPage('dashboard');
});
