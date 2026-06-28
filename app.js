// ═══════════════════════════════════════════
//  SUPABASE CREDENTIALS
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
    const { data: profile } = await db.from('profiles').select('display_name').eq('id', session.user.id).single();
    currentUser = { id: session.user.id, email: session.user.email, displayName: profile?.display_name || session.user.email };
  } else { currentUser = null; }
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
  await db.from('profiles').upsert({ id: data.user.id, display_name: displayName, email: email });
  await checkSession();
  showToast(`Welcome, ${displayName}!`);
}

async function login(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await checkSession();
  showToast(`Welcome back!`);
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  updateAuthUI();
  showToast('Logged out');
}

db.auth.onAuthStateChange((event, session) => { checkSession(); });

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
  const { count: forumCount } = await db.from('forum_posts').select('*', { count: 'exact', head: true });
  const { count: recordsCount } = await db.from('farm_records').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
  const { count: jobsCount } = await db.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: tutsCount } = await db.from('tutorials').select('*', { count: 'exact', head: true });
  document.getElementById('statRecords').textContent = recordsCount || 0;
  document.getElementById('statJobs').textContent = jobsCount || 0;
  document.getElementById('statTuts').textContent = tutsCount || 0;
  document.getElementById('statForum').textContent = forumCount || 0;
  loadWeather();
}

// ────────── Forum (with images) ──────────
async function addForumPost(content, imageFile) {
  if (!currentUser) return showToast('Please login', true);
  let imageUrl = null;
  if (imageFile) {
    const filePath = `forum/${Date.now()}_${imageFile.name}`;
    const { error } = await db.storage.from('avatars').upload(filePath, imageFile);
    if (!error) {
      const { data } = db.storage.from('avatars').getPublicUrl(filePath);
      if (data) imageUrl = data.publicUrl;
    }
  }
  const { error } = await db.from('forum_posts').insert({ user_id: currentUser.id, content, image_url: imageUrl });
  if (error) return showToast('Failed to post', true);
  showToast('Post shared!');
  loadForum();
  loadDashboardStats();
}

async function loadForum() {
  const container = document.getElementById('forumList');
  const { data: posts } = await db.from('forum_posts').select('*').order('created_at', { ascending: false });
  if (!posts || posts.length === 0) { container.innerHTML = '<div style="text-align:center;padding:20px;">No posts yet.</div>'; return; }
  container.innerHTML = '';
  for (const p of posts) {
    let displayName = 'Anonymous';
    if (p.user_id) {
      const { data: profile } = await db.from('profiles').select('display_name').eq('id', p.user_id).single();
      if (profile) displayName = profile.display_name;
    }
    const { count: likeCount } = await db.from('likes').select('*', { count: 'exact', head: true }).match({ target_type: 'forum', target_id: p.id });
    const postDiv = document.createElement('div');
    postDiv.className = 'forum-post';
    postDiv.innerHTML = `
      <strong>${escapeHtml(displayName)}</strong>
      <small>${new Date(p.created_at).toLocaleString()}</small>
      <p>${escapeHtml(p.content)}</p>
      ${p.image_url ? `<img src="${p.image_url}" style="max-width:100%; border-radius:12px; margin:8px 0;">` : ''}
      <span class="like-btn" data-type="forum" data-id="${p.id}">❤️ ${likeCount || 0}</span>
      ${currentUser && currentUser.id === p.user_id ? `<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>` : ''}
      <button class="btn-outline reply-toggle" data-post="${p.id}">Reply</button>
    `;
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
      if (r.user_id) { const { data: p } = await db.from('profiles').select('display_name').eq('id', r.user_id).single(); if (p) dn = p.display_name; }
      container.innerHTML += `<div style="padding:4px 0;"><strong>${escapeHtml(dn)}:</strong> ${escapeHtml(r.content)}</div>`;
    }
  }
  container.innerHTML += `<input type="text" class="reply-input" placeholder="Write reply..." style="width:70%;display:inline;"><button class="btn-outline send-reply" data-post="${postId}">Send</button>`;
}

