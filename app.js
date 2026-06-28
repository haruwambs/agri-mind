const SUPABASE_URL = 'https://injbsydeejivijbeatep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluamJzeWRlZWppdmlqYmVhdGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ4MzEsImV4cCI6MjA5NTMxMDgzMX0.pc-QfLVYUHk5Ky3DClI0b4ThXjLHsUsDcT8qlUOSuKA';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

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

const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('theme') === 'light') document.body.classList.add('light');
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

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
  document.getElementById('authSection').style.display = currentUser ? 'none' : 'flex';
  document.getElementById('userGreeting').style.display = currentUser ? 'block' : 'none';
  if (currentUser) document.getElementById('userGreeting').innerHTML = `<i class="fas fa-user-check"></i> ${escapeHtml(currentUser.displayName)}`;
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
  showToast('Welcome back!');
}

async function logout() { await db.auth.signOut(); currentUser = null; updateAuthUI(); showToast('Logged out'); }
db.auth.onAuthStateChange(() => checkSession());

async function loadWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-1.28&longitude=36.82&current_weather=true');
    const data = await res.json();
    if (data.current_weather) document.getElementById('weatherWidget').innerHTML = `<p>🌡️ ${data.current_weather.temperature}°C</p><p>💨 ${data.current_weather.windspeed} km/h</p>`;
  } catch { document.getElementById('weatherWidget').textContent = 'Unavailable'; }
}

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

async function loadForum() {
  const c = document.getElementById('forumList');
  const { data: posts } = await db.from('forum_posts').select('*').order('created_at', { ascending: false });
  if (!posts || posts.length === 0) { c.innerHTML = '<div style="text-align:center;padding:20px;">No posts yet.</div>'; return; }
  c.innerHTML = '';
  for (const p of posts) {
    let dn = 'Anonymous';
    if (p.user_id) { const { data: pf } = await db.from('profiles').select('display_name').eq('id', p.user_id).single(); if (pf) dn = pf.display_name; }
    const { count: lc } = await db.from('likes').select('*', { count: 'exact', head: true }).match({ target_type: 'forum', target_id: p.id });
    const d = document.createElement('div'); d.className = 'forum-post';
    d.innerHTML = `<strong>${escapeHtml(dn)}</strong><small>${new Date(p.created_at).toLocaleString()}</small><p>${escapeHtml(p.content)}</p>${p.image_url?`<img src="${p.image_url}" style="max-width:100%;border-radius:12px;">`:''}<span class="like-btn" data-type="forum" data-id="${p.id}">❤️ ${lc||0}</span>${currentUser&&currentUser.id===p.user_id?`<button class="delete-btn" data-type="forum" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>`:''}<button class="btn-outline reply-toggle" data-post="${p.id}">Reply</button>`;
    const r = document.createElement('div'); r.className = 'reply-section'; r.style.display = 'none';
    c.appendChild(d); c.appendChild(r);
  }
}

async function loadReplies(postId, container) {
  const { data: replies } = await db.from('forum_replies').select('*').eq('post_id', postId).order('created_at', { ascending: true });
  container.innerHTML = '';
  if (replies) for (const r of replies) {
    let dn = 'Anonymous';
    if (r.user_id) { const { data: pf } = await db.from('profiles').select('display_name').eq('id', r.user_id).single(); if (pf) dn = pf.display_name; }
    container.innerHTML += `<div style="padding:4px 0;"><strong>${escapeHtml(dn)}:</strong> ${escapeHtml(r.content)}</div>`;
  }
  container.innerHTML += `<input type="text" class="reply-input" placeholder="Reply..." style="width:70%;display:inline;"><button class="btn-outline send-reply" data-post="${postId}">Send</button>`;
}

async function addForumPost(content, imageFile) {
  if (!currentUser) return showToast('Login first', true);
  let imageUrl = null;
  if (imageFile) { const fp = `forum/${Date.now()}_${imageFile.name}`; const { error } = await db.storage.from('avatars').upload(fp, imageFile); if (!error) { const { data } = db.storage.from('avatars').getPublicUrl(fp); if (data) imageUrl = data.publicUrl; } }
  await db.from('forum_posts').insert({ user_id: currentUser.id, content, image_url: imageUrl });
  showToast('Posted!'); loadForum(); loadDashboardStats();
}

