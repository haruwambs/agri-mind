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
        const { data: profile } = await db.from('profiles')
            .select('display_name,email,phone,location,bio,created_at')
            .eq('id', session.user.id)
            .single();
        
        let displayName = 'Farmer';
        
        if (profile?.display_name && profile.display_name.trim() !== '') {
            displayName = profile.display_name.trim();
        } 
        else if (session.user.email) {
            let emailPrefix = session.user.email.split('@')[0];
            let cleanName = emailPrefix
                .replace(/[._-]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .trim();
            
            if (cleanName.length > 20 || cleanName.includes('_') || cleanName.includes('-')) {
                cleanName = 'Farmer';
            }
            
            displayName = cleanName || 'Farmer';
        }
        
        currentUser = { 
            id: session.user.id, 
            email: session.user.email, 
            displayName: displayName 
        };
        
        // Update profile with email if missing
        if (profile && (!profile.email || profile.email === '')) {
            try {
                await db.from('profiles')
                    .update({ 
                        display_name: displayName,
                        email: session.user.email 
                    })
                    .eq('id', session.user.id);
                console.log('Updated profile with email for user:', session.user.id);
            } catch (err) {
                console.log('Could not update profile:', err);
            }
        }
        
        if (profile && (!profile.display_name || profile.display_name.trim() === '')) {
            try {
                await db.from('profiles')
                    .update({ display_name: displayName })
                    .eq('id', session.user.id);
            } catch (err) {
                console.log('Could not update display name:', err);
            }
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
    
    const nameToSave = displayName?.trim() || email.split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim() || 'Farmer';
    
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
            else if (pf?.email) dn = pf.email.split('@')[0];
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
                else if (pf?.email) dn = pf.email.split('@')[0];
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
            if (pf?.display_name && pf.display_name.trim() !== '') posterName = pf.display_name.trim();
            else if (pf?.email) posterName = pf.email.split('@')[0];
            posterEmail = pf?.email || 'N/A';
        }
        const { count: ac } = await db.from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', j.id);
        const isOwner = currentUser && currentUser.id === j.user_id;
        container.innerHTML += `<div class="job-item">
            <strong>${escapeHtml(j.title)}</strong>
            <p>${escapeHtml(j.description||'')}</p>
            ${j.location?`<p>📍 ${escapeHtml(j.location)}</p>`:''}
            <small>Posted by: ${escapeHtml(posterName)}</small>
            ${!isOwner && currentUser ? `<br><small>📧 ${escapeHtml(posterEmail)}</small>` : ''}
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
            
            for (const app of apps) {
                const appDiv = document.createElement('div');
                appDiv.className = 'job-item';
                
                let applicantEmail = 'N/A';
                let applicantName = 'Unknown';
                let applicantPhone = 'N/A';
                let applicantLocation = 'N/A';
                
                if (app.applicant_id) {
                    try {
                        const { data: profile, error: profileError } = await db.from('profiles')
                            .select('display_name, email, phone, location')
                            .eq('id', app.applicant_id)
                            .single();
                        
                        if (profileError) {
                            console.error('Error fetching profile for applicant:', app.applicant_id, profileError);
                        } else if (profile) {
                            applicantEmail = profile.email || 'N/A';
                            applicantName = profile.display_name?.trim() || profile.email?.split('@')[0] || 'Unknown';
                            applicantPhone = profile.phone || 'N/A';
                            applicantLocation = profile.location || 'N/A';
                        }
                    } catch (err) {
                        console.error('Exception fetching profile:', err);
                    }
                }
                
                const statusColor = app.status === 'accepted' ? '#10B981' : 
                                   app.status === 'rejected' ? '#dc2626' : '#f59e0b';
                
                let html = `<div style="border-left:5px solid ${statusColor};padding-left:12px;">
                    <strong>${escapeHtml(applicantName)}</strong>
                    <p style="margin-top:4px;"><strong>📧 Email:</strong> ${escapeHtml(applicantEmail)}</p>`;
                
                if (app.status === 'accepted') {
                    html += `
                        <p><strong>📱 Phone:</strong> ${escapeHtml(applicantPhone)}</p>
                        <p><strong>📍 Location:</strong> ${escapeHtml(applicantLocation)}</p>`;
                }
                
                html += `
                    <p><strong>💬 Message:</strong> ${escapeHtml(app.applicant_message || 'No message')}</p>
                    <small>Applied: ${new Date(app.created_at).toLocaleDateString()}</small>
                    <br><span style="color:${statusColor};font-weight:600;">Status: ${app.status}</span>`;
                
                if (app.status === 'pending') {
                    html += `
                        <div style="margin-top:8px;display:flex;gap:8px;">
                            <button class="btn-outline accept-app" data-id="${app.id}" style="font-size:12px;padding:6px 14px;">✅ Accept</button>
                            <button class="btn-outline reject-app" data-id="${app.id}" style="font-size:12px;padding:6px 14px;border-color:#dc2626;color:#dc2626;">❌ Reject</button>
                        </div>`;
                }
                
                if (app.status === 'accepted' && applicantEmail && applicantEmail !== 'N/A') {
                    html += `
                        <div style="margin-top:12px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                            <button class="btn-primary contact-applicant-btn" 
                                data-email="${escapeHtml(applicantEmail)}" 
                                data-name="${escapeHtml(applicantName)}" 
                                data-phone="${escapeHtml(applicantPhone)}"
                                data-applicantid="${app.applicant_id}"
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
        
        for (const app of apps) {
            const appDiv = document.createElement('div');
            appDiv.className = 'job-item';
            
            let jobTitle = 'Unknown Job';
            let jobLocation = '';
            let jobDescription = '';
            let employerId = null;
            
            try {
                const { data: job, error: jobError } = await db.from('job_listings')
                    .select('title, description, location, user_id')
                    .eq('id', app.job_id)
                    .single();
                
                if (jobError) {
                    console.error('Error fetching job:', jobError);
                } else if (job) {
                    jobTitle = job.title || 'Unknown Job';
                    jobLocation = job.location || '';
                    jobDescription = job.description || '';
                    employerId = job.user_id;
                }
            } catch (err) {
                console.error('Exception fetching job:', err);
            }
            
            let employerEmail = 'N/A';
            let employerName = 'Unknown';
            let employerPhone = 'N/A';
            
            if (employerId) {
                try {
                    // First try to get from profiles
                    const { data: profile, error: profileError } = await db.from('profiles')
                        .select('display_name, email, phone')
                        .eq('id', employerId)
                        .single();
                    
                    if (profileError) {
                        console.error('Error fetching employer profile:', profileError);
                    } else if (profile) {
                        employerEmail = profile.email || 'N/A';
                        employerName = profile.display_name?.trim() || profile.email?.split('@')[0] || 'Unknown';
                        employerPhone = profile.phone || 'N/A';
                    }
                    
                    // If still no email, try to get from auth (if admin)
                    if (employerEmail === 'N/A') {
                        try {
                            const { data: authUser } = await db.auth.admin.getUserById(employerId);
                            if (authUser && authUser.email) {
                                employerEmail = authUser.email;
                                // Update profile with email
                                await db.from('profiles')
                                    .update({ email: authUser.email })
                                    .eq('id', employerId);
                                console.log('Updated employer profile with email from auth');
                            }
                        } catch (authErr) {
                            console.log('Cannot fetch auth user (admin rights needed)');
                        }
                    }
                } catch (err) {
                    console.error('Exception fetching employer profile:', err);
                }
            }
            
            const statusColor = app.status === 'accepted' ? '#10B981' : 
                               app.status === 'rejected' ? '#dc2626' : '#f59e0b';
            
            let html = `<div style="border-left:5px solid ${statusColor};padding-left:12px;">
                <strong>${escapeHtml(jobTitle)}</strong>`;
            
            if (jobLocation) {
                html += `<p>📍 ${escapeHtml(jobLocation)}</p>`;
            }
            
            if (jobDescription) {
                html += `<p>${escapeHtml(jobDescription)}</p>`;
            }
            
            html += `
                <small>Employer: ${escapeHtml(employerName)}</small>`;
            
            // Always show employer email if available
            if (employerEmail && employerEmail !== 'N/A') {
                html += `<br><small>📧 ${escapeHtml(employerEmail)}</small>`;
            }
            
            if (employerPhone && employerPhone !== 'N/A') {
                html += `<br><small>📱 ${escapeHtml(employerPhone)}</small>`;
            }
            
            html += `
                <br><small>Applied: ${new Date(app.created_at).toLocaleDateString()}</small>
                <br><span style="color:${statusColor};font-weight:600;">Status: ${app.status}</span>`;
            
            // Show contact button if employer has email
            if (employerEmail && employerEmail !== 'N/A') {
                html += `
                    <div style="margin-top:12px;padding:12px;background:rgba(16,185,129,0.1);border-radius:10px;border:1px solid #10B981;">
                        <button class="btn-primary contact-poster-btn" 
                            data-email="${escapeHtml(employerEmail)}" 
                            data-name="${escapeHtml(employerName)}" 
                            data-phone="${escapeHtml(employerPhone)}"
                            data-employerid="${employerId}"
                            data-jobtitle="${escapeHtml(jobTitle)}"
                            style="font-size:12px;padding:8px 16px;width:100%;">
                            <i class="fas fa-envelope"></i> Contact ${escapeHtml(employerName)} about ${escapeHtml(jobTitle)}
                        </button>
                    </div>`;
            } else {
                html += `
                    <div style="margin-top:12px;padding:12px;background:rgba(245,158,11,0.1);border-radius:10px;border:1px solid #f59e0b;">
                        <p style="color:#f59e0b;font-size:0.85rem;">⚠️ Employer contact information not available. Please try again later.</p>
                    </div>`;
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

// ────────── Fix Missing Emails ──────────
async function fixMissingEmails() {
    if (!currentUser) {
        showToast('Please login first', true);
        return;
    }
    
    showToast('Checking for missing emails...');
    
    try {
        // Get all profiles without emails
        const { data: profiles, error } = await db.from('profiles')
            .select('id, email')
            .is('email', null);
        
        if (error) {
            console.error('Error fetching profiles:', error);
            showToast('Error checking profiles', true);
            return;
        }
        
        if (!profiles || profiles.length === 0) {
            showToast('✅ All profiles have emails!');
            return;
        }
        
        console.log(`Found ${profiles.length} profiles without emails`);
        let fixed = 0;
        
        for (const profile of profiles) {
            try {
                // Try to get email from auth
                const { data: authUser } = await db.auth.admin.getUserById(profile.id);
                if (authUser && authUser.email) {
                    await db.from('profiles')
                        .update({ email: authUser.email })
                        .eq('id', profile.id);
                    fixed++;
                    console.log(`Updated email for user ${profile.id}`);
                }
            } catch (err) {
                console.log(`Could not update user ${profile.id}:`, err);
            }
        }
        
        showToast(`✅ Fixed ${fixed} profiles with missing emails`);
        
        // Reload applications
        loadMyApplications();
        loadApplications();
        
    } catch (err) {
        console.error('Error in fixMissingEmails:', err);
        showToast('Error fixing emails. Check console.', true);
    }
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
            else if (pf?.email) fn = pf.email.split('@')[0];
        }
        if (m.to_user_id) { 
            const { data: pf } = await db.from('profiles').select('display_name,email').eq('id', m.to_user_id).single(); 
            if (pf?.display_name && pf.display_name.trim() !== '') tn = pf.display_name.trim();
            else if (pf?.email) tn = pf.email.split('@')[0];
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
        return { 
            symptoms: [{ text: 'Too dark for accurate analysis - move to brighter area', found: true }], 
            issues: ['Insufficient light'], 
            plant: 'Unknown', 
            confidence: 0, 
            recommendation: 'Move to better lighting and scan again.', 
            severity: 0, 
            colors: c 
        };
    }
    
    if (c.brownPct > 5 && c.darkSpots > 3) { 
        symptoms.push({ text: 'Brown circular holes 3-8mm detected', found: true, detail: `Brown: ${c.brownPct}%, Dark spots: ${c.darkSpots}` }); 
        issues.push('Possible Fall Armyworm damage'); 
        score += 3; 
        conf += 25; 
    }
    else if (c.brownPct > 3) { 
        symptoms.push({ text: 'Minor brown spots detected', found: true, detail: `Brown: ${c.brownPct}%` }); 
        score += 1; 
        conf += 10; 
    }
    else { 
        symptoms.push({ text: 'No significant brown damage', found: false }); 
        conf += 15; 
    }
    
    if (c.yellowPct > 10) { 
        symptoms.push({ text: 'Yellow discoloration >10% of leaf area', found: true, detail: `Yellow: ${c.yellowPct}%` }); 
        issues.push('Possible nutrient deficiency or early blight'); 
        score += 2; 
        conf += 20; 
    }
    else if (c.yellowPct > 5) { 
        symptoms.push({ text: 'Slight yellowing detected (5-10%)', found: true, detail: `Yellow: ${c.yellowPct}%` }); 
        score += 1; 
        conf += 10; 
    }
    else { 
        symptoms.push({ text: 'No yellow discoloration', found: false }); 
        conf += 10; 
    }
    
    if (c.greenPct < 50) { 
        symptoms.push({ text: 'Low chlorophyll detected (<50% green)', found: true, detail: `Green: ${c.greenPct}%` }); 
        issues.push('Plant may be wilting or stressed'); 
        score += 2; 
        conf += 15; 
    }
    else { 
        symptoms.push({ text: 'Healthy chlorophyll levels', found: false, detail: `Green: ${c.greenPct}%` }); 
        conf += 20; 
    }
    
    if (c.whitePct > 8) { 
        symptoms.push({ text: 'White/powdery patches detected', found: true, detail: `White: ${c.whitePct}%` }); 
        issues.push('Possible powdery mildew'); 
        score += 2; 
        conf += 15; 
    }
    else { 
        symptoms.push({ text: 'No powdery mildew signs', found: false }); 
        conf += 5; 
    }
    
    let plant = c.greenPct > 60 && c.yellowPct < 5 ? 'Healthy Plant (likely Maize)' : 
                c.greenPct > 40 ? 'Stressed Crop' : 'Broadleaf Crop';
    conf = Math.min(conf, 95);
    
    let rec = score >= 5 ? 'URGENT: Multiple issues detected. Apply treatment immediately!' : 
              score >= 3 ? 'Issues detected. Monitor closely and consider treatment.' : 
              score >= 1 ? 'Minor issues. Continue regular monitoring.' : 
              'Plant appears healthy. No action needed.';
    
    return { symptoms, issues, plant, confidence: Math.round(conf), recommendation: rec, severity: score, colors: c };
}

// ═══════════════════════════════════════════
// CROP DATABASE (EXPANDED with more crops, pests, and diseases)
// ═══════════════════════════════════════════

const CROP_DB = {
    // ── MAIZE ──
    maize: { 
        name: 'Maize', 
        pests: { 
            fall_armyworm: { 
                name: 'Fall Armyworm', 
                severity: 'high', 
                lossPct: 15, 
                dosage: 200, 
                chemicals: ['Ampligo','Dudu-Cyber','Rocket','Emamectin Benzoate'], 
                organic: ['Neem Oil','Bt','Hand picking'], 
                note: 'Most destructive during vegetative stage. Scout early morning or late evening.' 
            }, 
            stalk_borer: { 
                name: 'Stalk Borer', 
                severity: 'high', 
                lossPct: 20, 
                dosage: 150, 
                chemicals: ['Dudu-Cyber','Chlorpyrifos'], 
                organic: ['Neem Oil','Push-pull'], 
                note: 'Attacks stems causing lodging. Apply at knee-high stage.' 
            }, 
            aphids: { 
                name: 'Aphids', 
                severity: 'medium', 
                lossPct: 8, 
                dosage: 100, 
                chemicals: ['Acetamiprid','Dudu-Cyber'], 
                organic: ['Ladybugs','Neem Oil','Soap spray'], 
                note: 'Check under leaves. Ants indicate presence.' 
            },
            gray_leaf_spot: {
                name: 'Gray Leaf Spot',
                severity: 'medium',
                lossPct: 12,
                dosage: 180,
                chemicals: ['Mancozeb','Tebuconazole'],
                organic: ['Copper spray','Crop rotation'],
                note: 'Causes rectangular gray lesions. Common in humid weather.'
            },
            northern_leaf_blight: {
                name: 'Northern Leaf Blight',
                severity: 'medium',
                lossPct: 10,
                dosage: 160,
                chemicals: ['Propiconazole','Azoxystrobin'],
                organic: ['Resistant varieties','Crop rotation'],
                note: 'Long cigar-shaped lesions. Favored by cool, wet conditions.'
            }
        }, 
        yieldValue: 2533 
    },
    
    // ── TOMATO ──
    tomato: { 
        name: 'Tomato', 
        pests: { 
            late_blight: { 
                name: 'Late Blight', 
                severity: 'critical', 
                lossPct: 30, 
                dosage: 300, 
                chemicals: ['Rocket','Chlorpyrifos','Mancozeb'], 
                organic: ['Copper spray','Baking soda'], 
                note: 'Spreads rapidly in cool, wet conditions.' 
            }, 
            early_blight: {
                name: 'Early Blight',
                severity: 'high',
                lossPct: 20,
                dosage: 250,
                chemicals: ['Chlorothalonil','Mancozeb'],
                organic: ['Neem Oil','Copper spray'],
                note: 'Dark concentric rings on leaves. Common in warm weather.'
            },
            aphids: { 
                name: 'Aphids', 
                severity: 'medium', 
                lossPct: 10, 
                dosage: 250, 
                chemicals: ['Acetamiprid','Dudu-Cyber'], 
                organic: ['Neem Oil','Garlic spray'], 
                note: 'Also transmits viral diseases.' 
            },
            tomato_yellow_leaf_curl: {
                name: 'Tomato Yellow Leaf Curl',
                severity: 'high',
                lossPct: 25,
                dosage: 0,
                chemicals: ['Insecticides for whitefly','Neem Oil'],
                organic: ['Neem Oil','Yellow sticky traps'],
                note: 'Caused by whitefly transmitted virus. Prevention is key.'
            },
            blossom_end_rot: {
                name: 'Blossom End Rot',
                severity: 'medium',
                lossPct: 15,
                dosage: 0,
                chemicals: ['Calcium nitrate'],
                organic: ['Lime','Eggshells','Compost'],
                note: 'Calcium deficiency. Maintain consistent soil moisture.'
            }
        }, 
        yieldValue: 5000 
    },
    
    // ── RICE ──
    rice: { 
        name: 'Rice', 
        pests: { 
            blast: { 
                name: 'Rice Blast', 
                severity: 'high', 
                lossPct: 25, 
                dosage: 180, 
                chemicals: ['Tricyclazole','Rocket'], 
                organic: ['Silicon fertilizer','Resistant varieties'], 
                note: 'Favored by high nitrogen and frequent rainfall.' 
            },
            brown_spot: {
                name: 'Brown Spot',
                severity: 'medium',
                lossPct: 15,
                dosage: 150,
                chemicals: ['Mancozeb','Copper'],
                organic: ['Balanced nutrients','Seed treatment'],
                note: 'Small brown circular lesions. Related to nutrient deficiency.'
            },
            sheath_blight: {
                name: 'Sheath Blight',
                severity: 'high',
                lossPct: 20,
                dosage: 200,
                chemicals: ['Validamycin','Propiconazole'],
                organic: ['Avoid dense planting','Remove infected plants'],
                note: 'Grayish-green lesions on leaf sheaths. Favored by high humidity.'
            },
            stem_borer: {
                name: 'Stem Borer',
                severity: 'high',
                lossPct: 22,
                dosage: 160,
                chemicals: ['Cartap','Chlorpyrifos'],
                organic: ['Trap crops','Neem Oil'],
                note: 'Causes dead hearts in early stages. Monitor moth activity.'
            }
        }, 
        yieldValue: 3200 
    },
    
    // ── BEANS ──
    beans: { 
        name: 'Beans', 
        pests: { 
            aphids: { 
                name: 'Aphids', 
                severity: 'medium', 
                lossPct: 12, 
                dosage: 120, 
                chemicals: ['Acetamiprid','Dudu-Cyber'], 
                organic: ['Neem Oil','Companion planting'], 
                note: 'Check flowering stage.' 
            },
            bean_rust: {
                name: 'Bean Rust',
                severity: 'high',
                lossPct: 18,
                dosage: 140,
                chemicals: ['Tebuconazole','Mancozeb'],
                organic: ['Sulfur spray','Copper spray'],
                note: 'Small rust-colored pustules on leaves. Favored by humid weather.'
            },
            angular_leaf_spot: {
                name: 'Angular Leaf Spot',
                severity: 'medium',
                lossPct: 14,
                dosage: 130,
                chemicals: ['Copper hydroxide','Mancozeb'],
                organic: ['Baking soda spray','Crop rotation'],
                note: 'Angular brown lesions with yellow halos.'
            },
            bruchids: {
                name: 'Bruchids (Bean Weevils)',
                severity: 'high',
                lossPct: 25,
                dosage: 0,
                chemicals: ['Phosphine fumigation','Malathion dust'],
                organic: ['Sun drying','Neem oil on stored beans'],
                note: 'Attacks stored beans. Clean storage and early harvest.'
            }
        }, 
        yieldValue: 1800 
    },
    
    // ── CABBAGE ──
    cabbage: { 
        name: 'Cabbage', 
        pests: { 
            diamondback_moth: { 
                name: 'Diamondback Moth', 
                severity: 'high', 
                lossPct: 22, 
                dosage: 160, 
                chemicals: ['Dudu-Cyber','Emamectin Benzoate'], 
                organic: ['Bt spray','Neem Oil','Row covers'], 
                note: 'Rotate chemicals to prevent resistance.' 
            },
            black_rot: {
                name: 'Black Rot',
                severity: 'critical',
                lossPct: 35,
                dosage: 0,
                chemicals: ['Copper spray','Streptomycin'],
                organic: ['Hot water seed treatment','Crop rotation'],
                note: 'V-shaped yellow lesions on leaf edges. Highly infectious.'
            },
            clubroot: {
                name: 'Clubroot',
                severity: 'high',
                lossPct: 30,
                dosage: 0,
                chemicals: ['Lime application'],
                organic: ['Lime','Organic matter','pH management'],
                note: 'Swollen roots causing wilting. Maintain pH above 6.5.'
            },
            aphids: {
                name: 'Cabbage Aphids',
                severity: 'medium',
                lossPct: 12,
                dosage: 120,
                chemicals: ['Acetamiprid','Imidacloprid'],
                organic: ['Neem Oil','Ladybugs','Water spray'],
                note: 'Check under leaves. Sticky surfaces indicate presence.'
            }
        }, 
        yieldValue: 2800 
    },
    
    // ── POTATO ──
    potato: {
        name: 'Potato',
        pests: {
            late_blight: {
                name: 'Late Blight',
                severity: 'critical',
                lossPct: 35,
                dosage: 300,
                chemicals: ['Mancozeb','Metalaxyl','Rocket'],
                organic: ['Copper spray','Bordeaux mixture'],
                note: 'Devastating disease. Use resistant varieties where possible.'
            },
            early_blight: {
                name: 'Early Blight',
                severity: 'high',
                lossPct: 20,
                dosage: 250,
                chemicals: ['Chlorothalonil','Azoxystrobin'],
                organic: ['Copper spray','Crop rotation'],
                note: 'Causes dark concentric rings on older leaves.'
            },
            potato_aphids: {
                name: 'Potato Aphids',
                severity: 'medium',
                lossPct: 10,
                dosage: 130,
                chemicals: ['Acetamiprid','Dudu-Cyber'],
                organic: ['Neem Oil','Ladybugs'],
                note: 'Transmits potato leaf roll virus. Monitor carefully.'
            },
            potato_tuber_moth: {
                name: 'Potato Tuber Moth',
                severity: 'high',
                lossPct: 25,
                dosage: 180,
                chemicals: ['Bt spray','Fenitrothion'],
                organic: ['Bt spray','Covering soil','Pheromone traps'],
                note: 'Attack leaves and tubers. Keep soil covered.'
            }
        },
        yieldValue: 3500
    },
    
    // ── ONION ──
    onion: {
        name: 'Onion',
        pests: {
            downy_mildew: {
                name: 'Downy Mildew',
                severity: 'high',
                lossPct: 20,
                dosage: 200,
                chemicals: ['Metalaxyl','Mancozeb'],
                organic: ['Copper spray','Sulfur'],
                note: 'Purplish-gray mold on leaves. Prefers cool, wet weather.'
            },
            thrips: {
                name: 'Onion Thrips',
                severity: 'high',
                lossPct: 22,
                dosage: 160,
                chemicals: ['Spinosad','Acetamiprid'],
                organic: ['Neem Oil','Sticky traps','Beneficial insects'],
                note: 'Silver-white patches on leaves. Monitor from seedling stage.'
            },
            white_rot: {
                name: 'White Rot',
                severity: 'critical',
                lossPct: 40,
                dosage: 0,
                chemicals: ['Fungicide bulb dip'],
                organic: ['Crop rotation (5-7 years)','Compost management'],
                note: 'White fungal growth at base. Causes premature yellowing.'
            },
            purple_blotch: {
                name: 'Purple Blotch',
                severity: 'high',
                lossPct: 18,
                dosage: 170,
                chemicals: ['Chlorothalonil','Mancozeb'],
                organic: ['Copper spray','Avoid overhead irrigation'],
                note: 'Purple-brown spots on leaves. Common in warm humid weather.'
            }
        },
        yieldValue: 3000
    },
    
    // ── GROUNDNUT ──
    groundnut: {
        name: 'Groundnut',
        pests: {
            leaf_spot: {
                name: 'Early Leaf Spot',
                severity: 'high',
                lossPct: 20,
                dosage: 180,
                chemicals: ['Chlorothalonil','Tebuconazole'],
                organic: ['Sulfur spray','Crop rotation'],
                note: 'Dark brown spots on leaves. Defoliation reduces yield.'
            },
            rust: {
                name: 'Groundnut Rust',
                severity: 'high',
                lossPct: 25,
                dosage: 200,
                chemicals: ['Mancozeb','Tebuconazole'],
                organic: ['Sulfur spray','Resistant varieties'],
                note: 'Orange-brown pustules on leaves. Favored by warm weather.'
            },
            aphids: {
                name: 'Groundnut Aphids',
                severity: 'medium',
                lossPct: 10,
                dosage: 120,
                chemicals: ['Acetamiprid','Dudu-Cyber'],
                organic: ['Neem Oil','Ladybugs'],
                note: 'Transmits rosette virus. Monitor early for control.'
            },
            jassids: {
                name: 'Jassids (Leafhoppers)',
                severity: 'medium',
                lossPct: 12,
                dosage: 140,
                chemicals: ['Imidacloprid','Acetamiprid'],
                organic: ['Neem Oil','Yellow sticky traps'],
                note: 'Yellow spots on leaves causing curling. Active in dry weather.'
            }
        },
        yieldValue: 2200
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
    if (data) {
        document.getElementById('mathDosage').value = data.dosage;
        document.getElementById('mathChemName').placeholder = `e.g., ${data.chemicals[0]}, ${data.chemicals[1]}...`;
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
            <h3 style="color:var(--accent);">${cropData.name} × ${pestData.name}</h3>
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
            <p style="font-size:0.75rem;margin-top:8px;">${pestData.note}</p>
            <p style="font-size:0.7rem;color:var(--accent);margin-top:4px;">🌿 Organic options: ${pestData.organic.join(', ')}</p>
            <p style="font-size:0.7rem;color:var(--text-secondary);">🧪 Chemical options: ${pestData.chemicals.join(', ')}</p>
        </div>`;
    document.getElementById('mathResult').scrollIntoView({ behavior: 'smooth' });
    showToast('Calculation complete!');
    
    if (currentUser) {
        db.from('farm_records').insert({ 
            user_id: currentUser.id, 
            title: `Spray Calc: ${cropData.name}`, 
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
    preview.innerHTML = `
        <img src="${imageSrc}" style="max-width:100%;border-radius:20px;margin-bottom:10px;max-height:300px;object-fit:contain;">
        <div style="margin-bottom:8px;">
            <small style="color:var(--text-secondary,#aaa);">Color Breakdown (HSV Analysis)</small>
            <div class="color-bar">
                <div style="width:${c.greenPct}%;background:#22c55e;"></div>
                <div style="width:${c.yellowPct}%;background:#eab308;"></div>
                <div style="width:${c.brownPct}%;background:#92400e;"></div>
                <div style="width:${c.darkPct}%;background:#1a1a1a;"></div>
                <div style="width:${c.whitePct}%;background:#e5e5e5;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;">
                <span>Grn:${c.greenPct}%</span>
                <span>Ylw:${c.yellowPct}%</span>
                <span>Brn:${c.brownPct}%</span>
                <span>Drk:${c.darkPct}%</span>
                <span>Wht:${c.whitePct}%</span>
            </div>
        </div>
        <div style="background:var(--input-bg);border-radius:14px;padding:14px;">
            <strong>Symptoms:</strong>
            ${diagnosis.symptoms.map(s => `
                <div class="symptom-item ${s.found?'symptom-found':'symptom-clear'}">
                    ${s.found?'⚠️ Warning':'✅ OK'} - ${s.text}
                    ${s.detail?`<br><small>${s.detail}</small>`:''}
                </div>
            `).join('')}
        </div>
        <div style="margin-top:10px;padding:14px;background:var(--card-bg);border-radius:14px;">
            <div style="display:flex;justify-content:space-between;">
                <span>Plant:</span>
                <strong>${diagnosis.plant}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <span>Confidence:</span>
                <strong style="color:${diagnosis.confidence>70?'var(--accent)':'#f59e0b'};">${diagnosis.confidence}%</strong>
            </div>
            ${diagnosis.issues.length ? `
                <div style="margin-top:8px;padding:8px;background:rgba(245,158,11,0.15);border-radius:8px;">
                    <strong style="color:#f59e0b;">Issues:</strong> 
                    ${diagnosis.issues.map(i=>`<div style="font-size:0.8rem;">- ${i}</div>`).join('')}
                </div>
            ` : ''}
            <div style="margin-top:8px;font-weight:600;color:var(--accent);">${diagnosis.recommendation}</div>
        </div>`;
    updateScanMapUI();
    showToast(diagnosis.severity > 0 ? 'Issues detected!' : 'Healthy plant!');
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
                        showToast('⚠️ Issue detected! Location saved.');
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
    document.getElementById('authDisplayName').style.display = mode === 'login' ? 'none' : 'block';
    document.getElementById('authModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('authModal').style.display = 'none';
    ['authEmail','authPass','authDisplayNameInput'].forEach(id => document.getElementById(id).value='');
}

// ═══════════════════════════════════════════
// CONTACT HANDLERS
// ═══════════════════════════════════════════

function setupContactHandlers() {
    document.addEventListener('click', function(e) {
        // Contact Applicant Button (for job posters)
        const contactApplicantBtn = e.target.closest('.contact-applicant-btn');
        if (contactApplicantBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const email = contactApplicantBtn.dataset.email;
            const name = contactApplicantBtn.dataset.name;
            
            if (email && email !== 'N/A' && email !== 'undefined' && email !== '') {
                const msgTo = document.getElementById('msgTo');
                const msgText = document.getElementById('msgText');
                
                if (msgTo && msgText) {
                    msgTo.value = email;
                    msgText.value = `Hello ${name}, regarding your application to my job posting...`;
                    showPage('messages');
                    showToast(`Composing message to ${name}`);
                }
            } else {
                showToast('No email available for this applicant', true);
            }
            return;
        }
        
        // Contact Poster Button (for job applicants)
        const contactPosterBtn = e.target.closest('.contact-poster-btn');
        if (contactPosterBtn) {
            e.preventDefault();
            e.stopPropagation();
            
            const email = contactPosterBtn.dataset.email;
            const name = contactPosterBtn.dataset.name;
            const jobTitle = contactPosterBtn.dataset.jobtitle || 'the job';
            
            if (email && email !== 'N/A' && email !== 'undefined' && email !== '') {
                const msgTo = document.getElementById('msgTo');
                const msgText = document.getElementById('msgText');
                
                if (msgTo && msgText) {
                    msgTo.value = email;
                    msgText.value = `Hello ${name}, I'm following up on my application for ${jobTitle}...`;
                    showPage('messages');
                    showToast(`Composing message to ${name}`);
                }
            } else {
                showToast('No email available for this employer', true);
            }
            return;
        }
    });
}