async function deleteForumPost(id) {
  await db.from('forum_replies').delete().eq('post_id', id);
  await db.from('likes').delete().match({ target_type: 'forum', target_id: id });
  await db.from('forum_posts').delete().eq('id', id);
  showToast('Deleted');
  loadForum();
  loadDashboardStats();
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
  const container = document.getElementById('groupsList');
  const { data: groups } = await db.from('groups').select('*').order('created_at', { ascending: false });
  if (!groups || groups.length === 0) { container.innerHTML = '<p style="text-align:center;">No groups yet. Create one!</p>'; return; }
  container.innerHTML = groups.map(g => {
    return `<div class="forum-post"><strong>${escapeHtml(g.name)}</strong> <small>${escapeHtml(g.category)}</small><p>${escapeHtml(g.description||'')}</p>
    <button class="btn-outline join-group-btn" data-group="${g.id}">Join Group</button></div>`;
  }).join('');
}

async function createGroup() {
  if (!currentUser) return showToast('Please login', true);
  const name = document.getElementById('groupName').value.trim();
  const desc = document.getElementById('groupDesc').value.trim();
  const cat = document.getElementById('groupCategory').value;
  if (!name) return showToast('Group name required', true);
  await db.from('groups').insert({ name, description: desc, category: cat, created_by: currentUser.id });
  showToast('Group created!');
  document.getElementById('groupName').value = '';
  document.getElementById('groupDesc').value = '';
  loadGroups();
}