async function deleteForumPost(id) { await db.from('forum_replies').delete().eq('post_id', id); await db.from('likes').delete().match({ target_type: 'forum', target_id: id }); await db.from('forum_posts').delete().eq('id', id); loadForum(); loadDashboardStats(); }

async function toggleLike(type, id) {
  if (!currentUser) return showToast('Login first', true);
  const { data: ex } = await db.from('likes').select('*').match({ user_id: currentUser.id, target_type: type, target_id: id });
  if (ex && ex.length) await db.from('likes').delete().eq('id', ex[0].id);
  else await db.from('likes').insert({ user_id: currentUser.id, target_type: type, target_id: id });
  if (type === 'forum') loadForum(); else if (type === 'job') loadJobs(); else if (type === 'product') loadMarket(); else if (type === 'tutorial') loadTutorials();
}

async function loadGroups() {
  const lf = document.getElementById('groupLocationFilter')?.value?.trim() || '';
  let q = db.from('groups').select('*').order('created_at', { ascending: false });
  if (lf) q = q.ilike('location', `%${lf}%`);
  const { data: g } = await q;
  const c = document.getElementById('groupsList');
  if (!g || g.length === 0) { c.innerHTML = '<p>No groups yet.</p>'; return; }
  c.innerHTML = g.map(x => `<div class="forum-post"><strong>${escapeHtml(x.name)}</strong> <small>${escapeHtml(x.category)}</small>${x.location?`<br><small>📍 ${escapeHtml(x.location)}</small>`:''}<p>${escapeHtml(x.description||'')}</p></div>`).join('');
}

async function createGroup() {
  if (!currentUser) return showToast('Login first', true);
  const n = document.getElementById('groupName').value.trim();
  if (!n) return showToast('Name required', true);
  await db.from('groups').insert({ name: n, description: document.getElementById('groupDesc').value.trim(), category: document.getElementById('groupCategory').value, location: document.getElementById('groupLocation').value.trim(), created_by: currentUser.id });
  showToast('Created!'); ['groupName','groupDesc','groupLocation'].forEach(id => document.getElementById(id).value=''); loadGroups();
}

