// functions/api/[[path]].js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '').replace(/\/$/, '');

  // -------- Helpers --------
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function base64UrlEncode(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async function createToken(userId, email, secret) {
    const encoder = new TextEncoder();
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
    const headerB64 = await base64UrlEncode(encoder.encode(JSON.stringify(header)));
    const payloadB64 = await base64UrlEncode(encoder.encode(JSON.stringify(payload)));
    const input = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
    const sigB64 = await base64UrlEncode(sig);
    return `${input}.${sigB64}`;
  }

  async function verifyToken(token, secret) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, sigB64] = parts;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      );
      const input = `${headerB64}.${payloadB64}`;
      const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(input));
      if (!valid) return null;
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch (e) { return null; }
  }

  async function getUserFromRequest(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const token = cookie.match(/token=([^;]+)/)?.[1];
    if (!token) return null;
    return await verifyToken(token, env.JWT_SECRET);
  }

  // -------- Password hashing --------
  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Auth routes (no token needed) ──
  if (path === 'auth/register' && request.method === 'POST') {
    const { email, password, displayName } = await request.json();
    const hash = await hashPassword(password);
    try {
      const result = await env.DB.prepare(
        'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
      ).bind(email, hash, displayName).run();
      const token = await createToken(result.meta.last_row_id, email, env.JWT_SECRET);
      return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id, email, displayName }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400; Secure`,
        },
      });
    } catch (e) {
      return json({ error: 'Email already exists' }, 400);
    }
  }

  if (path === 'auth/login' && request.method === 'POST') {
    const { email, password } = await request.json();
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user || user.password_hash !== await hashPassword(password)) {
      return json({ error: 'Invalid credentials' }, 401);
    }
    const token = await createToken(user.id, user.email, env.JWT_SECRET);
    return new Response(JSON.stringify({ id: user.id, email: user.email, displayName: user.display_name }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400; Secure`,
      },
    });
  }

  if (path === 'auth/logout' && request.method === 'POST') {
    return new Response(null, {
      headers: {
        'Set-Cookie': `token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`,
      },
    });
  }

  if (path === 'auth/session' && request.method === 'GET') {
    const user = await getUserFromRequest(request, env);
    if (!user) return json({ error: 'Not authenticated' }, 401);
    const dbUser = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?').bind(user.sub).first();
    return json(dbUser);
  }

  // ── Protected routes ──
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const userId = user.sub;

  // Forum
  if (path === 'forum') {
    if (request.method === 'GET') {
      const posts = await env.DB.prepare(
        `SELECT fp.id, fp.content, fp.created_at, u.display_name AS author
         FROM forum_posts fp JOIN users u ON fp.user_id = u.id ORDER BY fp.created_at DESC`
      ).all();
      return json(posts.results);
    }
    if (request.method === 'POST') {
      const { content } = await request.json();
      await env.DB.prepare('INSERT INTO forum_posts (user_id, content) VALUES (?, ?)').bind(userId, content).run();
      return json({ success: true });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      await env.DB.prepare('DELETE FROM forum_posts WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return json({ success: true });
    }
  }

  // Records
  if (path === 'records') {
    if (request.method === 'GET') {
      const records = await env.DB.prepare('SELECT * FROM farm_records WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
      return json(records.results);
    }
    if (request.method === 'POST') {
      const { title, detail } = await request.json();
      await env.DB.prepare('INSERT INTO farm_records (user_id, title, detail) VALUES (?, ?, ?)').bind(userId, title, detail).run();
      return json({ success: true });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      await env.DB.prepare('DELETE FROM farm_records WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return json({ success: true });
    }
  }

  // Jobs
  if (path === 'jobs') {
    if (request.method === 'GET') {
      const jobs = await env.DB.prepare(
        `SELECT j.id, j.title, j.description, j.created_at, u.display_name AS author
         FROM job_listings j JOIN users u ON j.user_id = u.id ORDER BY j.created_at DESC`
      ).all();
      return json(jobs.results);
    }
    if (request.method === 'POST') {
      const { title, description } = await request.json();
      await env.DB.prepare('INSERT INTO job_listings (user_id, title, description) VALUES (?, ?, ?)').bind(userId, title, description).run();
      return json({ success: true });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      await env.DB.prepare('DELETE FROM job_listings WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return json({ success: true });
    }
  }

  // Market
  if (path === 'market') {
    if (request.method === 'GET') {
      const products = await env.DB.prepare(
        `SELECT p.id, p.name, p.price, u.display_name AS seller
         FROM products p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC`
      ).all();
      return json(products.results);
    }
    if (request.method === 'POST') {
      const { name, price } = await request.json();
      await env.DB.prepare('INSERT INTO products (user_id, name, price) VALUES (?, ?, ?)').bind(userId, name, price).run();
      return json({ success: true });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      await env.DB.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return json({ success: true });
    }
  }

  // Messages
  if (path === 'messages') {
    if (request.method === 'GET') {
      const msgs = await env.DB.prepare(
        `SELECT m.id, m.text, m.created_at,
                fu.display_name AS from_name, tu.display_name AS to_name
         FROM messages m
         JOIN users fu ON m.from_user_id = fu.id
         JOIN users tu ON m.to_user_id = tu.id
         WHERE m.from_user_id = ? OR m.to_user_id = ?
         ORDER BY m.created_at DESC`
      ).bind(userId, userId).all();
      return json(msgs.results);
    }
    if (request.method === 'POST') {
      const { toEmail, text } = await request.json();
      const toUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(toEmail).first();
      if (!toUser) return json({ error: 'Recipient not found' }, 404);
      await env.DB.prepare('INSERT INTO messages (from_user_id, to_user_id, text) VALUES (?, ?, ?)').bind(userId, toUser.id, text).run();
      return json({ success: true });
    }
  }

  // Tutorials
  if (path === 'tutorials') {
    if (request.method === 'GET') {
      const tutorials = await env.DB.prepare(
        `SELECT t.id, t.title, t.url, t.description, t.created_at, u.display_name AS author
         FROM tutorials t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC`
      ).all();
      return json(tutorials.results);
    }
    if (request.method === 'POST') {
      const { title, url, description } = await request.json();
      await env.DB.prepare('INSERT INTO tutorials (user_id, title, url, description) VALUES (?, ?, ?, ?)').bind(userId, title, url, description).run();
      return json({ success: true });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      await env.DB.prepare('DELETE FROM tutorials WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return json({ success: true });
    }
  }

  // Search
  if (path === 'search' && request.method === 'GET') {
    const q = `%${url.searchParams.get('q') || ''}%`;
    const results = [];
    const forumRows = await env.DB.prepare('SELECT content FROM forum_posts WHERE content LIKE ?').bind(q).all();
    forumRows.results.forEach(r => results.push({ text: r.content.substring(0, 80) + '...' }));
    const recordRows = await env.DB.prepare('SELECT title FROM farm_records WHERE title LIKE ?').bind(q).all();
    recordRows.results.forEach(r => results.push({ text: r.title }));
    const jobRows = await env.DB.prepare('SELECT title FROM job_listings WHERE title LIKE ?').bind(q).all();
    jobRows.results.forEach(r => results.push({ text: r.title }));
    const tutorialRows = await env.DB.prepare('SELECT title FROM tutorials WHERE title LIKE ?').bind(q).all();
    tutorialRows.results.forEach(r => results.push({ text: r.title }));
    return json(results);
  }

  return json({ error: 'Not found' }, 404);
}