// ────────── Records ──────────
async function loadRecords() {
  if (!currentUser) return;
  const { data: records } = await db.from('farm_records').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  const container = document.getElementById('recordsList');
  if (!records || records.length === 0) { container.innerHTML = '<p>No records yet.</p>'; return; }
  container.innerHTML = records.map(r => `<div class="record-item"><strong>${escapeHtml(r.title)}</strong><p>${escapeHtml(r.detail||'')}</p><small>${new Date(r.created_at).toLocaleString()}</small><button class="delete-btn" data-type="record" data-id="${r.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
}
async function addRecord(title, detail) {
  if (!currentUser) return showToast('Please login', true);
  await db.from('farm_records').insert({ user_id: currentUser.id, title, detail });
  showToast('Saved!'); loadRecords(); loadDashboardStats();
}
async function deleteRecord(id) { await db.from('farm_records').delete().eq('id', id); showToast('Deleted'); loadRecords(); loadDashboardStats(); }

// ────────── Jobs ──────────
async function loadJobs() {
  const { data: jobs } = await db.from('job_listings').select('*').order('created_at', { ascending: false });
  const container = document.getElementById('jobsList');
  if (!jobs || jobs.length === 0) { container.innerHTML = '<p>No jobs.</p>'; return; }
  container.innerHTML = '';
  for (const j of jobs) {
    let dn = 'Anonymous';
    if (j.user_id) { const { data: p } = await db.from('profiles').select('display_name').eq('id', j.user_id).single(); if (p) dn = p.display_name; }
    const { count: appCount } = await db.from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', j.id);
    container.innerHTML += `<div class="job-item"><strong>${escapeHtml(j.title)}</strong><p>${escapeHtml(j.description||'')}</p><small>By ${escapeHtml(dn)}</small> <span>👤 ${appCount||0}</span>
    ${currentUser&&currentUser.id===j.user_id?`<button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>`:''}
    ${currentUser&&currentUser.id!==j.user_id?`<button class="btn-outline apply-btn" data-job="${j.id}">Apply</button>`:''}</div>`;
  }
}
async function addJob(title, description) {
  if (!currentUser) return showToast('Login first', true);
  await db.from('job_listings').insert({ user_id: currentUser.id, title, description });
  showToast('Posted!'); loadJobs(); loadDashboardStats();
}
async function deleteJob(id) { await db.from('job_applications').delete().eq('job_id', id); await db.from('job_listings').delete().eq('id', id); loadJobs(); loadDashboardStats(); }
async function applyToJob(jobId) {
  if (!currentUser) return showToast('Login first', true);
  const msg = prompt('Add a message (optional):');
  const { data: ex } = await db.from('job_applications').select('*').match({ job_id: jobId, applicant_id: currentUser.id });
  if (ex && ex.length) return showToast('Already applied', true);
  await db.from('job_applications').insert({ job_id: jobId, applicant_id: currentUser.id, applicant_message: msg });
  showToast('Applied!'); loadJobs();
}

// ────────── Applications ──────────
async function loadApplications() {
  if (!currentUser) return;
  const container = document.getElementById('applicationsList');
  const { data: myJobs } = await db.from('job_listings').select('id,title').eq('user_id', currentUser.id);
  if (!myJobs || myJobs.length === 0) { container.innerHTML = '<p>No jobs posted.</p>'; return; }
  container.innerHTML = '';
  for (const job of myJobs) {
    const { data: apps } = await db.from('job_applications').select('*').eq('job_id', job.id).order('created_at', { ascending: false });
    if (apps && apps.length > 0) {
      container.innerHTML += `<h4 style="color:var(--accent);">📋 ${escapeHtml(job.title)} (${apps.length})</h4>`;
      for (const a of apps) {
        let dn = 'Unknown', em = 'N/A';
        if (a.applicant_id) { const { data: p } = await db.from('profiles').select('display_name,email').eq('id', a.applicant_id).single(); if (p) { dn = p.display_name; em = p.email; } }
        const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
        container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};"><strong>${escapeHtml(dn)}</strong><br><small>📧 ${escapeHtml(em)}</small><br><small>${escapeHtml(a.applicant_message||'No message')}</small><br><span style="color:${sc};">${a.status}</span>
        ${a.status==='pending'?`<button class="btn-outline accept-app" data-id="${a.id}" data-job="${job.id}" style="font-size:12px;padding:4px 12px;margin-right:8px;">✅ Accept</button><button class="btn-outline reject-app" data-id="${a.id}" data-job="${job.id}" style="font-size:12px;padding:4px 12px;border-color:#dc2626;color:#dc2626;">❌ Reject</button>`:''}</div>`;
      }
    }
  }
  if (container.innerHTML === '') container.innerHTML = '<p>No applications yet.</p>';
}

async function loadMyApplications() {
  if (!currentUser) return;
  const container = document.getElementById('myApplicationsList');
  const { data: apps } = await db.from('job_applications').select('*').eq('applicant_id', currentUser.id).order('created_at', { ascending: false });
  if (!apps || apps.length === 0) { container.innerHTML = '<p>No applications yet.</p>'; return; }
  container.innerHTML = '';
  for (const a of apps) {
    const { data: job } = await db.from('job_listings').select('title,description').eq('id', a.job_id).single();
    const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
    container.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};"><strong>${escapeHtml(job?.title||'Unknown')}</strong><p>${escapeHtml(job?.description||'')}</p><small>Applied: ${new Date(a.created_at).toLocaleDateString()}</small><br><span style="color:${sc};">${a.status}</span></div>`;
  }
}

async function updateApplicationStatus(appId, status, jobId) {
  await db.from('job_applications').update({ status }).eq('id', appId);
  showToast(`Application ${status}!`);
  loadApplications();
}

