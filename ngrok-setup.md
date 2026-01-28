# Ngrok Setup Guide for OmniShop

## Quick Setup

### 1. Install Ngrok (if not already installed)
```bash
brew install ngrok
```

### 2. Configure Ngrok Auth Token (first time only)
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

### 3. Start the Application with Ngrok

#### Option A: Start ngrok for frontend (recommended)
```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start frontend
cd client && npm run dev

# Terminal 3: Start ngrok tunnel to frontend
ngrok http 5173
```

The ngrok URL will be displayed in Terminal 3. Share this URL to access your app remotely!

#### Option B: Proxy backend API through ngrok
```bash
# Terminal 1: Start backend with ngrok
cd server && npm run dev

# In another terminal
ngrok http 3000

# Then update client/.env:
# VITE_API_URL=https://your-ngrok-url.ngrok-free.app

# Terminal 2: Start frontend
cd client && npm run dev
```

## Configuration Already Done ✅

The following configurations are already set up:

### Backend (`server/index.js`)
- ✅ Trust proxy enabled for ngrok
- ✅ CORS configured to allow all origins
- ✅ API routes working with proxy

### Frontend (`client/vite.config.js`)
- ✅ Allowed hosts configured for ngrok domains
- ✅ Proxy configured for API requests
- ✅ Host set to listen on all addresses

## Sharing Your App

1. Start ngrok with one of the options above
2. Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`)
3. Share this URL with others
4. They can access your app remotely!

## Troubleshooting

### If you get "ERR_NGROK_6024" error
- This means you hit the free tier limit
- Try restarting ngrok
- Or upgrade to a paid plan

### If API requests fail
- Make sure both backend and frontend are running
- Check that the proxy is configured correctly
- Verify CORS is allowing the ngrok domain

### If you see "Visit Site" warning
- Click "Visit Site" button on the ngrok warning page
- This is normal for free ngrok accounts
