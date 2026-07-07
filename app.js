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
        const { data: profile } = await db.from('profiles')
            .select('display_name,email,phone,location,bio,created_at')
            .eq('id', session.user.id)
            .single();
        
        let displayName = cleanDisplayName(session.user.email);
        
        if (profile?.display_name && profile.display_name.trim() !== '') {
            displayName = profile.display_name.trim();
        }
        
        currentUser = { 
            id: session.user.id, 
            email: session.user.email, 
            displayName: displayName 
        };
        
        try {
            await db.from('profiles')
                .update({ 
                    display_name: displayName,
                    email: session.user.email 
                })
                .eq('id', session.user.id);
        } catch (err) {
            console.log('Could not update profile:', err);
        }
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
    
    const { error: upsertError } = await db.from('profiles').upsert({ 
        id: data.user.id, 
        display_name: nameToSave, 
        email: email,
        phone: '',
        location: '',
        bio: ''
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
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-15.38&longitude=28.32&current_weather=true');
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

// ────────── Forum with Likes & Replies ──────────
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
        const { count: lc } = await db.from('likes').select('*', { count: 'exact', head: true }).match({ target_type: 'forum', target_id: p.id });
        const postDiv = document.createElement('div');
        postDiv.className = 'forum-post';
        postDiv.innerHTML = `<strong>${escapeHtml(dn)}</strong><small>${new Date(p.created_at).toLocaleString()}</small><p>${escapeHtml(p.content)}</p>${p.image_url?`<img src="${p.image_url}" style="max-width:100%;border-radius:12px;margin:8px 0;">`:''}<span class="like-btn" data-type="forum" data-id="${p.id}">❤️ ${lc||0}</span>${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}<button class="btn-outline reply-toggle" data-post="${p.id}">Reply</button>`;
        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply-section';
        replyDiv.style.display = 'none';
        container.appendChild(postDiv);
        container.appendChild(replyDiv);
    }
}

async function loadReplies(postId, container) {
    const { data: replies } = await db.from('forum_replies').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    container.innerHTML = '';
    if (replies) {
        for (const r of replies) {
            let dn = 'Anonymous';
            if (r.user_id) { 
                const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', r.user_id).single(); 
                if (pf?.display_name && pf.display_name.trim() !== '') dn = pf.display_name.trim();
                else if (pf?.email) dn = cleanDisplayName(pf.email);
            }
            container.innerHTML += `<div style="padding:4px 0;"><strong>${escapeHtml(dn)}:</strong> ${escapeHtml(r.content)}</div>`;
        }
    }
    container.innerHTML += `<input type="text" class="reply-input" placeholder="Write reply..." style="width:70%;display:inline;"><button class="btn-outline send-reply" data-post="${postId}">Send</button>`;
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
    await db.from('forum_replies').delete().eq('post_id', id);
    await db.from('likes').delete().match({ target_type: 'forum', target_id: id });
    await db.from('forum_posts').delete().eq('id', id);
    showToast('Deleted'); loadForum(); loadDashboardStats();
}

async function toggleLike(type, id) {
    if (!currentUser) return showToast('Login first', true);
    const { data: ex } = await db.from('likes').select('*').match({ user_id: currentUser.id, target_type: type, target_id: id });
    if (ex && ex.length) await db.from('likes').delete().eq('id', ex[0].id);
    else await db.from('likes').insert({ user_id: currentUser.id, target_type: type, target_id: id });
    if (type === 'forum') loadForum();
    else if (type === 'job') loadJobs();
    else if (type === 'product') loadMarket();
    else if (type === 'tutorial') loadTutorials();
}

// ────────── Groups ──────────
async function loadGroups() {
    const locFilter = document.getElementById('groupLocationFilter')?.value?.trim() || '';
    let query = db.from('groups').select('*').order('created_at', { ascending: false });
    if (locFilter) query = query.ilike('location', `%${locFilter}%`);
    const { data: groups } = await query;
    const container = document.getElementById('groupsList');
    if (!groups || groups.length === 0) { container.innerHTML = '<p>No groups yet. Create one!</p>'; return; }
    container.innerHTML = groups.map(g => `<div class="forum-post"><strong>${escapeHtml(g.name)}</strong> <small>${escapeHtml(g.category)}</small>${g.location?`<br><small>📍 ${escapeHtml(g.location)}</small>`:''}<p>${escapeHtml(g.description||'')}</p><button class="btn-outline join-group-btn" data-group="${g.id}">Join Group</button></div>`).join('');
}