// ────────── Market ──────────
async function loadMarket() {
  const cat = document.getElementById('marketCategoryFilter')?.value || 'All';
  let q = db.from('products').select('*').order('created_at', { ascending: false });
  if (cat !== 'All') q = q.eq('category', cat);
  const { data: products } = await q;
  const container = document.getElementById('marketList');
  if (!products || products.length === 0) { container.innerHTML = '<p>No products.</p>'; return; }
  container.innerHTML = products.map(p => `<div class="product-item">${p.image_url?`<img src="${p.image_url}" style="max-width:100px;border-radius:10px;">`:''}<strong>${escapeHtml(p.name)}</strong> - ${escapeHtml(p.price)}<br><small>${escapeHtml(p.category)}</small>${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="product" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');
}
async function addProduct(name, price, category, imageFile) {
  if (!currentUser) return showToast('Login first', true);
  let imageUrl = null;
  if (imageFile) {
    const fp = `products/${Date.now()}_${imageFile.name}`;
    const { error } = await db.storage.from('avatars').upload(fp, imageFile);
    if (!error) { const { data } = db.storage.from('avatars').getPublicUrl(fp); if (data) imageUrl = data.publicUrl; }
  }
  await db.from('products').insert({ user_id: currentUser.id, name, price, category, image_url: imageUrl });
  showToast('Listed!'); loadMarket();
}
async function deleteProduct(id) { await db.from('products').delete().eq('id', id); loadMarket(); }

// ────────── Messages ──────────
async function loadMessages() {
  if (!currentUser) return;
  const { data: msgs } = await db.from('messages').select('*').or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`).order('created_at', { ascending: false });
  const container = document.getElementById('messagesList');
  if (!msgs || msgs.length === 0) { container.innerHTML = '<p>No messages.</p>'; return; }
  container.innerHTML = '';
  for (const m of msgs) {
    let fn = 'Unknown', tn = 'Unknown';
    if (m.from_user_id) { const { data: p } = await db.from('profiles').select('display_name').eq('id', m.from_user_id).single(); if (p) fn = p.display_name; }
    if (m.to_user_id) { const { data: p } = await db.from('profiles').select('display_name').eq('id', m.to_user_id).single(); if (p) tn = p.display_name; }
    container.innerHTML += `<div class="msg-item"><strong>${escapeHtml(fn)}</strong> → ${escapeHtml(tn)}: ${escapeHtml(m.text)}<br><small>${new Date(m.created_at).toLocaleString()}</small></div>`;
  }
}
async function sendMessage(toEmail, text) {
  if (!currentUser) return showToast('Login first', true);
  const { data: users } = await db.from('profiles').select('id').eq('email', toEmail).limit(1);
  if (!users || users.length === 0) return showToast('User not found', true);
  await db.from('messages').insert({ from_user_id: currentUser.id, to_user_id: users[0].id, text });
  showToast('Sent!'); loadMessages();
}

