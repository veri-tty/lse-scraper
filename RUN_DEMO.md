# Running the LSE Scraper Demo

## Quick Start (No Database Required!)

The demo server runs completely in-memory - perfect for testing without PostgreSQL.

### Option 1: Run Demo Server Directly

```bash
# Make sure you're on the right branch
git checkout claude/comprehensive-fix-011CUNVSLLaZ58mC3vumSt8a

# Install dependencies (skip puppeteer)
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Run the demo server
npx tsx src/server-demo.ts
```

### Option 2: Run Built Version

```bash
npm run build
node dist/server-demo.js
```

## Server will be available at:
**http://localhost:3000**

## Test the API

### 1. Check Health
```bash
curl http://localhost:3000/health
```

### 2. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 3. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Copy the `token` from the response.

### 4. Get Articles (with authentication)
```bash
curl http://localhost:3000/api/articles \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Search Articles
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"keywords":["acquisition"],"limit":10}'
```

### 6. Get Stats
```bash
curl http://localhost:3000/api/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## What's Included

- ✅ User registration with bcrypt password hashing
- ✅ JWT token-based authentication
- ✅ 3 sample M&A articles (acquisitions, mergers, partnerships)
- ✅ Search functionality with keyword filtering
- ✅ All API endpoints functional
- ✅ No database setup required!

## Demo Data

The server includes 3 sample articles:
1. **Tech Corp Acquires Startup Inc** - Acquisition story
2. **Global Bank and Regional Finance Merger** - Merger announcement  
3. **Pharma Co and BioTech Alliance** - Strategic partnership

All articles include keywords like "acquisition", "merger", "partnership" for testing search.

## Available Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/user/profile` - Get user profile (requires auth)
- `POST /api/search` - Search articles (requires auth)
- `GET /api/articles` - List all articles (requires auth)
- `GET /api/articles/:id` - Get article by ID (requires auth)
- `GET /api/stats` - Get statistics (requires auth)

## Notes

- Data is stored in-memory (not persisted)
- Perfect for development and testing
- All authentication features work correctly
- No PostgreSQL required!

Enjoy testing! 🚀