async function createGroup() {
    if (!currentUser) return showToast('Please login', true);
    const name = document.getElementById('groupName').value.trim();
    const desc = document.getElementById('groupDesc').value.trim();
    const cat = document.getElementById('groupCategory').value;
    const loc = document.getElementById('groupLocation').value.trim();
    if (!name) return showToast('Group name required', true);
    await db.from('groups').insert({ name, description: desc, category: cat, location: loc, created_by: currentUser.id });
    showToast('Group created!');
    document.getElementById('groupName').value = '';
    document.getElementById('groupDesc').value = '';
    document.getElementById('groupLocation').value = '';
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
    const locFilter = document.getElementById('jobLocationFilter')?.value?.trim() || '';
    let query = db.from('job_listings').select('*').order('created_at', { ascending: false });
    if (locFilter) query = query.ilike('location', `%${locFilter}%`);
    const { data: jobs } = await query;
    const container = document.getElementById('jobsList');
    if (!jobs || jobs.length === 0) { container.innerHTML = '<p>No jobs available.</p>'; return; }
    container.innerHTML = '';
    for (const j of jobs) {
        let posterName = 'Anonymous';
        let posterEmail = 'N/A';
        if (j.user_id) {
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', j.user_id).single();
            if (pf?.display_name && pf.display_name.trim() !== '') {
                posterName = pf.display_name.trim();
            } else if (pf?.email) {
                posterName = cleanDisplayName(pf.email);
            }
            posterEmail = pf?.email || 'N/A';
        }
        const { count: ac } = await db.from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', j.id);
        const isOwner = currentUser && currentUser.id === j.user_id;
        container.innerHTML += `<div class="job-item">
            <strong>${escapeHtml(j.title)}</strong>
            <p>${escapeHtml(j.description||'')}</p>
            ${j.location?`<p>📍 ${escapeHtml(j.location)}</p>`:''}
            <small>Posted by: ${escapeHtml(posterName)}</small>
            ${!isOwner && currentUser && posterEmail !== 'N/A' ? `<br><small>📧 ${escapeHtml(posterEmail)}</small>` : ''}
            <span>👤 ${ac||0} applicants</span>
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

async function deleteJob(id) { 
    await db.from('job_applications').delete().eq('job_id', id); 
    await db.from('job_listings').delete().eq('id', id); 
    showToast('Job deleted'); loadJobs(); loadDashboardStats(); 
}

async function applyToJob(jobId) {
    if (!currentUser) { showToast('Please login first', true); return; }
    
    const { data: existing } = await db.from('job_applications').select('*').match({ job_id: parseInt(jobId), applicant_id: currentUser.id });
    if (existing && existing.length > 0) { showToast('You already applied', true); return; }
    
    const msg = prompt('Add a message (optional):');
    const { error } = await db.from('job_applications').insert({ 
        job_id: parseInt(jobId), 
        applicant_id: currentUser.id, 
        applicant_message: msg || 'I am interested.',
        message: msg || 'I am interested.',
        status: 'pending' 
    });
    if (error) { showToast('Failed to apply: ' + error.message, true); return; }
    showToast('Applied!');
    loadJobs();
}

// ────────── Applications ──────────
async function loadApplications() {
    if (!currentUser) {
        document.getElementById('applicationsList').innerHTML = '<p>Please login to view applications.</p>';
        return;
    }
    
    const container = document.getElementById('applicationsList');
    container.innerHTML = '<p>Loading applications...</p>';
    
    try {
        const { data: myJobs, error: jobsError } = await db.from('job_listings')
            .select('id, title')
            .eq('user_id', currentUser.id);
        
        if (jobsError) {
            console.error('Error fetching jobs:', jobsError);
            container.innerHTML = '<p>Error loading jobs.</p>';
            return;
        }
        
        if (!myJobs || myJobs.length === 0) {
            container.innerHTML = '<p>You haven\'t posted any jobs yet.</p>';
            return;
        }
        
        container.innerHTML = '';
        
        for (const job of myJobs) {
            const { data: apps, error: appsError } = await db.from('job_applications')
                .select('*')
                .eq('job_id', job.id)
                .order('created_at', { ascending: false });
            
            if (appsError) {
                console.error('Error fetching applications:', appsError);
                continue;
            }
            
            if (!apps || apps.length === 0) continue;
            
            const jobHeader = document.createElement('h4');
            jobHeader.style.cssText = 'color:var(--accent);margin-bottom:10px;margin-top:15px;';
            jobHeader.textContent = `📋 ${job.title} (${apps.length} applicants)`;
            container.appendChild(jobHeader);
            
            for (const a of apps) {
                const appDiv = document.createElement('div');
                appDiv.className = 'job-item';
                
                let applicantEmail = 'N/A';
                let applicantName = 'Unknown';
                let applicantPhone = 'N/A';
                let applicantLocation = 'N/A';
                
                if (a.applicant_id) {
                    try {
                        const { data: pf } = await db.from('profiles')
                            .select('display_name, email, phone, location')
                            .eq('id', a.applicant_id)
                            .single();
                        if (pf) {
                            applicantEmail = pf.email || 'N/A';
                            applicantName = pf.display_name?.trim() || cleanDisplayName(pf.email);
                            applicantPhone = pf.phone || 'N/A';
                            applicantLocation = pf.location || 'N/A';
                        }
                    } catch (err) {
                        console.error('Error fetching profile:', err);
                    }
                }
                
                const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
                
                let html = `<div style="border-left:5px solid ${sc};padding-left:12px;">
                    <strong>${escapeHtml(applicantName)}</strong>
                    <p style="margin-top:4px;"><strong>📧 Email:</strong> ${escapeHtml(applicantEmail)}</p>`;
                
                if (a.status === 'accepted') {
                    html += `
                        <p><strong>📱 Phone:</strong> ${escapeHtml(applicantPhone)}</p>
                        <p><strong>📍 Location:</strong> ${escapeHtml(applicantLocation)}</p>`;
                }
                
                html += `
                    <p><strong>💬 Message:</strong> ${escapeHtml(a.applicant_message || 'No message')}</p>
                    <small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
                    <br><span style="color:${sc};font-weight:600;">Status: ${a.status}</span>`;
                
                if (a.status === 'pending') {
                    html += `
                        <div style="margin-top:8px;display:flex;gap:8px;">
                            <button class="btn-outline accept-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;">✅ Accept</button>
                            <button class="btn-outline reject-app" data-id="${a.id}" style="font-size:12px;padding:6px 14px;border-color:#dc2626;color:#dc2626;">❌ Reject</button>
                        </div>`;
                }
                
                if (a.status === 'accepted' && applicantEmail && applicantEmail !== 'N/A') {
                    html += `
                        <div style="margin-top:12px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                            <button class="btn-primary contact-applicant-btn" 
                                data-email="${escapeHtml(applicantEmail)}" 
                                data-name="${escapeHtml(applicantName)}" 
                                data-phone="${escapeHtml(applicantPhone)}"
                                style="font-size:12px;padding:6px 14px;width:100%;">
                                <i class="fas fa-envelope"></i> Contact ${escapeHtml(applicantName)}
                            </button>
                        </div>`;
                }
                
                html += '</div>';
                appDiv.innerHTML = html;
                container.appendChild(appDiv);
            }
        }
        
        if (container.innerHTML === '') {
            container.innerHTML = '<p>No applications received yet.</p>';
        }
    } catch (err) {
        console.error('Error in loadApplications:', err);
        container.innerHTML = '<p>Error loading applications. Please try again.</p>';
    }
}

// ────────── My Applications ──────────
async function loadMyApplications() {
    if (!currentUser) {
        document.getElementById('myApplicationsList').innerHTML = '<p>Please login to view your applications.</p>';
        return;
    }
    
    const container = document.getElementById('myApplicationsList');
    container.innerHTML = '<p>Loading your applications...</p>';
    
    try {
        const { data: apps, error: appsError } = await db.from('job_applications')
            .select('*')
            .eq('applicant_id', currentUser.id)
            .order('created_at', { ascending: false });
        
        if (appsError) {
            console.error('Error fetching applications:', appsError);
            container.innerHTML = '<p>Error loading your applications.</p>';
            return;
        }
        
        if (!apps || apps.length === 0) {
            container.innerHTML = '<p>You haven\'t applied to any jobs yet.</p>';
            return;
        }
        
        container.innerHTML = '';
        
        for (const a of apps) {
            const appDiv = document.createElement('div');
            appDiv.className = 'job-item';
            
            let jobTitle = 'Unknown Job';
            let jobLocation = '';
            let jobDescription = '';
            let employerId = null;
            let employerEmail = 'N/A';
            let employerName = 'Unknown';
            
            try {
                const { data: job, error: jobError } = await db.from('job_listings')
                    .select('title, description, location, user_id')
                    .eq('id', a.job_id)
                    .single();
                
                if (jobError) {
                    console.error('Error fetching job:', jobError);
                } else if (job) {
                    jobTitle = job.title || 'Unknown Job';
                    jobLocation = job.location || '';
                    jobDescription = job.description || '';
                    employerId = job.user_id;
                    
                    if (employerId) {
                        const { data: pf } = await db.from('profiles')
                            .select('display_name, email')
                            .eq('id', employerId)
                            .single();
                        if (pf) {
                            employerEmail = pf.email || 'N/A';
                            employerName = pf.display_name?.trim() || cleanDisplayName(pf.email);
                        }
                    }
                }
            } catch (err) {
                console.error('Exception fetching job:', err);
            }
            
            const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
            
            let html = `<div style="border-left:5px solid ${sc};padding-left:12px;">
                <strong>${escapeHtml(jobTitle)}</strong>`;
            
            if (jobLocation) {
                html += `<p>📍 ${escapeHtml(jobLocation)}</p>`;
            }
            
            if (jobDescription) {
                html += `<p>${escapeHtml(jobDescription)}</p>`;
            }
            
            html += `
                <small>Employer: ${escapeHtml(employerName)}</small>
                <br><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small>
                <br><span style="color:${sc};font-weight:600;">Status: ${a.status}</span>`;
            
            if (a.status === 'accepted' && employerEmail && employerEmail !== 'N/A') {
                html += `
                    <div style="margin-top:10px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                        <h4 style="color:#10B981;margin-bottom:8px;"><i class="fas fa-check-circle"></i> Accepted!</h4>
                        <p><strong>📧 Employer Email:</strong> ${escapeHtml(employerEmail)}</p>
                        <p style="font-size:0.85rem;color:var(--text-secondary,#aaa);">Contact the employer to discuss next steps.</p>
                        <button class="btn-primary contact-poster-btn" 
                            data-email="${escapeHtml(employerEmail)}" 
                            data-name="${escapeHtml(employerName)}" 
                            data-jobtitle="${escapeHtml(jobTitle)}"
                            style="font-size:12px;padding:8px 16px;margin-top:6px;width:100%;">
                            <i class="fas fa-envelope"></i> Message ${escapeHtml(employerName)}
                        </button>
                    </div>`;
            } else if (a.status === 'accepted') {
                html += `
                    <div style="margin-top:10px;padding:12px;background:rgba(245,158,11,0.1);border-radius:10px;border:1px solid #f59e0b;">
                        <p style="color:#f59e0b;font-size:0.85rem;">📧 Employer email not available. Please ask them to update their profile.</p>
                    </div>`;
            }
            
            if (a.status === 'rejected') {
                html += `<p style="color:#dc2626;margin-top:8px;">Not accepted. Keep applying!</p>`;
            }
            
            if (a.status === 'pending') {
                html += `<p style="color:#f59e0b;margin-top:8px;">⏳ Waiting for review...</p>`;
            }
            
            html += '</div>';
            appDiv.innerHTML = html;
            container.appendChild(appDiv);
        }
    } catch (err) {
        console.error('Error in loadMyApplications:', err);
        container.innerHTML = '<p>Error loading your applications. Please try again.</p>';
    }
}

async function updateApplicationStatus(appId, status) { 
    await db.from('job_applications').update({ status }).eq('id', appId); 
    showToast(`Application ${status}!`); 
    loadApplications();
    loadMyApplications();
}

// ────────── Market ──────────
async function loadMarket() {
    const cat = document.getElementById('marketCategoryFilter')?.value || 'All';
    const locFilter = document.getElementById('marketLocationFilter')?.value?.trim() || '';
    let q = db.from('products').select('*').order('created_at', { ascending: false });
    if (cat !== 'All') q = q.eq('category', cat);
    if (locFilter) q = q.ilike('location', `%${locFilter}%`);
    const { data: products } = await q;
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
    if (!users || users.length === 0) return showToast('User not found. Make sure the email is correct.', true);
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

async function deleteTutorial(id) { await db.from('tutorials').delete().eq('id', id); showToast('Deleted'); loadTutorials(); loadDashboardStats(); }

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
    const notes = document.getElementById('eventNotes').value.trim();
    if (!title || !date) return showToast('Title and date required', true);
    await db.from('calendar_events').insert({ user_id: currentUser.id, title, event_date: date, notes });
    showToast('Event added!');
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventNotes').value = '';
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
    const results = [];
    
    if (category==='all'||category==='forum') {
        const { data } = await db.from('forum_posts').select('content,created_at').ilike('content',q).limit(5);
        if (data) data.forEach(r => { if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) results.push({ type: 'Forum Post', text: r.content?.substring(0,100), date: r.created_at }); });
    }
    if (category==='all'||category==='records') {
        const { data } = await db.from('farm_records').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => { if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) results.push({ type: 'Farm Record', text: r.title, date: r.created_at }); });
    }
    if (category==='all'||category==='jobs') {
        const { data } = await db.from('job_listings').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => { if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) results.push({ type: 'Job', text: r.title, date: r.created_at }); });
    }
    if (category==='all'||category==='tutorials') {
        const { data } = await db.from('tutorials').select('title,created_at').ilike('title',q).limit(5);
        if (data) data.forEach(r => { if ((!dateFrom||new Date(r.created_at)>=new Date(dateFrom)) && (!dateTo||new Date(r.created_at)<=new Date(dateTo+'T23:59:59'))) results.push({ type: 'Tutorial', text: r.title, date: r.created_at }); });
    }
    
    if (category==='all') {
        const { data: users } = await db.from('profiles').select('display_name,email,phone,location,created_at').ilike('display_name',q).limit(10);
        if (users) users.forEach(u => { results.push({ type: 'User', text: `${u.display_name || 'User'} (${u.email || 'No email'})${u.location ? ' - ' + u.location : ''}${u.phone ? ' - ' + u.phone : ''}`, date: u.created_at }); });
        if (results.filter(r => r.type === 'User').length === 0) {
            const { data: usersByEmail } = await db.from('profiles').select('display_name,email,phone,location,created_at').ilike('email',q).limit(5);
            if (usersByEmail) usersByEmail.forEach(u => { results.push({ type: 'User', text: `${u.display_name || 'User'} (${u.email || 'No email'})${u.location ? ' - ' + u.location : ''}${u.phone ? ' - ' + u.phone : ''}`, date: u.created_at }); });
        }
    }
    
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    document.getElementById('searchResults').innerHTML = results.length ? results.map(r => `<div style="padding:12px;margin-bottom:8px;background:var(--card-bg);border-radius:12px;border-left:3px solid var(--accent);"><span style="font-size:0.7rem;color:var(--accent);font-weight:600;">${r.type}</span><p style="margin:4px 0;">${escapeHtml(r.text)}</p><small>${r.date ? new Date(r.date).toLocaleDateString() : ''}</small></div>`).join('') : '<p>No matches found.</p>';
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
    const displayName = pd?.display_name?.trim() || cleanDisplayName(currentUser.email);
    
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
    
    document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;
    
    const { count: fc } = await db.from('forum_posts').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: rc } = await db.from('farm_records').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: jc } = await db.from('job_listings').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: pc } = await db.from('products').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: tc } = await db.from('tutorials').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
    const { count: mc } = await db.from('messages').select('*',{count:'exact',head:true}).or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`);
    const { count: fol } = await db.from('follows').select('*',{count:'exact',head:true}).eq('following_id',currentUser.id);
    
    document.getElementById('profileForumCount').textContent = fc || 0;
    document.getElementById('profileRecordsCount').textContent = rc || 0;
    document.getElementById('profileJobsCount').textContent = jc || 0;
    document.getElementById('profileProductsCount').textContent = pc || 0;
    document.getElementById('profileTutorialsCount').textContent = tc || 0;
    document.getElementById('profileMessagesCount').textContent = mc || 0;
    document.getElementById('followerCount').textContent = `${fol||0} followers`;
    
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
// REAL HSV COLOR ANALYSIS - IMPROVED
// ═══════════════════════════════════════════

function analyzeLeafColors(imageData) {
    const pixels = imageData.data;
    let total = 0, green = 0, yellow = 0, brown = 0, dark = 0, white = 0, darkSpots = 0;
    let red = 0, orange = 0, purple = 0;
    
    // Sample every 4th pixel for better accuracy
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // Skip transparent pixels
        if (a < 128) continue;
        
        // Skip very dark pixels (background)
        if (r < 20 && g < 20 && b < 20) continue;
        
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
        
        // REAL PLANT COLOR DETECTION
        
        // Healthy Green: Hue 60-180, Saturation > 20, Value > 30
        if (h >= 60 && h <= 180 && s > 20 && v > 30) {
            green++;
        }
        // Yellow/Chlorosis: Hue 35-65, Saturation > 20, Value > 40
        else if (h >= 35 && h <= 65 && s > 20 && v > 40) {
            yellow++;
        }
        // Brown/Damage: Hue 10-40, Saturation > 20, Value 10-70
        else if (h >= 10 && h <= 40 && s > 20 && v > 10 && v < 70) {
            brown++;
        }
        // Dark/Shadows: Value < 25, Saturation < 30
        else if (v < 25 && s < 30) {
            dark++;
            if (dark % 5 === 0) darkSpots++;
        }
        // White/Mildew: Saturation < 20, Value > 70
        else if (s < 20 && v > 70) {
            white++;
        }
        // Red (anthocyanin): Hue 320-360 or 0-10
        else if ((h >= 320 && h <= 360) || (h >= 0 && h <= 10)) {
            if (s > 30 && v > 30) red++;
        }
        // Orange (rust): Hue 10-35
        else if (h >= 10 && h <= 35 && s > 30 && v > 30) {
            orange++;
        }
        // Purple (phosphorus deficiency): Hue 270-320
        else if (h >= 270 && h <= 320 && s > 30 && v > 30) {
            purple++;
        }
    }
    
    const totalPixels = total || 1;
    
    return { 
        greenPct: +(green/totalPixels*100).toFixed(1), 
        yellowPct: +(yellow/totalPixels*100).toFixed(1), 
        brownPct: +(brown/totalPixels*100).toFixed(1), 
        darkPct: +(dark/totalPixels*100).toFixed(1), 
        whitePct: +(white/totalPixels*100).toFixed(1),
        redPct: +(red/totalPixels*100).toFixed(1),
        orangePct: +(orange/totalPixels*100).toFixed(1),
        purplePct: +(purple/totalPixels*100).toFixed(1),
        darkSpots: darkSpots,
        totalPixels: totalPixels
    };
}

