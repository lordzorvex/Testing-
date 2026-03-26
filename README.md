# 🔒 CipherTalk — Setup Guide

## What you get
- Real WebSocket server (Node.js)
- AES-256-GCM end-to-end encryption (server NEVER sees plaintext)
- 1-on-1 DMs + Group chats
- Image & file sharing (encrypted)
- Username-only signup (no phone, no email)
- Typing indicators, online status, real-time messaging

---

## ▶ OPTION 1 — Run on YOUR PC (chat over Wi-Fi / local network)

### Step 1 — Install Node.js
Download from: https://nodejs.org  (choose "LTS" version)

### Step 2 — Install dependencies
Open a terminal / command prompt in this folder, run:
```
npm install
```

### Step 3 — Start the server
```
npm start
```
You'll see:
```
🔒 CipherTalk running → http://localhost:3000
```

### Step 4 — Share with your friend (same Wi-Fi)
1. Find your PC's local IP address:
   - Windows: open CMD → type `ipconfig` → look for IPv4 Address (e.g. 192.168.1.5)
   - Mac/Linux: open Terminal → type `ifconfig` → look for inet (e.g. 192.168.1.5)

2. Tell your friend to open: `http://192.168.1.5:3000` in their browser
3. You open: `http://localhost:3000`
4. Both register usernames → start chatting!

---

## ▶ OPTION 2 — Deploy FREE to Railway (chat over the Internet)

Railway gives you a free public URL so anyone can join from anywhere.

### Step 1 — Create account
Go to: https://railway.app → Sign up (free, use GitHub)

### Step 2 — Deploy
1. Click "New Project" → "Deploy from GitHub repo"
   OR use the Railway CLI:
   ```
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```
2. Railway auto-detects Node.js and runs `npm start`
3. Go to your project → Settings → Generate Domain
4. Share that URL with your friend (e.g. `https://ciphertalk-xyz.railway.app`)

---

## ▶ OPTION 3 — Deploy FREE to Render

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo (upload this folder first)
3. Build command: `npm install`
4. Start command: `node server.js`
5. Free tier gives you a public URL

---

## ▶ OPTION 4 — ngrok (instant public URL from your PC)

If you don't want to deploy, use ngrok to make your local server public:

1. Install ngrok: https://ngrok.com/download
2. Start CipherTalk: `npm start`
3. In another terminal: `ngrok http 3000`
4. ngrok gives you a URL like `https://abc123.ngrok.io`
5. Share that URL with your friend — works from anywhere!

---

## Security Notes
- Messages are encrypted with AES-256-GCM **before** leaving your browser
- The server only stores ciphertext — it physically cannot read your messages
- Passwords are hashed with PBKDF2 + SHA-256 (100,000 iterations)
- No email, no phone number, no tracking, no ads
- Data is stored in memory — restarting the server clears all messages

## File size limit
Max 10MB per file/image (can be increased in server.js `express.json({ limit: '50mb' })`)
