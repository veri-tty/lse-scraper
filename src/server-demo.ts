import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './config/logger';
import { AuthService } from './services/auth.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-memory storage for demo mode
const users: any[] = [];
const articles: any[] = [
  {
    id: 'demo-1',
    title: 'Example Acquisition: Tech Corp Acquires Startup Inc',
    url: 'https://example.com/article1',
    publishDate: new Date('2024-01-15'),
    company: 'Tech Corp',
    summary: 'Tech Corp announces major acquisition of Startup Inc for $500M in a strategic move to expand market presence.',
    keywordsFound: ['acquisition', 'merger'],
    pdfCount: 2
  },
  {
    id: 'demo-2',
    title: 'Merger News: Global Bank and Regional Finance Join Forces',
    url: 'https://example.com/article2',
    publishDate: new Date('2024-01-20'),
    company: 'Global Bank',
    summary: 'Global Bank and Regional Finance announce merger plans to create leading financial institution.',
    keywordsFound: ['merger', 'consolidation'],
    pdfCount: 1
  },
  {
    id: 'demo-3',
    title: 'Strategic Partnership: Pharma Co and BioTech Alliance',
    url: 'https://example.com/article3',
    publishDate: new Date('2024-02-01'),
    company: 'Pharma Co',
    summary: 'Major pharmaceutical company enters strategic partnership with biotech firm for drug development.',
    keywordsFound: ['partnership', 'strategic alliance'],
    pdfCount: 0
  }
];

// Authentication middleware
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  const decoded = AuthService.verifyToken(token);
  if (!decoded) {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as any).user = decoded;
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mode: 'DEMO MODE - No database required',
    message: 'This is a demo version running without PostgreSQL'
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'LSE News Scraper API - DEMO MODE',
    version: '1.0.0',
    status: 'running',
    mode: 'demo',
    note: 'Running without database. Some features use mock data.',
    endpoints: {
      health: 'GET /health',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      search: 'POST /api/search (requires auth)',
      articles: 'GET /api/articles (requires auth)'
    }
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    if (users.find(u => u.email === email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await AuthService.hashPassword(password);
    const user = {
      id: `user-${Date.now()}`,
      email,
      passwordHash,
      role: 'user',
      isActive: true,
      createdAt: new Date()
    };

    users.push(user);
    const token = AuthService.generateToken(user);

    res.status(201).json({
      user: { ...user, passwordHash: undefined },
      token
    });
  } catch (error: any) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await AuthService.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = AuthService.generateToken(user);

    res.json({
      user: { ...user, passwordHash: undefined },
      token
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// User profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: { ...user, passwordHash: undefined } });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Search endpoints - Demo data
app.post('/api/search', authenticateToken, async (req, res) => {
  try {
    const { keywords, limit = 20, offset = 0 } = req.body;

    let results = [...articles];

    // Filter by keywords if provided
    if (keywords && keywords.length > 0) {
      const searchTerms = keywords.map((k: string) => k.toLowerCase());
      results = results.filter(article =>
        searchTerms.some((term: string) =>
          article.title.toLowerCase().includes(term) ||
          article.summary.toLowerCase().includes(term) ||
          article.keywordsFound.some((kw: string) => kw.toLowerCase().includes(term))
        )
      );
    }

    const totalCount = results.length;
    const paginatedResults = results.slice(offset, offset + limit);

    res.json({
      articles: paginatedResults,
      totalCount,
      facets: {
        companies: [
          { name: 'Tech Corp', count: 5 },
          { name: 'Global Bank', count: 3 },
          { name: 'Pharma Co', count: 2 }
        ],
        keywords: [
          { keyword: 'acquisition', count: 8 },
          { keyword: 'merger', count: 6 },
          { keyword: 'partnership', count: 4 }
        ],
        dateRanges: [
          { range: 'Last 7 days', count: 3 },
          { range: 'Last 30 days', count: 8 },
          { range: 'Last 3 months', count: 15 }
        ]
      }
    });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get all articles (demo)
app.get('/api/articles', authenticateToken, async (req, res) => {
  try {
    res.json({
      articles,
      totalCount: articles.length,
      message: 'Demo data - these are sample articles'
    });
  } catch (error) {
    logger.error('Get articles error:', error);
    res.status(500).json({ error: 'Failed to get articles' });
  }
});

// Get article by ID
app.get('/api/articles/:id', authenticateToken, async (req, res) => {
  try {
    const articleId = req.params.id;
    const article = articles.find(a => a.id === articleId);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({
      article: {
        ...article,
        content: 'This is demo content for the article. In production, this would contain the full article text scraped from the LSE website.',
        pdfs: []
      }
    });
  } catch (error) {
    logger.error('Get article error:', error);
    res.status(500).json({ error: 'Failed to get article' });
  }
});

// Stats endpoint
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    res.json({
      stats: {
        totalArticles: articles.length,
        analyzedArticles: articles.length,
        totalSearches: 42,
        uniqueUsers: users.length
      },
      popularTerms: [
        { term: 'acquisition', count: 15 },
        { term: 'merger', count: 12 },
        { term: 'partnership', count: 8 }
      ]
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const startServer = async () => {
  try {
    logger.info('Starting server in DEMO MODE (no database required)');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 LSE News Scraper API - DEMO MODE`);
      console.log(`${'='.repeat(60)}`);
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ API docs: http://localhost:${PORT}/`);
      console.log(`\n📝 Demo Mode Features:`);
      console.log(`   • User registration and login (in-memory)`);
      console.log(`   • JWT authentication`);
      console.log(`   • Sample articles with search`);
      console.log(`   • All endpoints available for testing`);
      console.log(`\n⚠️  Note: Data is not persisted (in-memory only)`);
      console.log(`${'='.repeat(60)}\n`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