async function loadRecords() {
  if(!currentUser)return;
  const{data:r}=await db.from('farm_records').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  const c=document.getElementById('recordsList');
  if(!r||r.length===0){c.innerHTML='<p>No records.</p>';return;}
  c.innerHTML=r.map(x=>`<div class="record-item"><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.detail||'')}</p>${x.location?`<p>📍 ${escapeHtml(x.location)}</p>`:''}<small>${new Date(x.created_at).toLocaleString()}</small><button class="delete-btn" data-type="record" data-id="${x.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
}

async function addRecord(t,d,l){if(!currentUser)return showToast('Login first',true);await db.from('farm_records').insert({user_id:currentUser.id,title:t,detail:d,location:l});showToast('Saved!');loadRecords();loadDashboardStats();}
async function deleteRecord(id){await db.from('farm_records').delete().eq('id',id);loadRecords();loadDashboardStats();}

async function loadJobs() {
  const lf = document.getElementById('jobLocationFilter')?.value?.trim() || '';
  let q = db.from('job_listings').select('*').order('created_at', { ascending: false });
  if (lf) q = q.ilike('location', `%${lf}%`);
  const { data: jobs } = await q;
  const c = document.getElementById('jobsList');
  if (!jobs || jobs.length === 0) { c.innerHTML = '<p>No jobs.</p>'; return; }
  c.innerHTML = '';
  for (const j of jobs) {
    let dn = 'Anonymous';
    if (j.user_id) { const { data: pf } = await db.from('profiles').select('display_name').eq('id', j.user_id).single(); if (pf) dn = pf.display_name; }
    const { count: ac } = await db.from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', j.id);
    c.innerHTML += `<div class="job-item"><strong>${escapeHtml(j.title)}</strong><p>${escapeHtml(j.description||'')}</p>${j.location?`<p>📍 ${escapeHtml(j.location)}</p>`:''}<small>By ${escapeHtml(dn)}</small> <span>👤 ${ac||0}</span>${currentUser&&currentUser.id===j.user_id?`<button class="delete-btn" data-type="job" data-id="${j.id}"><i class="fas fa-trash-alt"></i></button>`:''}${currentUser&&currentUser.id!==j.user_id?`<button class="btn-outline apply-btn" data-job="${j.id}">Apply</button>`:''}</div>`;
  }
}

async function addJob(t,d,l){if(!currentUser)return showToast('Login first',true);await db.from('job_listings').insert({user_id:currentUser.id,title:t,description:d,location:l});showToast('Posted!');loadJobs();loadDashboardStats();}
async function deleteJob(id){await db.from('job_applications').delete().eq('job_id',id);await db.from('job_listings').delete().eq('id',id);loadJobs();loadDashboardStats();}

async function applyToJob(jobId) {
  if (!currentUser) return showToast('Login first', true);
  const { data: ex } = await db.from('job_applications').select('*').match({ job_id: jobId, applicant_id: currentUser.id });
  if (ex && ex.length) return showToast('Already applied', true);
  const msg = prompt('Add a message (optional):');
  const { error } = await db.from('job_applications').insert({ job_id: parseInt(jobId), applicant_id: currentUser.id, message: msg || 'I am interested.', applicant_message: msg, status: 'pending' });
  if (error) return showToast('Failed: ' + error.message, true);
  showToast('Applied!'); loadJobs();
}

async function loadApplications() {
  if (!currentUser) return;
  const c = document.getElementById('applicationsList');
  const { data: myJobs } = await db.from('job_listings').select('id,title').eq('user_id', currentUser.id);
  if (!myJobs || myJobs.length === 0) { c.innerHTML = '<p>No jobs posted.</p>'; return; }
  c.innerHTML = '';
  for (const job of myJobs) {
    const { data: apps } = await db.from('job_applications').select('*').eq('job_id', job.id).order('created_at', { ascending: false });
    if (apps && apps.length > 0) {
      c.innerHTML += `<h4 style="color:var(--accent);">📋 ${escapeHtml(job.title)} (${apps.length})</h4>`;
      for (const a of apps) {
        let dn = 'Unknown', em = 'N/A', ph = 'N/A', lo = 'N/A';
        if (a.applicant_id) { const { data: pf } = await db.from('profiles').select('display_name,email,phone,location').eq('id', a.applicant_id).single(); if (pf) { dn = pf.display_name; em = pf.email; ph = pf.phone || 'N/A'; lo = pf.location || 'N/A'; } }
        const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
        c.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};"><strong>${escapeHtml(dn)}</strong><br><small>📧 ${escapeHtml(em)}</small>${a.status==='accepted'?`<br><small>📱 ${escapeHtml(ph)}</small><br><small>📍 ${escapeHtml(lo)}</small>`:''}<br><small>${escapeHtml(a.applicant_message||'No message')}</small><br><span style="color:${sc};font-weight:600;">${a.status}</span>${a.status==='pending'?`<div style="margin-top:8px;"><button class="btn-outline accept-app" data-id="${a.id}" style="font-size:12px;padding:4px 12px;margin-right:8px;">✅ Accept</button><button class="btn-outline reject-app" data-id="${a.id}" style="font-size:12px;padding:4px 12px;border-color:#dc2626;color:#dc2626;">❌ Reject</button></div>`:''}${a.status==='accepted'?`<div style="margin-top:8px;"><button class="btn-primary contact-applicant-btn" data-email="${escapeHtml(em)}" data-name="${escapeHtml(dn)}" style="font-size:12px;padding:6px 14px;"><i class="fas fa-envelope"></i> Send Message</button></div>`:''}</div>`;
      }
    }
  }
  if (c.innerHTML === '') c.innerHTML = '<p>No applications yet.</p>';
}