function diagnoseFromColors(c) {
    const symptoms = [], issues = [];
    let score = 0, conf = 0;
    
    // Check if image has enough data
    if (c.totalPixels < 50) {
        return { 
            symptoms: [{ text: 'Not enough leaf area detected. Take a closer photo.', found: true }], 
            issues: ['Insufficient data'], 
            plant: '❌ Insufficient Data', 
            confidence: 0, 
            recommendation: 'Take a photo of a single leaf from close range.', 
            severity: 0, 
            colors: c 
        };
    }
    
    // Check lighting
    if (c.darkPct > 60) {
        return { 
            symptoms: [{ text: 'Image is too dark. Move to better lighting.', found: true }], 
            issues: ['Poor lighting conditions'], 
            plant: '🌑 Too Dark', 
            confidence: 0, 
            recommendation: 'Take the photo in good sunlight or use flash.', 
            severity: 0, 
            colors: c 
        };
    }
    
    // ─── FALL ARMYWORM DETECTION ───
    if (c.brownPct > 8 && c.darkSpots > 2) { 
        symptoms.push({ text: 'Brown damage with dark holes detected', found: true, detail: `Brown: ${c.brownPct}%, Dark spots: ${c.darkSpots}` }); 
        issues.push('🚨 FALL ARMYWORM DAMAGE DETECTED!'); 
        score += 4; 
        conf += 30; 
    }
    else if (c.brownPct > 5) { 
        symptoms.push({ text: 'Brown spots detected on leaf', found: true, detail: `Brown: ${c.brownPct}%` }); 
        issues.push('⚠️ Possible pest damage or disease'); 
        score += 2; 
        conf += 15; 
    }
    else { 
        symptoms.push({ text: 'No significant brown damage', found: false }); 
        conf += 10; 
    }
    
    // ─── NUTRIENT DEFICIENCY ───
    if (c.yellowPct > 15) { 
        symptoms.push({ text: 'Significant yellowing detected', found: true, detail: `Yellow: ${c.yellowPct}%` }); 
        issues.push('⚠️ NUTRIENT DEFICIENCY (likely Nitrogen)'); 
        score += 3; 
        conf += 20; 
    }
    else if (c.yellowPct > 8) { 
        symptoms.push({ text: 'Slight yellowing detected', found: true, detail: `Yellow: ${c.yellowPct}%` }); 
        issues.push('Possible early nutrient deficiency'); 
        score += 1; 
        conf += 10; 
    }
    else { 
        symptoms.push({ text: 'Normal green color', found: false }); 
        conf += 10; 
    }
    
    // ─── PLANT STRESS ───
    if (c.greenPct < 40) { 
        symptoms.push({ text: 'Low chlorophyll (green color)', found: true, detail: `Green: ${c.greenPct}%` }); 
        issues.push('Plant may be stressed or wilting'); 
        score += 2; 
        conf += 15; 
    }
    else { 
        symptoms.push({ text: 'Good chlorophyll levels', found: false, detail: `Green: ${c.greenPct}%` }); 
        conf += 20; 
    }
    
    // ─── POWDERY MILDEW ───
    if (c.whitePct > 12) { 
        symptoms.push({ text: 'White/powdery patches detected', found: true, detail: `White: ${c.whitePct}%` }); 
        issues.push('🚨 POWDERY MILDEW DETECTED'); 
        score += 3; 
        conf += 15; 
    }
    else if (c.whitePct > 5) { 
        symptoms.push({ text: 'Slight white patches detected', found: true, detail: `White: ${c.whitePct}%` }); 
        issues.push('Possible early mildew or sun damage'); 
        score += 1; 
        conf += 5; 
    }
    else { 
        symptoms.push({ text: 'No powdery mildew signs', found: false }); 
        conf += 5; 
    }
    
    // ─── RUST DETECTION ───
    if (c.orangePct > 8) {
        symptoms.push({ text: 'Orange/rust-colored spots detected', found: true, detail: `Orange: ${c.orangePct}%` });
        issues.push('⚠️ RUST DISEASE DETECTED');
        score += 3;
        conf += 15;
    }
    
    // ─── PHOSPHORUS DEFICIENCY ───
    if (c.purplePct > 5) {
        symptoms.push({ text: 'Purple discoloration detected', found: true, detail: `Purple: ${c.purplePct}%` });
        issues.push('⚠️ Possible Phosphorus deficiency');
        score += 2;
        conf += 10;
    }
    
    // ─── DETERMINE PLANT HEALTH ───
    let plant = '';
    let rec = '';
    
    if (c.greenPct > 60 && c.yellowPct < 8 && c.brownPct < 5 && c.whitePct < 5) {
        plant = '🌱 Healthy Plant';
        rec = '✅ Plant appears healthy. Continue regular monitoring.';
    } else if (c.greenPct > 40 && c.yellowPct < 15 && c.brownPct < 10) {
        plant = '🌿 Stressed Plant';
        rec = '📊 Monitor closely. Check soil moisture and nutrients.';
    } else if (c.greenPct > 20) {
        plant = '🌾 Damaged Crop';
        rec = '⚠️ Issues detected. Consider treatment options.';
    } else {
        plant = '☠️ Severely Damaged';
        rec = '🚨 URGENT: Severe damage detected. Immediate action required!';
    }
    
    conf = Math.min(conf, 95);
    
    if (score >= 7) {
        rec = '🚨 URGENT: Multiple severe issues detected. Apply treatment immediately!';
    } else if (score >= 5) {
        rec = '⚠️ Issues detected. Monitor closely and consider treatment.';
    } else if (score >= 3) {
        rec = '📊 Minor issues detected. Continue monitoring.';
    }
    
    return { symptoms, issues, plant, confidence: Math.round(conf), recommendation: rec, severity: score, colors: c };
}

