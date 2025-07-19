import cron from 'node-cron';
import { LSEScrapingService } from './scraping.service';
import { OpenRouterService } from './openrouter.service';
import { pool } from '../config/database';
import { logger } from '../config/logger';

export class SchedulerService {
  private scrapingService: LSEScrapingService;
  private openRouterService: OpenRouterService;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.scrapingService = new LSEScrapingService();
    this.openRouterService = new OpenRouterService();
  }

  async startDefaultSchedules(): Promise<void> {
    try {
      // Daily scraping at 6 AM
      this.scheduleJob('daily-scrape', '0 6 * * *', async () => {
        await this.runDailyScrape();
      });

      // Weekly comprehensive scrape on Sundays at 2 AM
      this.scheduleJob('weekly-scrape', '0 2 * * 0', async () => {
        await this.runWeeklyScrape();
      });

      // Hourly analysis of unanalyzed articles
      this.scheduleJob('hourly-analysis', '0 * * * *', async () => {
        await this.runAnalysisJob();
      });

      logger.info('Default scheduled jobs started');
    } catch (error) {
      logger.error('Failed to start scheduled jobs:', error);
      throw error;
    }
  }

  scheduleJob(name: string, cronExpression: string, task: () => Promise<void>): void {
    try {
      // Stop existing job if it exists
      if (this.scheduledJobs.has(name)) {
        this.scheduledJobs.get(name)?.stop();
      }

      const scheduledTask = cron.schedule(cronExpression, async () => {
        logger.info(`Starting scheduled job: ${name}`);
        try {
          await task();
          logger.info(`Completed scheduled job: ${name}`);
        } catch (error) {
          logger.error(`Scheduled job failed: ${name}`, error);
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.scheduledJobs.set(name, scheduledTask);
      logger.info(`Scheduled job created: ${name} with cron: ${cronExpression}`);
    } catch (error) {
      logger.error(`Failed to schedule job ${name}:`, error);
      throw error;
    }
  }

  stopJob(name: string): void {
    const job = this.scheduledJobs.get(name);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(name);
      logger.info(`Stopped scheduled job: ${name}`);
    }
  }

  stopAllJobs(): void {
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    }
    this.scheduledJobs.clear();
  }

  getActiveJobs(): string[] {
    return Array.from(this.scheduledJobs.keys());
  }

  private async runDailyScrape(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const today = new Date();
      
      const searchTerms = [
        'acquisition',
        'merger',
        'takeover',
        'announcement',
        'results'
      ];

      logger.info('Starting daily scrape job');
      
      const articles = await this.scrapingService.scrapeArticles(
        searchTerms,
        {
          from: yesterday,
          to: today
        }
      );

      logger.info(`Daily scrape completed: ${articles.length} articles found`);
      
      // Trigger analysis for new articles
      await this.analyzeNewArticles(articles.map(a => a.id));
      
    } catch (error) {
      logger.error('Daily scrape job failed:', error);
      throw error;
    }
  }

  private async runWeeklyScrape(): Promise<void> {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const today = new Date();
      
      const searchTerms = [
        'acquisition',
        'merger',
        'takeover',
        'buyout',
        'joint venture',
        'partnership',
        'strategic alliance',
        'consolidation',
        'divestiture',
        'spin-off',
        'IPO',
        'listing',
        'delisting',
        'rights issue',
        'dividend'
      ];

      logger.info('Starting weekly comprehensive scrape job');
      
      const articles = await this.scrapingService.scrapeArticles(
        searchTerms,
        {
          from: oneWeekAgo,
          to: today
        }
      );

      logger.info(`Weekly scrape completed: ${articles.length} articles found`);
      
      // Trigger analysis for new articles
      await this.analyzeNewArticles(articles.map(a => a.id));
      
    } catch (error) {
      logger.error('Weekly scrape job failed:', error);
      throw error;
    }
  }

  private async runAnalysisJob(): Promise<void> {
    try {
      logger.info('Starting analysis job for unanalyzed articles');
      
      // Get articles that haven't been analyzed yet
      const query = `
        SELECT a.id, a.content
        FROM articles a
        LEFT JOIN article_analyses aa ON a.id = aa.article_id
        WHERE aa.id IS NULL
          AND a.content IS NOT NULL
          AND a.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY a.created_at DESC
        LIMIT 50
      `;

      const result = await pool.query(query);
      const unanalyzedArticles = result.rows;

      if (unanalyzedArticles.length === 0) {
        logger.info('No unanalyzed articles found');
        return;
      }

      // Get users with API keys for analysis
      const usersQuery = `
        SELECT id, openrouter_api_key_encrypted
        FROM users
        WHERE openrouter_api_key_encrypted IS NOT NULL
          AND is_active = true
          AND role = 'admin'
        LIMIT 1
      `;

      const usersResult = await pool.query(usersQuery);
      
      if (usersResult.rows.length === 0) {
        logger.warn('No admin users with API keys found for automated analysis');
        return;
      }

      const adminUser = usersResult.rows[0];
      const apiKey = await this.openRouterService.decryptApiKey(adminUser.openrouter_api_key_encrypted);

      // Analyze articles
      let analyzedCount = 0;
      for (const article of unanalyzedArticles) {
        try {
          await this.openRouterService.analyzeArticle(
            article.id,
            article.content,
            [], // No PDFs for now
            apiKey
          );
          analyzedCount++;
          
          // Add delay to respect rate limits
          await this.delay(2000);
        } catch (error) {
          logger.warn(`Failed to analyze article ${article.id}:`, error);
          continue;
        }
      }

      logger.info(`Analysis job completed: ${analyzedCount}/${unanalyzedArticles.length} articles analyzed`);
      
    } catch (error) {
      logger.error('Analysis job failed:', error);
      throw error;
    }
  }

  private async analyzeNewArticles(articleIds: string[]): Promise<void> {
    if (articleIds.length === 0) return;

    try {
      // Get admin user with API key
      const usersQuery = `
        SELECT id, openrouter_api_key_encrypted
        FROM users
        WHERE openrouter_api_key_encrypted IS NOT NULL
          AND is_active = true
          AND role = 'admin'
        LIMIT 1
      `;

      const usersResult = await pool.query(usersQuery);
      
      if (usersResult.rows.length === 0) {
        logger.warn('No admin users with API keys found for analysis');
        return;
      }

      const adminUser = usersResult.rows[0];
      const apiKey = await this.openRouterService.decryptApiKey(adminUser.openrouter_api_key_encrypted);

      // Get article content
      const articlesQuery = `
        SELECT id, content
        FROM articles
        WHERE id = ANY($1) AND content IS NOT NULL
      `;

      const articlesResult = await pool.query(articlesQuery, [articleIds]);
      const articles = articlesResult.rows;

      // Analyze each article
      let analyzedCount = 0;
      for (const article of articles) {
        try {
          await this.openRouterService.analyzeArticle(
            article.id,
            article.content,
            [], // No PDFs for now
            apiKey
          );
          analyzedCount++;
          
          // Add delay to respect rate limits
          await this.delay(1500);
        } catch (error) {
          logger.warn(`Failed to analyze article ${article.id}:`, error);
          continue;
        }
      }

      logger.info(`Analyzed ${analyzedCount}/${articles.length} new articles`);
      
    } catch (error) {
      logger.error('Failed to analyze new articles:', error);
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getScheduleStatus(): Promise<{
    activeJobs: string[];
    lastRun: { [key: string]: Date | null };
    nextRun: { [key: string]: Date | null };
  }> {
    const activeJobs = this.getActiveJobs();
    
    // In a production system, you'd store this information in the database
    // For now, we'll return basic information
    const lastRun: { [key: string]: Date | null } = {};
    const nextRun: { [key: string]: Date | null } = {};

    for (const jobName of activeJobs) {
      lastRun[jobName] = null; // Would be retrieved from database
      nextRun[jobName] = null; // Would be calculated from cron expression
    }

    return {
      activeJobs,
      lastRun,
      nextRun
    };
  }

  async createCustomSchedule(
    name: string,
    cronExpression: string,
    searchTerms: string[],
    dateRangeHours: number = 24
  ): Promise<void> {
    try {
      this.scheduleJob(name, cronExpression, async () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setHours(startDate.getHours() - dateRangeHours);

        const articles = await this.scrapingService.scrapeArticles(
          searchTerms,
          {
            from: startDate,
            to: endDate
          }
        );

        logger.info(`Custom schedule ${name} completed: ${articles.length} articles found`);
        
        // Trigger analysis for new articles
        await this.analyzeNewArticles(articles.map(a => a.id));
      });

      logger.info(`Created custom schedule: ${name}`);
    } catch (error) {
      logger.error(`Failed to create custom schedule ${name}:`, error);
      throw error;
    }
  }
}