async function loadMyApplications() {
  if (!currentUser) return;
  const c = document.getElementById('myApplicationsList');
  const { data: apps } = await db.from('job_applications').select('*').eq('applicant_id', currentUser.id).order('created_at', { ascending: false });
  if (!apps || apps.length === 0) { c.innerHTML = '<p>No applications.</p>'; return; }
  c.innerHTML = '';
  for (const a of apps) {
    const { data: job } = await db.from('job_listings').select('title,description,location,user_id').eq('id', a.job_id).single();
    let pn = 'Unknown', pe = 'N/A', pp = 'N/A';
    if (job?.user_id) { const { data: pf } = await db.from('profiles').select('display_name,email,phone').eq('id', job.user_id).single(); if (pf) { pn = pf.display_name; pe = pf.email; pp = pf.phone || 'N/A'; } }
    const sc = a.status === 'accepted' ? '#10B981' : a.status === 'rejected' ? '#dc2626' : '#f59e0b';
    c.innerHTML += `<div class="job-item" style="border-left:5px solid ${sc};"><strong>${escapeHtml(job?.title||'Unknown')}</strong>${job?.location?`<p>📍 ${escapeHtml(job.location)}</p>`:''}<p>${escapeHtml(job?.description||'')}</p><small>By ${escapeHtml(pn)}</small>${a.status==='accepted'?`<br><small>📧 ${escapeHtml(pe)}</small><br><small>📱 ${escapeHtml(pp)}</small>`:''}<br><span style="color:${sc};">${a.status}</span>${a.status==='accepted'?`<div style="margin-top:8px;"><button class="btn-primary contact-poster-btn" data-email="${escapeHtml(pe)}" data-name="${escapeHtml(pn)}" style="font-size:12px;padding:6px 14px;"><i class="fas fa-envelope"></i> Contact Employer</button></div>`:''}</div>`;
  }
}

async function updateApplicationStatus(appId, status) { await db.from('job_applications').update({ status }).eq('id', appId); showToast(`Application ${status}!`); loadApplications(); }