// ═══════════════════════════════════════════
// ZAMBIAN CROP DATABASE (EXPANDED - 35+ Crops)
// ═══════════════════════════════════════════

const CROP_DB = {
    maize: { 
        name: 'Maize (Zambia)', 
        pests: { 
            fall_armyworm: { name: 'Fall Armyworm', severity: 'critical', lossPct: 25, dosage: 250, chemicals: ['Ampligo','Dudu-Cyber','Rocket','Emamectin Benzoate'], organic: ['Neem Oil','Bt','Hand picking','Push-pull technology'], note: 'Most destructive pest in Zambia. Scout early morning.' },
            stalk_borer: { name: 'Stalk Borer', severity: 'high', lossPct: 20, dosage: 180, chemicals: ['Dudu-Cyber','Chlorpyrifos'], organic: ['Neem Oil','Push-pull'], note: 'Attacks stems causing lodging. Apply at knee-high stage.' }
        }, yieldValue: 2800 
    },
    tomato: { name: 'Tomato (Zambia)', pests: {
            late_blight: { name: 'Late Blight', severity: 'critical', lossPct: 30, dosage: 300, chemicals: ['Rocket','Chlorpyrifos','Mancozeb'], organic: ['Copper spray','Baking soda'], note: 'Spreads rapidly in cool, wet conditions.' },
            aphids: { name: 'Tomato Aphids', severity: 'medium', lossPct: 10, dosage: 250, chemicals: ['Acetamiprid','Dudu-Cyber'], organic: ['Neem Oil','Garlic spray'], note: 'Also transmits viral diseases.' }
        }, yieldValue: 5000 
    },
    rice: { name: 'Rice (Zambia)', pests: {
            blast: { name: 'Rice Blast', severity: 'high', lossPct: 25, dosage: 180, chemicals: ['Tricyclazole','Rocket'], organic: ['Silicon fertilizer','Resistant varieties'], note: 'Favored by high nitrogen and frequent rainfall.' }
        }, yieldValue: 3200 
    },
    beans: { name: 'Beans (Zambia)', pests: {
            aphids: { name: 'Bean Aphids', severity: 'medium', lossPct: 12, dosage: 120, chemicals: ['Acetamiprid','Dudu-Cyber'], organic: ['Neem Oil','Companion planting'], note: 'Check flowering stage.' }
        }, yieldValue: 1800 
    },
    cabbage: { name: 'Cabbage (Zambia)', pests: {
            diamondback_moth: { name: 'Diamondback Moth', severity: 'high', lossPct: 22, dosage: 160, chemicals: ['Dudu-Cyber','Emamectin Benzoate'], organic: ['Bt spray','Neem Oil','Row covers'], note: 'Rotate chemicals to prevent resistance.' }
        }, yieldValue: 2800 
    }
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
        case 'sensorhub': updateScanMapUI(); break;
    }
}