// ────────── Tutorials ──────────
async function loadTutorials() {
  const { data: tuts } = await db.from('tutorials').select('*').order('created_at', { ascending: false });
  const container = document.getElementById('videosList');
  if (!tuts || tuts.length === 0) { container.innerHTML = '<p>No tutorials.</p>'; return; }
  container.innerHTML = tuts.map(t => `<div class="tutorial-item"><i class="fas fa-play-circle" style="color:#10B981;"></i> <strong>${escapeHtml(t.title)}</strong><br><a href="${escapeHtml(t.url)}" target="_blank">Watch →</a><p>${escapeHtml(t.description||'')}</p>${currentUser&&currentUser.id===t.user_id?`<button class="delete-btn" data-type="tutorial" data-id="${t.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');
}
async function addTutorial(title, url, description) {
  if (!currentUser) return showToast('Login first', true);
  await db.from('tutorials').insert({ user_id: currentUser.id, title, url, description });
  showToast('Shared!'); loadTutorials(); loadDashboardStats();
}
async function deleteTutorial(id) { await db.from('tutorials').delete().eq('id', id); loadTutorials(); loadDashboardStats(); }

// ────────── Calendar ──────────
async function loadCalendar() {
  if (!currentUser) return;
  const { data: events } = await db.from('calendar_events').select('*').eq('user_id', currentUser.id).order('event_date', { ascending: true });
  const container = document.getElementById('calendarList');
  if (!events || events.length === 0) { container.innerHTML = '<p>No events.</p>'; return; }
  container.innerHTML = events.map(e => `<div class="record-item"><strong>${escapeHtml(e.title)}</strong> - ${e.event_date}<br><small>${escapeHtml(e.notes||'')}</small><button class="delete-btn" data-type="calendar" data-id="${e.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
}
async function addEvent() {
  if (!currentUser) return;
  const title = document.getElementById('eventTitle').value.trim();
  const date = document.getElementById('eventDate').value;
  const notes = document.getElementById('eventNotes').value.trim();
  if (!title || !date) return showToast('Title and date required', true);
  await db.from('calendar_events').insert({ user_id: currentUser.id, title, event_date: date, notes });
  showToast('Added!'); document.getElementById('eventTitle').value=''; document.getElementById('eventDate').value=''; document.getElementById('eventNotes').value='';
  loadCalendar();
}
async function deleteCalendarEvent(id) { await db.from('calendar_events').delete().eq('id', id); loadCalendar(); }

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
  document.getElementById('searchResults').innerHTML = results.length ? results.map(t => `<div style="padding:12px;"><i class="fas fa-search"></i> ${escapeHtml(t.substring(0,100))}</div>`).join('') : '<p>No matches.</p>';
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
  if (!currentUser) { document.getElementById('profileContent').innerHTML='<p>Please login.</p>'; return; }
  document.getElementById('profileName').textContent = currentUser.displayName;
  document.getElementById('profileEmail').textContent = currentUser.email;
  const { data: profile } = await db.from('profiles').select('created_at').eq('id', currentUser.id).single();
  if (profile) document.getElementById('profileSince').textContent = 'Member since: ' + new Date(profile.created_at).toLocaleDateString();
  document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;
  const { count: fc } = await db.from('forum_posts').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const { count: rc } = await db.from('farm_records').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const { count: jc } = await db.from('job_listings').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const { count: pc } = await db.from('products').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const { count: tc } = await db.from('tutorials').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const { count: mc } = await db.from('messages').select('*',{count:'exact',head:true}).or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`);
  const { count: fol } = await db.from('follows').select('*',{count:'exact',head:true}).eq('following_id',currentUser.id);
  document.getElementById('profileForumCount').textContent=fc||0;
  document.getElementById('profileRecordsCount').textContent=rc||0;
  document.getElementById('profileJobsCount').textContent=jc||0;
  document.getElementById('profileProductsCount').textContent=pc||0;
  document.getElementById('profileTutorialsCount').textContent=tc||0;
  document.getElementById('profileMessagesCount').textContent=mc||0;
  document.getElementById('followerCount').textContent=`${fol||0} followers`;
  document.getElementById('avatarUpload').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { error } = await db.storage.from('avatars').upload(`${currentUser.id}/profile.jpg`, file, { upsert: true });
    if (!error) { document.getElementById('profileAvatar').src = db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl; showToast('Updated!'); }
  };
}

// ────────── Navigation ──────────
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

function openModal(mode) {
  document.getElementById('modalTitle').innerText = mode === 'login' ? 'Welcome Back' : 'Create Account';
  document.getElementById('authDisplayName').style.display = mode === 'login' ? 'none' : 'block';
  document.getElementById('authModal').style.display = 'flex';
}
function closeModal() {
  document.getElementById('authModal').style.display = 'none';
  ['authEmail','authPass','authDisplayName'].forEach(id => document.getElementById(id).value='');
}

