import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDatabase, pool } from './config/database';
import { logger } from './config/logger';
import { DatabaseMigrations } from './database/migrations';
import { AuthService } from './services/auth.service';
import { LSEScrapingService } from './services/scraping.service';
import { OpenRouterService } from './services/openrouter.service';
import { SearchService } from './services/search.service';
import { SchedulerService } from './services/scheduler.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = AuthService.verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  (req as any).user = decoded;
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'LSE News Scraper API',
    version: '1.0.0',
    status: 'running'
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

    const user = await AuthService.registerUser(email, password);
    const token = AuthService.generateToken(user);
    
    res.status(201).json({ user, token });
  } catch (error: any) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ error: 'Email already exists' });
    }
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

    const result = await AuthService.loginUser(email, password);
    
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// User profile and API key management
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await AuthService.getUserById((req as any).user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/user/api-key', authenticateToken, async (req, res) => {
  try {
    const { apiKey } = req.body;
    const userId = (req as any).user.userId;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const openRouterService = new OpenRouterService();
    await openRouterService.updateUserApiKey(userId, apiKey);
    
    res.json({ message: 'API key updated successfully' });
  } catch (error: any) {
    logger.error('API key update error:', error);
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Scraping endpoints
app.post('/api/scraping/start', authenticateToken, async (req, res) => {
  try {
    const { searchTerms, dateRange } = req.body;
    
    if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
      return res.status(400).json({ error: 'Search terms are required' });
    }

    if (!dateRange || !dateRange.from || !dateRange.to) {
      return res.status(400).json({ error: 'Date range is required' });
    }

    const scrapingService = new LSEScrapingService();
    const jobId = await scrapingService.createScrapingJob(
      searchTerms,
      {
        from: new Date(dateRange.from),
        to: new Date(dateRange.to)
      }
    );

    // Start scraping in background
    scrapingService.scrapeArticles(
      searchTerms,
      {
        from: new Date(dateRange.from),
        to: new Date(dateRange.to)
      },
      jobId
    ).catch(error => {
      logger.error('Background scraping failed:', error);
    });

    res.json({ jobId, message: 'Scraping job started' });
  } catch (error) {
    logger.error('Scraping start error:', error);
    res.status(500).json({ error: 'Failed to start scraping' });
  }
});

app.get('/api/scraping/jobs', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const scrapingService = new LSEScrapingService();
    const jobs = await scrapingService.getScrapingJobs(limit);
    
    res.json({ jobs });
  } catch (error) {
    logger.error('Get scraping jobs error:', error);
    res.status(500).json({ error: 'Failed to get scraping jobs' });
  }
});

// Search endpoints
app.post('/api/search', authenticateToken, async (req, res) => {
  try {
    const searchQuery = req.body;
    const userId = (req as any).user.userId;
    
    // Validate search query
    if (searchQuery.limit && (searchQuery.limit < 1 || searchQuery.limit > 100)) {
      searchQuery.limit = 20;
    }
    if (searchQuery.offset && searchQuery.offset < 0) {
      searchQuery.offset = 0;
    }

    const searchService = new SearchService();
    const results = await searchService.searchArticles(searchQuery, userId);
    
    res.json(results);
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/articles/:id', authenticateToken, async (req, res) => {
  try {
    const articleId = req.params.id;
    const searchService = new SearchService();
    const article = await searchService.getArticleById(articleId);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ article });
  } catch (error) {
    logger.error('Get article error:', error);
    res.status(500).json({ error: 'Failed to get article' });
  }
});

app.post('/api/articles/:id/analyze', authenticateToken, async (req, res) => {
  try {
    const articleId = req.params.id;
    const userId = (req as any).user.userId;
    const { targetKeywords } = req.body;

    const openRouterService = new OpenRouterService();
    const userApiKey = await openRouterService.getUserApiKey(userId);
    
    if (!userApiKey) {
      return res.status(400).json({ error: 'OpenRouter API key not configured' });
    }

    // Get article content
    const searchService = new SearchService();
    const article = await searchService.getArticleById(articleId);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Extract PDF texts if any
    const pdfTexts: string[] = [];
    if (article.pdfs && Array.isArray(article.pdfs)) {
      // In a real implementation, you'd extract text from PDFs here
      // For now, we'll just use empty array
    }

    const analysis = await openRouterService.analyzeArticle(
      articleId,
      article.content,
      pdfTexts,
      userApiKey,
      targetKeywords
    );
    
    res.json({ analysis });
  } catch (error: any) {
    logger.error('Article analysis error:', error);
    if (error.message.includes('API key')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Search history and stats
app.get('/api/user/search-history', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const searchService = new SearchService();
    const history = await searchService.getUserSearchHistory(userId, limit);
    
    res.json({ history });
  } catch (error) {
    logger.error('Get search history error:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const searchService = new SearchService();
    const stats = await searchService.getSearchStats();
    const popularTerms = await searchService.getPopularSearchTerms(10);
    
    res.json({ stats, popularTerms });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Admin endpoints (role-based access)
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT id, email, role, is_active, created_at, last_login,
             (CASE WHEN openrouter_api_key_encrypted IS NOT NULL THEN true ELSE false END) as has_api_key
      FROM users
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    const users = result.rows;
    
    res.json({ users });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { isActive } = req.body;
    
    const query = `
      UPDATE users 
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, is_active
    `;
    
    const result = await pool.query(query, [isActive, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const query = `
      UPDATE users 
      SET role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, role
    `;
    
    const result = await pool.query(query, [role, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Scheduler management endpoints
app.get('/api/admin/scheduler/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const status = await schedulerService.getScheduleStatus();
    res.json({ status });
  } catch (error) {
    logger.error('Get scheduler status error:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

app.post('/api/admin/scheduler/custom', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, cronExpression, searchTerms, dateRangeHours } = req.body;
    
    if (!name || !cronExpression || !searchTerms || !Array.isArray(searchTerms)) {
      return res.status(400).json({ error: 'Name, cron expression, and search terms are required' });
    }

    await schedulerService.createCustomSchedule(
      name,
      cronExpression,
      searchTerms,
      dateRangeHours || 24
    );
    
    res.json({ message: 'Custom schedule created successfully' });
  } catch (error) {
    logger.error('Create custom schedule error:', error);
    res.status(500).json({ error: 'Failed to create custom schedule' });
  }
});

app.delete('/api/admin/scheduler/:name', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    schedulerService.stopJob(name);
    res.json({ message: 'Scheduled job stopped successfully' });
  } catch (error) {
    logger.error('Stop scheduled job error:', error);
    res.status(500).json({ error: 'Failed to stop scheduled job' });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize scheduler service
let schedulerService: SchedulerService;

const startServer = async () => {
  try {
    await connectDatabase();
    await DatabaseMigrations.runMigrations();
    
    // Initialize and start scheduler
    schedulerService = new SchedulerService();
    await schedulerService.startDefaultSchedules();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`🚀 Server running on http://localhost:${PORT}`);
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