function showPhonePage(pageId, btn) {
    showPage(pageId);
    document.querySelectorAll('.phone-nav-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (pageId === 'sensorhub') updateScanMapUI();
}

// ═══════════════════════════════════════════
// FARM MATH TOOL
// ═══════════════════════════════════════════

function populatePests() {
    const crop = document.getElementById('mathCrop').value;
    const pestSelect = document.getElementById('mathPest');
    pestSelect.innerHTML = '';
    if (!CROP_DB[crop]) {
        pestSelect.innerHTML = '<option value="">No pests data available</option>';
        return;
    }
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
    if (!CROP_DB[crop] || !CROP_DB[crop].pests[pest]) return;
    const data = CROP_DB[crop].pests[pest];
    if (data) {
        document.getElementById('mathDosage').value = data.dosage;
        document.getElementById('mathChemName').placeholder = `e.g., ${data.chemicals[0]}, ${data.chemicals[1] || ''}`;
    }
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

function deleteChem(idx) { 
    savedChems.splice(idx, 1); 
    localStorage.setItem('agrimind_chems', JSON.stringify(savedChems)); 
    renderSavedChems(); 
}

function renderSavedChems() {
    if (savedChems.length === 0) { 
        document.getElementById('savedChems').style.display = 'none'; 
        return; 
    }
    document.getElementById('savedChems').style.display = 'block';
    document.getElementById('savedChems').innerHTML = '<label style="color:var(--accent);">Saved Chemicals</label>' + 
        savedChems.map((c, i) => `
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
    const chemName = document.getElementById('mathChemName').value.trim() || 'Chemical';
    const contSize = parseFloat(document.getElementById('mathContSize').value) || 250;
    const contPrice = parseFloat(document.getElementById('mathContPrice').value) || 150;
    const dosage = parseFloat(document.getElementById('mathDosage').value) || 200;
    const unit = document.getElementById('mathDosageUnit').value;
    const farmSize = parseFloat(document.getElementById('mathFarmSlider').value);
    
    if (!CROP_DB[crop] || !CROP_DB[crop].pests[pestKey]) {
        showToast('Please select a valid crop and pest', true);
        return;
    }
    
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
            <h3 style="color:var(--accent);">🌾 ${cropData.name}</h3>
            <h4 style="color:var(--danger);">${pestData.name}</h4>
            <p style="font-size:0.85rem;">${chemName} | K${contPrice}/${contSize}ml | Cost/ml: K${costPerMl.toFixed(2)}</p>
            <div class="grid-2cols" style="margin:14px 0;">
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${totalMl.toFixed(1)}ml</div>
                    <small>Spray Needed</small>
                </div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--accent);">${containers}</div>
                    <small>Bottles (${contSize}ml)</small>
                </div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${totalCost.toFixed(2)}</div>
                    <small>Total Cost</small>
                </div>
                <div style="text-align:center;padding:10px;background:rgba(16,185,129,0.1);border-radius:14px;">
                    <div style="font-size:1.2rem;font-weight:700;color:var(--accent);">K${savings.toFixed(2)}</div>
                    <small>Net Savings</small>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:10px;font-size:0.85rem;">
                <div style="display:flex;justify-content:space-between;">
                    <span>Potential Loss (no spray):</span>
                    <span style="color:var(--danger);">K${potentialLoss.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span>ROI:</span>
                    <span style="color:var(--accent);">${roi.toFixed(0)}%</span>
                </div>
            </div>
            <div style="margin-top:10px;padding:10px;background:${savings>0?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'};border-radius:10px;border-left:3px solid ${savings>0?'var(--accent)':'var(--danger)'};font-weight:600;font-size:0.85rem;">
                ${savings > totalCost*3 ? '🚨 URGENT: Very high ROI - spray now!' : 
                  savings > totalCost ? '✅ RECOMMENDED: Good return on investment' : 
                  '📊 MONITOR: Only spray if pest pressure increases'}
            </div>
            <p style="font-size:0.75rem;margin-top:8px;">📝 ${pestData.note}</p>
            <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:8px;background:rgba(16,185,129,0.1);border-radius:8px;">
                    <strong style="color:var(--accent);">🌿 Organic Options</strong>
                    <p style="font-size:0.7rem;margin-top:4px;">${pestData.organic.join(', ')}</p>
                </div>
                <div style="padding:8px;background:rgba(245,158,11,0.1);border-radius:8px;">
                    <strong style="color:#f59e0b;">🧪 Chemical Options</strong>
                    <p style="font-size:0.7rem;margin-top:4px;">${pestData.chemicals.join(', ')}</p>
                </div>
            </div>
            <div style="margin-top:8px;padding:8px;background:rgba(16,185,129,0.05);border-radius:8px;font-size:0.7rem;color:var(--text-secondary);">
                ⚠️ Severity: ${pestData.severity.toUpperCase()} | ${pestData.lossPct}% potential yield loss
            </div>
        </div>`;
    document.getElementById('mathResult').scrollIntoView({ behavior: 'smooth' });
    showToast('Calculation complete!');
    
    if (currentUser) {
        db.from('farm_records').insert({ 
            user_id: currentUser.id, 
            title: `Spray Calc: ${cropData.name} - ${pestData.name}`, 
            detail: `${chemName} | Farm: ${farmSize}ha | Spray: ${totalMl.toFixed(1)}ml | Cost: K${totalCost.toFixed(2)} | Savings: K${savings.toFixed(2)}`, 
            location: 'Farm Math Tool' 
        }).then(() => {}).catch(() => {});
    }
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
    const severityColor = diagnosis.severity > 4 ? '#dc2626' : 
                          diagnosis.severity > 2 ? '#f59e0b' : 
                          diagnosis.severity > 0 ? '#3b82f6' : '#10B981';
    
    preview.innerHTML = `
        <img src="${imageSrc}" style="max-width:100%;border-radius:20px;margin-bottom:10px;max-height:300px;object-fit:contain;">
        
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:8px 12px;background:var(--input-bg);border-radius:12px;">
            <span style="font-weight:700;font-size:1.1rem;">${diagnosis.plant}</span>
            <span style="font-size:0.85rem;color:${diagnosis.confidence > 70 ? 'var(--accent)' : '#f59e0b'};font-weight:600;">
                ${diagnosis.confidence}% confidence
            </span>
        </div>
        
        <div style="margin-bottom:10px;">
            <small style="color:var(--text-secondary,#aaa);font-size:0.75rem;">Color Breakdown (HSV Analysis)</small>
            <div style="display:flex;height:20px;border-radius:8px;overflow:hidden;margin:4px 0;border:1px solid var(--border);">
                <div style="width:${c.greenPct}%;background:#22c55e;transition:width 0.5s;" title="Green: ${c.greenPct}%"></div>
                <div style="width:${c.yellowPct}%;background:#eab308;transition:width 0.5s;" title="Yellow: ${c.yellowPct}%"></div>
                <div style="width:${c.brownPct}%;background:#92400e;transition:width 0.5s;" title="Brown: ${c.brownPct}%"></div>
                <div style="width:${c.darkPct}%;background:#374151;transition:width 0.5s;" title="Dark: ${c.darkPct}%"></div>
                <div style="width:${c.whitePct}%;background:#e5e5e5;transition:width 0.5s;" title="White: ${c.whitePct}%"></div>
                ${c.orangePct > 0 ? `<div style="width:${c.orangePct}%;background:#f97316;transition:width 0.5s;" title="Orange: ${c.orangePct}%"></div>` : ''}
                ${c.purplePct > 0 ? `<div style="width:${c.purplePct}%;background:#8b5cf6;transition:width 0.5s;" title="Purple: ${c.purplePct}%"></div>` : ''}
                ${c.redPct > 0 ? `<div style="width:${c.redPct}%;background:#ef4444;transition:width 0.5s;" title="Red: ${c.redPct}%"></div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-secondary,#aaa);flex-wrap:wrap;">
                <span>🌿 Grn ${c.greenPct}%</span>
                <span>🌽 Ylw ${c.yellowPct}%</span>
                <span>🟫 Brn ${c.brownPct}%</span>
                <span>⬛ Drk ${c.darkPct}%</span>
                <span>⬜ Wht ${c.whitePct}%</span>
                ${c.orangePct > 0 ? `<span>🟧 Orn ${c.orangePct}%</span>` : ''}
                ${c.purplePct > 0 ? `<span>🟣 Pur ${c.purplePct}%</span>` : ''}
            </div>
        </div>
        
        <div style="background:var(--input-bg);border-radius:12px;padding:12px;margin-bottom:10px;">
            <strong style="font-size:0.85rem;">Symptoms:</strong>
            ${diagnosis.symptoms.map(s => `
                <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.8rem;">
                    <span>${s.found ? '⚠️' : '✅'}</span>
                    <span>${s.text}</span>
                    ${s.detail ? `<span style="font-size:0.65rem;color:var(--text-secondary,#aaa);">${s.detail}</span>` : ''}
                </div>
            `).join('')}
        </div>
        
        ${diagnosis.issues.length > 0 ? `
            <div style="margin-bottom:10px;padding:12px;background:rgba(245,158,11,0.12);border-radius:12px;border-left:3px solid #f59e0b;">
                <strong style="color:#f59e0b;font-size:0.85rem;">Issues Detected:</strong>
                ${diagnosis.issues.map(i => `<div style="font-size:0.8rem;padding:2px 0;">${i}</div>`).join('')}
            </div>
        ` : ''}
        
        <div style="padding:12px;background:rgba(${diagnosis.severity > 4 ? '220,38,38' : diagnosis.severity > 2 ? '245,158,11' : '16,185,129'},0.1);border-radius:12px;border-left:3px solid ${severityColor};margin-bottom:10px;">
            <strong style="font-size:0.85rem;">Recommendation:</strong>
            <div style="font-size:0.85rem;margin-top:4px;">${diagnosis.recommendation}</div>
        </div>
        
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${diagnosis.severity > 2 ? `
                <button class="btn-outline" onclick="showPhonePage('farmmath')" style="font-size:0.75rem;padding:6px 12px;flex:1;">
                    🧪 Calculate Spray
                </button>
                <button class="btn-outline" onclick="showPhonePage('market')" style="font-size:0.75rem;padding:6px 12px;flex:1;">
                    🛒 Buy Products
                </button>
            ` : ''}
            <button class="btn-outline" onclick="document.getElementById('leafUpload').click()" style="font-size:0.75rem;padding:6px 12px;flex:1;">
                📷 Scan Another
            </button>
        </div>
    `;
    
    // Scroll to results
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getGPS() {
    if (!navigator.geolocation) { 
        document.getElementById('gpsLabel').textContent = 'Not supported'; 
        return; 
    }
    document.getElementById('gpsLabel').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(pos => {
        currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('gpsLabel').textContent = `${currentSensorGPS.lat.toFixed(3)}, ${currentSensorGPS.lon.toFixed(3)}`;
    }, () => { 
        document.getElementById('gpsLabel').textContent = 'Denied'; 
    }, { enableHighAccuracy: true });
}

function checkLight() {
    if ('AmbientLightSensor' in window) {
        try {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => { 
                currentSensorLight = sensor.illuminance; 
                updateLightLabel(); 
            };
            sensor.onerror = () => { 
                document.getElementById('lightLabel').textContent = 'Sensor error'; 
            };
            sensor.start();
            setTimeout(() => sensor.stop(), 1000);
        } catch(e) { 
            document.getElementById('lightLabel').textContent = 'Not available'; 
        }
    } else { 
        document.getElementById('lightLabel').textContent = 'Not supported'; 
    }
}

function updateLightLabel() {
    const el = document.getElementById('lightLabel');
    if (!currentSensorLight) return;
    if (currentSensorLight < 100) { 
        el.innerHTML = '🌑 Too dark<br><small style="color:var(--danger);">Move to better light</small>'; 
    }
    else if (currentSensorLight < 500) { 
        el.innerHTML = '☁️ Moderate light'; 
    }
    else { 
        el.innerHTML = '☀️ Optimal lighting'; 
    }
}

function toggleScanMap() {
    const map = document.getElementById('scanMapDiv');
    map.style.display = map.style.display === 'none' ? 'block' : 'none';
    updateScanMapUI();
}

function updateScanMapUI() {
    const list = document.getElementById('scanMapList');
    if (!sensorScans.length) { 
        list.innerHTML = '<p style="color:#aaa;text-align:center;">No scans yet. Upload a leaf photo to start!</p>'; 
        return; 
    }
    list.innerHTML = sensorScans.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);">
            <span>${s.diagnosis.severity>0?'●':'○'}</span>
            <div style="flex:1;font-size:0.8rem;">
                <strong>${s.diagnosis.plant}</strong> (${s.diagnosis.confidence}%)
                ${s.gps?`<br><small>${s.gps.lat.toFixed(3)}, ${s.gps.lon.toFixed(3)}</small>`:''}
            </div>
            <small>${new Date(s.timestamp).toLocaleTimeString()}</small>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════
// AUTO-SCOUT
// ═══════════════════════════════════════════

async function startScout() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
    }
    scoutingActive = true;
    scoutSteps = 0; scoutScans = 0; scoutInfections = 0; scoutDist = 0; 
    scoutStepsSinceScan = 0; scoutPendingScan = false;
    
    document.getElementById('startScoutBtn').style.display = 'none';
    document.getElementById('stopScoutBtn').style.display = 'inline-block';
    document.getElementById('scoutStatusDiv').innerHTML = '<div style="font-size:4rem;">●</div><h3 style="color:var(--accent);">Scouting Active</h3><p>Walk your field. Tap prompt to scan.</p>';
    document.getElementById('scoutLog').innerHTML = '';
    scoutLog('Started. Walk your field...');
    document.getElementById('scoutPrompt').style.display = 'none';
    
    if (window.DeviceMotionEvent) { 
        window.addEventListener('devicemotion', detectStep); 
        scoutLog('Accelerometer active - counting real steps'); 
    } else { 
        scoutLog('Accelerometer not available - using timer mode'); 
    }
    
    scoutTimer = setInterval(() => { if (scoutingActive) checkForScanPrompt(); }, 2000);
}

function stopScout() {
    scoutingActive = false;
    clearInterval(scoutTimer);
    window.removeEventListener('devicemotion', detectStep);
    
    document.getElementById('startScoutBtn').style.display = 'inline-block';
    document.getElementById('stopScoutBtn').style.display = 'none';
    document.getElementById('scoutStatusDiv').innerHTML = '<div style="font-size:4rem;">■</div><h3>Stopped</h3>';
    document.getElementById('scoutPrompt').style.display = 'none';
    scoutPendingScan = false;
    scoutLog('Scouting complete.');
    
    const sprayMl = scoutInfections * 50;
    const sprayCost = (sprayMl * 0.19).toFixed(2);
    
    document.getElementById('scoutReport').innerHTML = `
        <div class="math-result">
            <h3 style="color:var(--accent);">Scout Report</h3>
            <div class="grid-2cols" style="margin:12px 0;">
                <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent);">${scoutScans}</div>
                    <small>Photos Taken</small>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--danger);">${scoutInfections}</div>
                    <small>Issues Found</small>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent);">${scoutSteps}</div>
                    <small>Steps</small>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--accent);">${scoutDist}m</div>
                    <small>Distance</small>
                </div>
            </div>
            ${scoutInfections>0 ? `
                <div style="padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:0.85rem;">
                    <div style="display:flex;justify-content:space-between;">
                        <span>Recommended Spray:</span>
                        <span>${sprayMl}ml</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span>Est. Cost:</span>
                        <span>K${sprayCost}</span>
                    </div>
                </div>
            ` : '<p style="color:var(--accent);text-align:center;">No issues detected during scouting.</p>'}
            <div style="display:flex;gap:6px;margin-top:10px;">
                <button class="btn-outline" onclick="showPhonePage('sensorhub')" style="font-size:0.8rem;">View Map</button>
                <button class="btn-primary" onclick="showPhonePage('farmmath')" style="font-size:0.8rem;">Calculate Spray</button>
            </div>
        </div>`;
}

function detectStep(e) {
    if (!scoutingActive) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    if (mag > 12 && (Math.abs(a.x-scoutLastAccel.x)>3 || Math.abs(a.y-scoutLastAccel.y)>3)) {
        const now = Date.now();
        if (now - scoutLastStep > 300) {
            scoutSteps++; 
            scoutStepsSinceScan++;
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
    if (scoutStepsSinceScan >= 2 || (scoutSteps === 0 && scoutScans === 0)) {
        scoutPendingScan = true;
        showScanPrompt();
    }
}

function showScanPrompt() {
    const prompt = document.getElementById('scoutPrompt');
    document.getElementById('promptStepNum').textContent = scoutSteps;
    prompt.style.display = 'block';
    if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
    
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 600;
        gain.gain.value = 0.15;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 300);
    } catch(e) {}
    
    scoutLog('📷 Tap prompt to scan now! (Step ' + scoutSteps + ')');
}

function captureScoutPhoto() { 
    document.getElementById('scoutCamera').click(); 
}

function handleScoutPhoto(event) {
    const file = event.target.files[0];
    if (!file) { 
        scoutPendingScan = false; 
        document.getElementById('scoutPrompt').style.display = 'none'; 
        return; 
    }
    
    scoutScans++;
    scoutStepsSinceScan = 0;
    document.getElementById('scoutScans').textContent = scoutScans;
    document.getElementById('scoutPrompt').style.display = 'none';
    scoutPendingScan = false;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 300;
            const ratio = Math.min(maxSize / img.width, maxSize / img.height);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Use the SAME HSV analysis as the sensor hub
            const colors = analyzeLeafColors(imageData);
            const diagnosis = diagnoseFromColors(colors);
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    currentSensorGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                    sensorScans.push({ 
                        id: Date.now(), 
                        timestamp: new Date().toISOString(), 
                        gps: currentSensorGPS, 
                        light: currentSensorLight, 
                        diagnosis, 
                        step: scoutSteps 
                    });
                    if (diagnosis.severity > 2) {
                        scoutInfections++;
                        document.getElementById('scoutInfections').textContent = scoutInfections;
                        scoutLog('⚠️ Issue detected at step ' + scoutSteps + '! Severity: ' + diagnosis.severity + '/10');
                        showToast('⚠️ Issue detected! Location saved.', true);
                    } else {
                        scoutLog('✓ Scan at step ' + scoutSteps + ': ' + diagnosis.plant + ' (' + diagnosis.confidence + '% confidence)');
                        showToast('✅ Scan saved: ' + diagnosis.plant);
                    }
                });
            } else {
                sensorScans.push({ 
                    id: Date.now(), 
                    timestamp: new Date().toISOString(), 
                    gps: null, 
                    light: currentSensorLight, 
                    diagnosis, 
                    step: scoutSteps 
                });
                scoutLog('✓ Scan at step ' + scoutSteps + ': ' + diagnosis.plant);
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
    document.getElementById('authDisplayNameInput').style.display = mode === 'login' ? 'none' : 'block';
    document.getElementById('authModal').style.display = 'flex';
    authMode = mode;
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
    ['authEmail','authPass','authDisplayNameInput'].forEach(id => document.getElementById(id).value='');
}

// ═══════════════════════════════════════════
// DOM READY
// ═══════════════════════════════════════════

let authMode = 'login';

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
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', e => { 
            e.preventDefault(); 
            showPage(li.dataset.page); 
        });
    });

    // Auth
    document.getElementById('loginBtn').addEventListener('click', () => openModal('login'));
    document.getElementById('signupBtn').addEventListener('click', () => openModal('signup'));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('authModal').addEventListener('click', e => { 
        if (e.target === e.currentTarget) closeModal(); 
    });
    
    document.getElementById('authSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPass').value;
        const displayName = document.getElementById('authDisplayNameInput').value.trim();
        try {
            if (authMode === 'login') await login(email, password);
            else { 
                if (!displayName) return showToast('Display name required', true); 
                await signUp(email, password, displayName); 
            }
            closeModal();
        } catch (err) { 
            showToast(err.message, true); 
        }
    });
    document.getElementById('userGreeting').addEventListener('click', logout);

    // Job posting
    document.getElementById('postJobBtn').addEventListener('click', () => {
        const t = document.getElementById('jobTitle').value.trim();
        const d = document.getElementById('jobDesc').value.trim();
        const l = document.getElementById('jobLocation').value.trim();
        if (t) { 
            addJob(t, d, l); 
            document.getElementById('jobTitle').value = ''; 
            document.getElementById('jobDesc').value = ''; 
            document.getElementById('jobLocation').value = ''; 
        }
    });

    // Click handlers for dynamic elements
    document.querySelector('.main-content')?.addEventListener('click', async (e) => {
        const target = e.target;
        
        if (target.closest('.apply-btn')) { 
            e.preventDefault(); 
            applyToJob(target.closest('.apply-btn').dataset.job); 
        }
        
        if (target.closest('.accept-app')) {
            updateApplicationStatus(target.closest('.accept-app').dataset.id, 'accepted');
        }
        
        if (target.closest('.reject-app')) {
            updateApplicationStatus(target.closest('.reject-app').dataset.id, 'rejected');
        }
        
        if (target.closest('.contact-applicant-btn') || target.closest('.contact-poster-btn')) {
            const btn = target.closest('.contact-applicant-btn') || target.closest('.contact-poster-btn');
            const email = btn.dataset.email;
            const name = btn.dataset.name;
            
            if (email && email !== 'N/A' && email !== 'undefined') {
                document.getElementById('msgTo').value = email;
                document.getElementById('msgText').value = `Hello ${name}, `;
                showPage('messages');
                showToast(`Composing message to ${name}`);
            } else {
                showToast('No email available for this contact', true);
            }
        }

        if (target.closest('.delete-btn')) {
            const btn = target.closest('.delete-btn');
            const type = btn.dataset.type;
            const id = btn.dataset.id;
            if (type === 'forum') deleteForumPost(id);
            else if (type === 'record') deleteRecord(id);
            else if (type === 'job') deleteJob(id);
            else if (type === 'product') deleteProduct(id);
            else if (type === 'tutorial') deleteTutorial(id);
            else if (type === 'calendar') deleteCalendarEvent(id);
        }

        if (target.closest('.like-btn')) {
            const btn = target.closest('.like-btn');
            toggleLike(btn.dataset.type, btn.dataset.id);
        }

        if (target.closest('.reply-toggle')) {
            const postId = target.closest('.reply-toggle').dataset.post;
            const replyDiv = target.closest('.forum-post').nextElementSibling;
            if (replyDiv && replyDiv.classList.contains('reply-section')) {
                replyDiv.style.display = replyDiv.style.display === 'none' ? 'block' : 'none';
                if (replyDiv.style.display === 'block') loadReplies(postId, replyDiv);
            }
        }

        if (target.closest('.send-reply')) {
            const postId = target.closest('.send-reply').dataset.post;
            const input = target.closest('.reply-section').querySelector('.reply-input');
            if (input && input.value.trim()) {
                addReply(postId, input.value.trim());
                input.value = '';
            }
        }

        if (target.closest('.join-group-btn')) {
            const groupId = target.closest('.join-group-btn').dataset.group;
            showToast('Joined group! (Feature coming soon)');
        }
    });

    // Forum
    document.getElementById('postForumBtn').addEventListener('click', () => {
        const c = document.getElementById('forumContent').value.trim();
        const img = document.getElementById('forumImage').files[0];
        if (c) { 
            addForumPost(c, img); 
            document.getElementById('forumContent').value = ''; 
            document.getElementById('forumImage').value = ''; 
        }
    });

    // Groups
    document.getElementById('createGroupBtn').addEventListener('click', createGroup);
    document.getElementById('groupLocationFilter').addEventListener('input', loadGroups);

    // Records
    document.getElementById('addRecordBtn').addEventListener('click', () => {
        const t = document.getElementById('recordTitle').value.trim();
        const d = document.getElementById('recordDetail').value.trim();
        const l = document.getElementById('recordLocation').value.trim();
        if (t) { 
            addRecord(t, d, l); 
            document.getElementById('recordTitle').value = ''; 
            document.getElementById('recordDetail').value = ''; 
            document.getElementById('recordLocation').value = ''; 
        }
    });

    // Job location filter
    document.getElementById('jobLocationFilter').addEventListener('input', loadJobs);

    // Market
    document.getElementById('addProductBtn').addEventListener('click', () => {
        const n = document.getElementById('productName').value.trim();
        const p = document.getElementById('productPrice').value.trim();
        const cat = document.getElementById('productCategory').value;
        const loc = document.getElementById('productLocation').value.trim();
        const img = document.getElementById('productImage').files[0];
        if (n && p) { 
            addProduct(n, p, cat, loc, img); 
            document.getElementById('productName').value = ''; 
            document.getElementById('productPrice').value = ''; 
            document.getElementById('productLocation').value = ''; 
        }
    });
    document.getElementById('marketCategoryFilter').addEventListener('change', loadMarket);
    document.getElementById('marketLocationFilter').addEventListener('input', loadMarket);

    // Messages
    document.getElementById('sendMsgBtn').addEventListener('click', () => {
        const to = document.getElementById('msgTo').value.trim();
        const tx = document.getElementById('msgText').value.trim();
        if (to && tx) { 
            sendMessage(to, tx); 
            document.getElementById('msgTo').value = ''; 
            document.getElementById('msgText').value = ''; 
        }
    });

    // Search
    document.getElementById('doSearchBtn').addEventListener('click', () => {
        const term = document.getElementById('searchInput').value.trim();
        const cat = document.getElementById('searchCategory').value;
        const from = document.getElementById('searchDateFrom').value;
        const to = document.getElementById('searchDateTo').value;
        if (term) globalSearch(term, cat, from, to);
    });

    // Tutorials
    document.getElementById('addVideoBtn').addEventListener('click', () => {
        const t = document.getElementById('videoTitle').value.trim();
        const u = document.getElementById('videoUrl').value.trim();
        const d = document.getElementById('videoDesc').value.trim();
        if (t && u) { 
            addTutorial(t, u, d); 
            document.getElementById('videoTitle').value = ''; 
            document.getElementById('videoUrl').value = ''; 
            document.getElementById('videoDesc').value = ''; 
        }
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
        const { error } = await db.from('profiles').update({ 
            display_name: dn, 
            phone: ph, 
            location: loc, 
            bio: bio 
        }).eq('id', currentUser.id);
        if (error) showToast('Failed to update', true);
        else { 
            currentUser.displayName = dn; 
            updateAuthUI(); 
            showToast('Profile updated!'); 
            loadProfile(); 
        }
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
    document.getElementById('mathCrop').addEventListener('change', populatePests);
    document.getElementById('mathPest').addEventListener('change', updateDosageFromPest);
    document.getElementById('mathContSize').addEventListener('input', updateCostPerMl);
    document.getElementById('mathContPrice').addEventListener('input', updateCostPerMl);
    document.getElementById('mathDosage').addEventListener('input', updateCostPerMl);
    document.getElementById('mathDosageUnit').addEventListener('change', updateCostPerMl);
    populatePests();
    updateCostPerMl();
    renderSavedChems();

    checkSession();
    showPage('dashboard');
});

// Add missing reply function
async function addReply(postId, content) {
    if (!currentUser) return showToast('Please login', true);
    await db.from('forum_replies').insert({ post_id: postId, user_id: currentUser.id, content });
    showToast('Reply posted!');
    const replyDiv = document.querySelector(`.reply-toggle[data-post="${postId}"]`).closest('.forum-post').nextElementSibling;
    if (replyDiv) loadReplies(postId, replyDiv);
}