// ────────── DOM Ready ──────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  });
  document.querySelectorAll('.nav-links li').forEach(li => li.addEventListener('click', e => { e.preventDefault(); showPage(li.dataset.page); }));

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

  document.getElementById('postForumBtn').addEventListener('click', () => {
    const c = document.getElementById('forumContent').value.trim();
    const img = document.getElementById('forumImage').files[0];
    if (c) { addForumPost(c, img); document.getElementById('forumContent').value = ''; document.getElementById('forumImage').value = ''; }
  });
  document.getElementById('createGroupBtn').addEventListener('click', createGroup);
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
    const cat = document.getElementById('productCategory').value;
    const img = document.getElementById('productImage').files[0];
    if (n && p) { addProduct(n, p, cat, img); document.getElementById('productName').value = ''; document.getElementById('productPrice').value = ''; }
  });
  document.getElementById('marketCategoryFilter').addEventListener('change', loadMarket);
  document.getElementById('sendMsgBtn').addEventListener('click', () => {
    const to = document.getElementById('msgTo').value.trim();
    const tx = document.getElementById('msgText').value.trim();
    if (to && tx) { sendMessage(to, tx); document.getElementById('msgTo').value = ''; document.getElementById('msgText').value = ''; }
  });
  document.getElementById('doSearchBtn').addEventListener('click', () => {
    const term = document.getElementById('searchInput').value.trim();
    const cat = document.getElementById('searchCategory').value;
    const from = document.getElementById('searchDateFrom').value;
    const to = document.getElementById('searchDateTo').value;
    if (term) globalSearch(term, cat, from, to);
  });
  document.getElementById('addVideoBtn').addEventListener('click', () => {
    const t = document.getElementById('videoTitle').value.trim();
    const u = document.getElementById('videoUrl').value.trim();
    const d = document.getElementById('videoDesc').value.trim();
    if (t && u) { addTutorial(t, u, d); document.getElementById('videoTitle').value = ''; document.getElementById('videoUrl').value = ''; document.getElementById('videoDesc').value = ''; }
  });
  document.getElementById('addEventBtn').addEventListener('click', addEvent);
  document.getElementById('calcYieldBtn').addEventListener('click', calculateYield);

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

  // Global click handler
  document.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      if (!currentUser) return showToast('Login to delete', true);
      if (!confirm('Delete?')) return;
      const { type, id } = deleteBtn.dataset;
      if (type==='forum') await deleteForumPost(id);
      else if (type==='record') await deleteRecord(id);
      else if (type==='job') await deleteJob(id);
      else if (type==='product') await deleteProduct(id);
      else if (type==='tutorial') await deleteTutorial(id);
      else if (type==='calendar') await deleteCalendarEvent(id);
      return;
    }
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) { const { type, id } = likeBtn.dataset; await toggleLike(type, id); return; }
    const replyToggle = e.target.closest('.reply-toggle');
    if (replyToggle) {
      const postId = replyToggle.dataset.post;
      const replyDiv = replyToggle.closest('.forum-post').nextElementSibling;
      replyDiv.style.display = replyDiv.style.display === 'none' ? 'block' : 'none';
      loadReplies(postId, replyDiv);
      return;
    }
    const sendReply = e.target.closest('.send-reply');
    if (sendReply && currentUser) {
      const postId = sendReply.dataset.post;
      const input = sendReply.previousElementSibling;
      const content = input.value.trim();
      if (content) { await db.from('forum_replies').insert({ post_id: postId, user_id: currentUser.id, content }); const replyDiv = sendReply.closest('.reply-section'); loadReplies(postId, replyDiv); }
      return;
    }
    const applyBtn = e.target.closest('.apply-btn');
    if (applyBtn) { await applyToJob(applyBtn.dataset.job); return; }
    const acceptBtn = e.target.closest('.accept-app');
    if (acceptBtn) { const { id, job } = acceptBtn.dataset; await updateApplicationStatus(id, 'accepted', job); return; }
    const rejectBtn = e.target.closest('.reject-app');
    if (rejectBtn) { const { id, job } = rejectBtn.dataset; await updateApplicationStatus(id, 'rejected', job); return; }
  });

  checkSession();
  showPage('dashboard');
});