async function loadMarket() {
  const cat = document.getElementById('marketCategoryFilter')?.value || 'All';
  const lf = document.getElementById('marketLocationFilter')?.value?.trim() || '';
  let q = db.from('products').select('*').order('created_at', { ascending: false });
  if (cat !== 'All') q = q.eq('category', cat);
  if (lf) q = q.ilike('location', `%${lf}%`);
  const { data: p } = await q;
  const c = document.getElementById('marketList');
  if (!p || p.length === 0) { c.innerHTML = '<p>No products.</p>'; return; }
  c.innerHTML = p.map(x => `<div class="product-item">${x.image_url?`<img src="${x.image_url}" style="max-width:100px;border-radius:10px;">`:''}<strong>${escapeHtml(x.name)}</strong> - ${escapeHtml(x.price)}${x.location?`<br><small>📍 ${escapeHtml(x.location)}</small>`:''}<br><small>${escapeHtml(x.category)}</small>${currentUser&&currentUser.id===x.user_id?`<button class="delete-btn" data-type="product" data-id="${x.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');
}

async function addProduct(n,p,cat,loc,img){if(!currentUser)return showToast('Login first',true);let iu=null;if(img){const fp=`products/${Date.now()}_${img.name}`;const{error}=await db.storage.from('avatars').upload(fp,img);if(!error){const{data}=db.storage.from('avatars').getPublicUrl(fp);if(data)iu=data.publicUrl;}}await db.from('products').insert({user_id:currentUser.id,name:n,price:p,category:cat,location:loc,image_url:iu});showToast('Listed!');loadMarket();}
async function deleteProduct(id){await db.from('products').delete().eq('id',id);loadMarket();}

async function loadMessages(){if(!currentUser)return;const{data:m}=await db.from('messages').select('*').or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`).order('created_at',{ascending:false});const c=document.getElementById('messagesList');if(!m||m.length===0){c.innerHTML='<p>No messages.</p>';return;}c.innerHTML='';for(const x of m){let fn='Unknown',tn='Unknown';if(x.from_user_id){const{data:p}=await db.from('profiles').select('display_name').eq('id',x.from_user_id).single();if(p)fn=p.display_name;}if(x.to_user_id){const{data:p}=await db.from('profiles').select('display_name').eq('id',x.to_user_id).single();if(p)tn=p.display_name;}c.innerHTML+=`<div class="msg-item"><strong>${escapeHtml(fn)}</strong> → ${escapeHtml(tn)}: ${escapeHtml(x.text)}<br><small>${new Date(x.created_at).toLocaleString()}</small></div>`;}}
async function sendMessage(toEmail,text){if(!currentUser)return showToast('Login first',true);const{data:u}=await db.from('profiles').select('id').eq('email',toEmail).limit(1);if(!u||u.length===0)return showToast('User not found',true);await db.from('messages').insert({from_user_id:currentUser.id,to_user_id:u[0].id,text});showToast('Sent!');loadMessages();}

async function loadTutorials(){const{data:t}=await db.from('tutorials').select('*').order('created_at',{ascending:false});const c=document.getElementById('videosList');if(!t||t.length===0){c.innerHTML='<p>No tutorials.</p>';return;}c.innerHTML=t.map(x=>`<div class="tutorial-item"><i class="fas fa-play-circle" style="color:#10B981;"></i> <strong>${escapeHtml(x.title)}</strong><br><a href="${escapeHtml(x.url)}" target="_blank">Watch →</a><p>${escapeHtml(x.description||'')}</p>${currentUser&&currentUser.id===x.user_id?`<button class="delete-btn" data-type="tutorial" data-id="${x.id}"><i class="fas fa-trash-alt"></i></button>`:''}</div>`).join('');}
async function addTutorial(t,u,d){if(!currentUser)return showToast('Login first',true);await db.from('tutorials').insert({user_id:currentUser.id,title:t,url:u,description:d});showToast('Shared!');loadTutorials();loadDashboardStats();}
async function deleteTutorial(id){await db.from('tutorials').delete().eq('id',id);loadTutorials();loadDashboardStats();}

async function loadCalendar(){if(!currentUser)return;const{data:e}=await db.from('calendar_events').select('*').eq('user_id',currentUser.id).order('event_date',{ascending:true});const c=document.getElementById('calendarList');if(!e||e.length===0){c.innerHTML='<p>No events.</p>';return;}c.innerHTML=e.map(x=>`<div class="record-item"><strong>${escapeHtml(x.title)}</strong> - ${x.event_date}<br><small>${escapeHtml(x.notes||'')}</small><button class="delete-btn" data-type="calendar" data-id="${x.id}"><i class="fas fa-trash-alt"></i></button></div>`).join('');}
async function addEvent(){if(!currentUser)return;const t=document.getElementById('eventTitle').value.trim();const d=document.getElementById('eventDate').value;const n=document.getElementById('eventNotes').value.trim();if(!t||!d)return showToast('Title and date required',true);await db.from('calendar_events').insert({user_id:currentUser.id,title:t,event_date:d,notes:n});showToast('Added!');['eventTitle','eventDate','eventNotes'].forEach(id=>document.getElementById(id).value='');loadCalendar();}
async function deleteCalendarEvent(id){await db.from('calendar_events').delete().eq('id',id);loadCalendar();}

function calculateYield(){const c=document.getElementById('cropType').value;const a=parseFloat(document.getElementById('areaInput').value);const y={maize:3.5,rice:4.2,wheat:2.8,beans:1.2};document.getElementById('yieldResult').textContent=(a>0)?`Estimated: ${(a*y[c]).toFixed(1)} tons`:'Enter valid area.';}

async function globalSearch(term,cat,df,dt){const q=`%${term}%`;let qs=[];if(cat==='all'||cat==='forum')qs.push(db.from('forum_posts').select('content,created_at').ilike('content',q).limit(5));if(cat==='all'||cat==='records')qs.push(db.from('farm_records').select('title,created_at').ilike('title',q).limit(5));if(cat==='all'||cat==='jobs')qs.push(db.from('job_listings').select('title,created_at').ilike('title',q).limit(5));if(cat==='all'||cat==='tutorials')qs.push(db.from('tutorials').select('title,created_at').ilike('title',q).limit(5));const ra=await Promise.all(qs);const r=[];ra.forEach(res=>{if(res.data)res.data.forEach(x=>{if((!df||new Date(x.created_at)>=new Date(df))&&(!dt||new Date(x.created_at)<=new Date(dt+'T23:59:59')))r.push(x.content||x.title);});});document.getElementById('searchResults').innerHTML=r.length?r.map(t=>`<div style="padding:12px;"><i class="fas fa-search"></i> ${escapeHtml(t.substring(0,100))}</div>`).join(''):'<p>No matches.</p>';}

async function wikiAnswer(q){try{const res=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}?redirect=true`);const d=await res.json();return d.extract?d.extract.substring(0,550):'No info.';}catch{return'Connection error.';}}

