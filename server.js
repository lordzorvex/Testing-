'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── IN-MEMORY STORE ──
const users    = new Map(); // username → { username, display, color, salt, passHash }
const chats    = new Map(); // chatId   → chat object
const messages = new Map(); // chatId   → [ msg, ... ]
const clients  = new Map(); // username → WebSocket

function chatMsgs(chatId) {
  if (!messages.has(chatId)) messages.set(chatId, []);
  return messages.get(chatId);
}

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcastToChat(chatId, data, exceptUser = null) {
  const chat = chats.get(chatId);
  if (!chat) return;
  const members = chat.members || [chat.user1, chat.user2];
  members.forEach(u => {
    if (u === exceptUser) return;
    const ws = clients.get(u);
    if (ws) send(ws, data);
  });
}

// ── REST API ──

app.post('/api/register', (req, res) => {
  const { username, display, color, salt, passHash } = req.body;
  if (!username || !passHash || !salt) return res.status(400).json({ error: 'Missing fields' });
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Invalid username format' });
  if (users.has(username)) return res.status(409).json({ error: 'Username already taken' });
  users.set(username, { username, display: display || username, color: color ?? 0, salt, passHash });
  console.log(`[+] Registered @${username}`);
  res.json({ ok: true });
});

app.get('/api/salt/:username', (req, res) => {
  const u = users.get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ salt: u.salt });
});

app.post('/api/login', (req, res) => {
  const { username, passHash } = req.body;
  const u = users.get(username);
  if (!u || u.passHash !== passHash) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, user: { username: u.username, display: u.display, color: u.color } });
});

app.get('/api/user/:username', (req, res) => {
  const u = users.get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ username: u.username, display: u.display, color: u.color });
});

app.get('/api/chats/:username', (req, res) => {
  const uname = req.params.username;
  const mine = [];
  chats.forEach(c => {
    const members = c.members || [c.user1, c.user2];
    if (members.includes(uname)) mine.push(c);
  });
  res.json(mine.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
});

app.get('/api/messages/:chatId', (req, res) => {
  res.json(chatMsgs(req.params.chatId).slice(-300));
});

app.post('/api/dm', (req, res) => {
  const { from, to, keyHex } = req.body;
  if (!users.has(to)) return res.status(404).json({ error: 'User "' + to + '" not found' });
  const chatId = 'dm_' + [from, to].sort().join('_');
  if (!chats.has(chatId)) {
    chats.set(chatId, { id: chatId, type: 'dm', user1: from, user2: to, keyHex, ts: Date.now(), lastMsg: '', lastTime: '' });
  }
  const chat = chats.get(chatId);
  // Notify recipient if online
  const fromUser = users.get(from);
  const recipWs = clients.get(to);
  if (recipWs) send(recipWs, { type: 'NEW_CHAT', chat, peerDisplay: fromUser?.display, peerColor: fromUser?.color });
  res.json({ chatId });
});

app.post('/api/group', (req, res) => {
  const { name, members, keyHex, color, createdBy } = req.body;
  const chatId = 'grp_' + crypto.randomBytes(8).toString('hex');
  const chat = { id: chatId, type: 'group', displayName: name, members, color: color ?? 0, keyHex, ts: Date.now(), lastMsg: '', lastTime: '', createdBy };
  chats.set(chatId, chat);
  members.forEach(u => { if (u !== createdBy) { const ws = clients.get(u); if (ws) send(ws, { type: 'NEW_CHAT', chat }); } });
  res.json({ chatId });
});

app.post('/api/group/:chatId/member', (req, res) => {
  const chat = chats.get(req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Group not found' });
  const { username } = req.body;
  if (!chat.members.includes(username)) {
    chat.members.push(username);
    const ws = clients.get(username);
    if (ws) send(ws, { type: 'NEW_CHAT', chat });
  }
  res.json({ ok: true });
});

// ── WEBSOCKET ──
wss.on('connection', ws => {
  let me = null;

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.type) {
      case 'AUTH': {
        if (!users.has(data.username)) return send(ws, { type: 'ERROR', msg: 'Unknown user' });
        me = data.username;
        clients.set(me, ws);
        console.log(`[WS] @${me} connected (${clients.size} online)`);
        // Tell everyone I'm online; tell me who's online
        const onlineList = [];
        clients.forEach((_, u) => { if (u !== me) { onlineList.push(u); send(clients.get(u), { type: 'ONLINE', username: me }); } });
        send(ws, { type: 'AUTH_OK', onlineUsers: onlineList });
        break;
      }
      case 'MSG': {
        if (!me) return;
        const chat = chats.get(data.chatId);
        if (!chat) return;
        const members = chat.members || [chat.user1, chat.user2];
        if (!members.includes(me)) return;
        const msg = {
          id: data.msgId || crypto.randomUUID(),
          chatId: data.chatId, from: me,
          encContent: data.encContent || null,
          encMedia: data.encMedia || null,
          mediaType: data.mediaType || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          time: data.time, ts: data.ts || Date.now()
        };
        chatMsgs(data.chatId).push(msg);
        chat.lastMsg = data.mediaType === 'image' ? '📷 Photo' : data.mediaType === 'file' ? '📎 ' + (data.fileName || '') : '🔒 encrypted';
        chat.lastTime = data.time; chat.ts = msg.ts;
        // Send to ALL members including sender (for multi-device)
        members.forEach(u => { const ws2 = clients.get(u); if (ws2) send(ws2, { type: 'MSG', ...msg }); });
        break;
      }
      case 'TYPING':
        if (!me) return;
        broadcastToChat(data.chatId, { type: 'TYPING', chatId: data.chatId, from: me, display: data.display }, me);
        break;
      case 'PING':
        send(ws, { type: 'PONG' });
        break;
    }
  });

  ws.on('close', () => {
    if (me) {
      clients.delete(me);
      console.log(`[WS] @${me} disconnected (${clients.size} online)`);
      clients.forEach((cws) => send(cws, { type: 'OFFLINE', username: me }));
      me = null;
    }
  });
  ws.on('error', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  🔒 CipherTalk Server Running        ║`);
  console.log(`║  http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