// ═══════════════════════════════════════════
// DOM READY
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Setup contact handlers
    setupContactHandlers();
    
    // Make fixMissingEmails available globally
    window.fixMissingEmails = fixMissingEmails;
    
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

    let authMode = 'login';
    document.getElementById('loginBtn').addEventListener('click', () => { authMode = 'login'; });
    document.getElementById('signupBtn').addEventListener('click', () => { authMode = 'signup'; });
    
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

    // Jobs
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

    // Event delegation for dynamic elements (non-contact buttons)
    document.addEventListener('click', async function(e) {
        // Delete buttons
        const deleteBtn = e.target.closest('.delete-btn');
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

        // Like buttons
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) { 
            const { type, id } = likeBtn.dataset; 
            await toggleLike(type, id); 
            return; 
        }

        // Reply toggle
        const replyToggle = e.target.closest('.reply-toggle');
        if (replyToggle) {
            const postId = replyToggle.dataset.post;
            const replyDiv = replyToggle.closest('.forum-post').nextElementSibling;
            replyDiv.style.display = replyDiv.style.display === 'none' ? 'block' : 'none';
            loadReplies(postId, replyDiv);
            return;
        }

        // Send reply
        const sendReply = e.target.closest('.send-reply');
        if (sendReply && currentUser) {
            const postId = sendReply.dataset.post;
            const input = sendReply.previousElementSibling;
            const content = input.value.trim();
            if (content) { 
                await db.from('forum_replies').insert({ post_id: postId, user_id: currentUser.id, content }); 
                const replyDiv = sendReply.closest('.reply-section'); 
                loadReplies(postId, replyDiv); 
            }
            return;
        }

        // Apply to job
        const applyBtn = e.target.closest('.apply-btn');
        if (applyBtn) { 
            e.preventDefault(); 
            e.stopPropagation(); 
            await applyToJob(applyBtn.dataset.job); 
            return; 
        }

        // Accept/Reject applications
        const acceptBtn = e.target.closest('.accept-app');
        if (acceptBtn) { 
            await updateApplicationStatus(acceptBtn.dataset.id, 'accepted'); 
            return; 
        }
        
        const rejectBtn = e.target.closest('.reject-app');
        if (rejectBtn) { 
            await updateApplicationStatus(rejectBtn.dataset.id, 'rejected'); 
            return; 
        }
    });

    checkSession();
    showPage('dashboard');
});