async function loadProfile(){
  if(!currentUser){document.getElementById('profileContent').innerHTML='<p>Please login.</p>';return;}
  const{data:pd}=await db.from('profiles').select('*').eq('id',currentUser.id).single();
  document.getElementById('profileName').textContent=pd?.display_name||currentUser.email;
  document.getElementById('profileEmail').textContent=currentUser.email;
  document.getElementById('profilePhone').textContent='📱 Phone: '+(pd?.phone||'Not set');
  document.getElementById('profileLocation').textContent='📍 Location: '+(pd?.location||'Not set');
  document.getElementById('profileBio').textContent='💬 '+(pd?.bio||'No bio yet');
  document.getElementById('profileSince').textContent=pd?.created_at?'Member since: '+new Date(pd.created_at).toLocaleDateString():'';
  document.getElementById('editDisplayName').value=pd?.display_name||'';
  document.getElementById('editPhone').value=pd?.phone||'';
  document.getElementById('editLocation').value=pd?.location||'';
  document.getElementById('editBio').value=pd?.bio||'';
  document.getElementById('profileAvatar').src=db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;
  const{count:fc}=await db.from('forum_posts').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const{count:rc}=await db.from('farm_records').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const{count:jc}=await db.from('job_listings').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const{count:pc}=await db.from('products').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const{count:tc}=await db.from('tutorials').select('*',{count:'exact',head:true}).eq('user_id',currentUser.id);
  const{count:mc}=await db.from('messages').select('*',{count:'exact',head:true}).or(`from_user_id.eq.${currentUser.id},to_user_id.eq.${currentUser.id}`);
  const{count:fol}=await db.from('follows').select('*',{count:'exact',head:true}).eq('following_id',currentUser.id);
  document.getElementById('profileForumCount').textContent=fc||0;document.getElementById('profileRecordsCount').textContent=rc||0;document.getElementById('profileJobsCount').textContent=jc||0;document.getElementById('profileProductsCount').textContent=pc||0;document.getElementById('profileTutorialsCount').textContent=tc||0;document.getElementById('profileMessagesCount').textContent=mc||0;document.getElementById('followerCount').textContent=`${fol||0} followers`;
  document.getElementById('avatarUpload').onchange=async(e)=>{const f=e.target.files[0];if(!f)return;const{error}=await db.storage.from('avatars').upload(`${currentUser.id}/profile.jpg`,f,{upsert:true});if(!error){document.getElementById('profileAvatar').src=db.storage.from('avatars').getPublicUrl(`${currentUser.id}/profile.jpg`).data.publicUrl;showToast('Updated!');}};
}

function showPage(pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active-page'));
  const el=document.getElementById(pageId);if(el)el.classList.add('active-page');
  document.querySelectorAll('.nav-links li').forEach(li=>li.classList.remove('active'));
  const nav=document.querySelector(`.nav-links li[data-page="${pageId}"]`);if(nav)nav.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebarOverlay').classList.remove('active');
  switch(pageId){case'forum':loadForum();break;case'groups':loadGroups();break;case'records':loadRecords();break;case'jobs':loadJobs();break;case'applications':loadApplications();break;case'myapplications':loadMyApplications();break;case'market':loadMarket();break;case'messages':loadMessages();break;case'tutorials':loadTutorials();break;case'profile':loadProfile();break;case'calendar':loadCalendar();break;case'dashboard':loadDashboardStats();break;}
}

function openModal(mode){document.getElementById('modalTitle').innerText=mode==='login'?'Welcome Back':'Create Account';document.getElementById('authDisplayName').style.display=mode==='login'?'none':'block';document.getElementById('authModal').style.display='flex';}
function closeModal(){document.getElementById('authModal').style.display='none';['authEmail','authPass','authDisplayName'].forEach(id=>document.getElementById(id).value='');}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('hamburgerBtn').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebarOverlay').classList.toggle('active');});
  document.getElementById('sidebarOverlay').addEventListener('click',()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebarOverlay').classList.remove('active');});
  document.querySelectorAll('.nav-links li').forEach(li=>li.addEventListener('click',e=>{e.preventDefault();showPage(li.dataset.page);}));
  document.getElementById('loginBtn').addEventListener('click',()=>openModal('login'));
  document.getElementById('signupBtn').addEventListener('click',()=>openModal('signup'));
  document.getElementById('closeModalBtn').addEventListener('click',closeModal);
  document.getElementById('authModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  let authMode='login';
  document.getElementById('loginBtn').addEventListener('click',()=>{authMode='login';});
  document.getElementById('signupBtn').addEventListener('click',()=>{authMode='signup';});
  document.getElementById('authSubmitBtn').addEventListener('click',async()=>{const email=document.getElementById('authEmail').value.trim();const pass=document.getElementById('authPass').value;const dn=document.getElementById('authDisplayName').value.trim();try{if(authMode==='login')await login(email,pass);else{if(!dn)return showToast('Display name required',true);await signUp(email,pass,dn);}closeModal();}catch(err){showToast(err.message,true);}});
  document.getElementById('userGreeting').addEventListener('click',logout);
  document.getElementById('logoutBtn2').addEventListener('click',logout);
  document.getElementById('postForumBtn').addEventListener('click',()=>{const c=document.getElementById('forumContent').value.trim();const img=document.getElementById('forumImage').files[0];if(c){addForumPost(c,img);document.getElementById('forumContent').value='';document.getElementById('forumImage').value='';}});
  document.getElementById('createGroupBtn').addEventListener('click',createGroup);
  document.getElementById('groupLocationFilter').addEventListener('input',loadGroups);
  document.getElementById('addRecordBtn').addEventListener('click',()=>{const t=document.getElementById('recordTitle').value.trim();const d=document.getElementById('recordDetail').value.trim();const l=document.getElementById('recordLocation').value.trim();if(t){addRecord(t,d,l);document.getElementById('recordTitle').value='';document.getElementById('recordDetail').value='';document.getElementById('recordLocation').value='';}});
  document.getElementById('postJobBtn').addEventListener('click',()=>{const t=document.getElementById('jobTitle').value.trim();const d=document.getElementById('jobDesc').value.trim();const l=document.getElementById('jobLocation').value.trim();if(t){addJob(t,d,l);document.getElementById('jobTitle').value='';document.getElementById('jobDesc').value='';document.getElementById('jobLocation').value='';}});
  document.getElementById('jobLocationFilter').addEventListener('input',loadJobs);
  document.getElementById('addProductBtn').addEventListener('click',()=>{const n=document.getElementById('productName').value.trim();const p=document.getElementById('productPrice').value.trim();const cat=document.getElementById('productCategory').value;const loc=document.getElementById('productLocation').value.trim();const img=document.getElementById('productImage').files[0];if(n&&p){addProduct(n,p,cat,loc,img);document.getElementById('productName').value='';document.getElementById('productPrice').value='';document.getElementById('productLocation').value='';}});
  document.getElementById('marketCategoryFilter').addEventListener('change',loadMarket);
  document.getElementById('marketLocationFilter').addEventListener('input',loadMarket);
  document.getElementById('sendMsgBtn').addEventListener('click',()=>{const to=document.getElementById('msgTo').value.trim();const tx=document.getElementById('msgText').value.trim();if(to&&tx){sendMessage(to,tx);document.getElementById('msgTo').value='';document.getElementById('msgText').value='';}});
  document.getElementById('doSearchBtn').addEventListener('click',()=>{const t=document.getElementById('searchInput').value.trim();const cat=document.getElementById('searchCategory').value;const df=document.getElementById('searchDateFrom').value;const dt=document.getElementById('searchDateTo').value;if(t)globalSearch(t,cat,df,dt);});
  document.getElementById('addVideoBtn').addEventListener('click',()=>{const t=document.getElementById('videoTitle').value.trim();const u=document.getElementById('videoUrl').value.trim();const d=document.getElementById('videoDesc').value.trim();if(t&&u){addTutorial(t,u,d);document.getElementById('videoTitle').value='';document.getElementById('videoUrl').value='';document.getElementById('videoDesc').value='';}});
  document.getElementById('addEventBtn').addEventListener('click',addEvent);
  document.getElementById('calcYieldBtn').addEventListener('click',calculateYield);
  document.getElementById('saveProfileBtn').addEventListener('click',async()=>{if(!currentUser)return;const dn=document.getElementById('editDisplayName').value.trim();const ph=document.getElementById('editPhone').value.trim();const loc=document.getElementById('editLocation').value.trim();const bio=document.getElementById('editBio').value.trim();const{error}=await db.from('profiles').update({display_name:dn,phone:ph,location:loc,bio:bio}).eq('id',currentUser.id);if(error)showToast('Failed',true);else{currentUser.displayName=dn;updateAuthUI();showToast('Profile updated!');loadProfile();}});
  document.getElementById('sendChatBtn').addEventListener('click',async()=>{const input=document.getElementById('chatInput').value.trim();if(!input)return;const chat=document.getElementById('chatMessages');chat.innerHTML+=`<div class="message-bubble user-msg">${escapeHtml(input)}</div>`;document.getElementById('chatInput').value='';const reply=await wikiAnswer(input);chat.innerHTML+=`<div class="message-bubble bot-msg">${escapeHtml(reply)}</div>`;chat.scrollTop=chat.scrollHeight;});
  document.addEventListener('click',async function(e){
    const deleteBtn=e.target.closest('.delete-btn');if(deleteBtn){if(!currentUser)return showToast('Login first',true);if(!confirm('Delete?'))return;const{type,id}=deleteBtn.dataset;if(type==='forum')await deleteForumPost(id);else if(type==='record')await deleteRecord(id);else if(type==='job')await deleteJob(id);else if(type==='product')await deleteProduct(id);else if(type==='tutorial')await deleteTutorial(id);else if(type==='calendar')await deleteCalendarEvent(id);return;}
    const likeBtn=e.target.closest('.like-btn');if(likeBtn){const{type,id}=likeBtn.dataset;await toggleLike(type,id);return;}
    const replyToggle=e.target.closest('.reply-toggle');if(replyToggle){const pid=replyToggle.dataset.post;const rd=replyToggle.closest('.forum-post').nextElementSibling;rd.style.display=rd.style.display==='none'?'block':'none';loadReplies(pid,rd);return;}
    const sendReply=e.target.closest('.send-reply');if(sendReply&&currentUser){const pid=sendReply.dataset.post;const inp=sendReply.previousElementSibling;const ct=inp.value.trim();if(ct){await db.from('forum_replies').insert({post_id:pid,user_id:currentUser.id,content:ct});const rd=sendReply.closest('.reply-section');loadReplies(pid,rd);}return;}
    const applyBtn=e.target.closest('.apply-btn');if(applyBtn){e.preventDefault();e.stopPropagation();await applyToJob(applyBtn.dataset.job);return;}
    const acceptBtn=e.target.closest('.accept-app');if(acceptBtn){await updateApplicationStatus(acceptBtn.dataset.id,'accepted');return;}
    const rejectBtn=e.target.closest('.reject-app');if(rejectBtn){await updateApplicationStatus(rejectBtn.dataset.id,'rejected');return;}
    const contactApplicant=e.target.closest('.contact-applicant-btn');if(contactApplicant){document.getElementById('msgTo').value=contactApplicant.dataset.email;document.getElementById('msgText').value=`Hello ${contactApplicant.dataset.name}, regarding your application...`;showPage('messages');return;}
    const contactPoster=e.target.closest('.contact-poster-btn');if(contactPoster){document.getElementById('msgTo').value=contactPoster.dataset.email;document.getElementById('msgText').value=`Hello ${contactPoster.dataset.name}, I'm following up on my application...`;showPage('messages');return;}
  });
  checkSession();showPage('dashboard');
});
