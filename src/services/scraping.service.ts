import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { ScrapingJob, ScrapedArticle, DateRange } from '../types';

export class LSEScrapingService {
  private browser: Browser | null = null;
  private readonly baseUrl = 'https://www.londonstockexchange.com';
  private readonly newsUrl = 'https://www.londonstockexchange.com/news-article';
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 seconds
  private readonly requestDelay = 1000; // 1 second between requests

  async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      logger.info('Browser initialized for scraping');
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  async createScrapingJob(searchTerms: string[], dateRange: DateRange): Promise<string> {
    try {
      const query = `
        INSERT INTO scraping_jobs (search_terms, date_range, status)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      
      const result = await pool.query(query, [
        JSON.stringify(searchTerms),
        JSON.stringify(dateRange),
        'pending'
      ]);

      const jobId = result.rows[0].id;
      logger.info(`Created scraping job: ${jobId}`);
      return jobId;
    } catch (error) {
      logger.error('Failed to create scraping job:', error);
      throw error;
    }
  }

  async updateScrapingJobStatus(
    jobId: string, 
    status: 'running' | 'completed' | 'failed',
    articlesFound?: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const query = `
        UPDATE scraping_jobs 
        SET status = $1, articles_found = $2, error_message = $3, completed_at = $4
        WHERE id = $5
      `;
      
      await pool.query(query, [
        status,
        articlesFound || 0,
        errorMessage || null,
        status === 'completed' || status === 'failed' ? new Date() : null,
        jobId
      ]);

      logger.info(`Updated scraping job ${jobId} status to ${status}`);
    } catch (error) {
      logger.error('Failed to update scraping job status:', error);
      throw error;
    }
  }

  async scrapeArticles(
    searchTerms: string[], 
    dateRange: DateRange,
    jobId?: string
  ): Promise<ScrapedArticle[]> {
    let currentJobId = jobId;
    
    if (!currentJobId) {
      currentJobId = await this.createScrapingJob(searchTerms, dateRange);
    }

    try {
      await this.updateScrapingJobStatus(currentJobId, 'running');
      await this.initializeBrowser();

      const articles: ScrapedArticle[] = [];
      
      // Build search URL with parameters
      const searchUrl = this.buildSearchUrl(searchTerms, dateRange);
      logger.info(`Starting scrape with URL: ${searchUrl}`);

      const page = await this.browser!.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // Navigate to search results
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Get article links from search results
      const articleLinks = await this.extractArticleLinks(page);
      logger.info(`Found ${articleLinks.length} articles to scrape`);

      // Scrape each article
      for (let i = 0; i < articleLinks.length; i++) {
        try {
          await this.delay(this.requestDelay);
          const article = await this.scrapeArticle(page, articleLinks[i]);
          
          if (article) {
            const savedArticle = await this.saveArticle(article);
            articles.push(savedArticle);
            logger.info(`Scraped article ${i + 1}/${articleLinks.length}: ${article.title}`);
          }
        } catch (error) {
          logger.warn(`Failed to scrape article ${articleLinks[i]}:`, error);
          continue; // Continue with next article
        }
      }

      await page.close();
      await this.updateScrapingJobStatus(currentJobId, 'completed', articles.length);
      
      logger.info(`Scraping completed. Found ${articles.length} articles`);
      return articles;

    } catch (error) {
      logger.error('Scraping failed:', error);
      await this.updateScrapingJobStatus(currentJobId, 'failed', 0, error.message);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  private buildSearchUrl(searchTerms: string[], dateRange: DateRange): string {
    const params = new URLSearchParams();
    
    if (searchTerms.length > 0) {
      params.append('q', searchTerms.join(' '));
    }
    
    // Format dates for LSE API
    const fromDate = dateRange.from.toISOString().split('T')[0];
    const toDate = dateRange.to.toISOString().split('T')[0];
    
    params.append('from', fromDate);
    params.append('to', toDate);
    params.append('size', '50'); // Max results per page
    
    return `${this.newsUrl}?${params.toString()}`;
  }

  private async extractArticleLinks(page: Page): Promise<string[]> {
    try {
      // Wait for content to load
      await page.waitForSelector('.news-article-item, .article-link, a[href*="/news-article/"]', { timeout: 10000 });
      
      const links = await page.evaluate(() => {
        const linkElements = document.querySelectorAll('a[href*="/news-article/"]');
        return Array.from(linkElements)
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => href && !href.includes('#'))
          .slice(0, 50); // Limit to 50 articles per scrape
      });

      return [...new Set(links)]; // Remove duplicates
    } catch (error) {
      logger.warn('Failed to extract article links, trying alternative selectors:', error);
      
      // Fallback: try to get any links that look like news articles
      const fallbackLinks = await page.evaluate(() => {
        const allLinks = document.querySelectorAll('a[href]');
        return Array.from(allLinks)
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => 
            href.includes('news') || 
            href.includes('article') || 
            href.includes('announcement')
          )
          .slice(0, 20);
      });

      return [...new Set(fallbackLinks)];
    }
  }

  private async scrapeArticle(page: Page, articleUrl: string): Promise<ScrapedArticle | null> {
    try {
      await page.goto(articleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Extract article content
      const articleData = await page.evaluate(() => {
        const title = document.querySelector('h1, .article-title, .news-title')?.textContent?.trim() || '';
        const content = document.querySelector('.article-content, .news-content, .content, main')?.textContent?.trim() || '';
        const publishDateElement = document.querySelector('[datetime], .date, .publish-date, time');
        
        let publishDate = '';
        if (publishDateElement) {
          publishDate = publishDateElement.getAttribute('datetime') || 
                      publishDateElement.textContent?.trim() || '';
        }

        // Extract company name from title or content
        const company = title.match(/([A-Z][a-z]+ [A-Z][a-z]+|[A-Z]{2,})/)?.[0] || '';
        
        // Find PDF links
        const pdfLinks = Array.from(document.querySelectorAll('a[href$=".pdf"]'))
          .map(link => (link as HTMLAnchorElement).href);

        return {
          title,
          content,
          publishDate,
          company,
          pdfLinks,
          rawHtml: document.documentElement.outerHTML
        };
      });

      if (!articleData.title || !articleData.content) {
        logger.warn(`Article has missing title or content: ${articleUrl}`);
        return null;
      }

      // Parse publish date
      let publishDate = new Date();
      if (articleData.publishDate) {
        const parsed = new Date(articleData.publishDate);
        if (!isNaN(parsed.getTime())) {
          publishDate = parsed;
        }
      }

      const article: ScrapedArticle = {
        id: '', // Will be set when saved to database
        title: articleData.title,
        url: articleUrl,
        content: articleData.content,
        publishDate,
        company: articleData.company || undefined,
        pdfUrls: articleData.pdfLinks,
        rawHtml: articleData.rawHtml,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return article;

    } catch (error) {
      logger.error(`Failed to scrape article ${articleUrl}:`, error);
      return null;
    }
  }

  private async saveArticle(article: ScrapedArticle): Promise<ScrapedArticle> {
    try {
      const query = `
        INSERT INTO articles (title, url, content, publish_date, company, raw_html)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (url) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          publish_date = EXCLUDED.publish_date,
          company = EXCLUDED.company,
          raw_html = EXCLUDED.raw_html,
          updated_at = NOW()
        RETURNING id, created_at, updated_at
      `;

      const result = await pool.query(query, [
        article.title,
        article.url,
        article.content,
        article.publishDate,
        article.company,
        article.rawHtml
      ]);

      const savedData = result.rows[0];
      
      // Save PDFs if any
      if (article.pdfUrls.length > 0) {
        await this.savePDFReferences(savedData.id, article.pdfUrls);
      }

      return {
        ...article,
        id: savedData.id,
        createdAt: savedData.created_at,
        updatedAt: savedData.updated_at
      };

    } catch (error) {
      logger.error('Failed to save article:', error);
      throw error;
    }
  }

  private async savePDFReferences(articleId: string, pdfUrls: string[]): Promise<void> {
    for (const pdfUrl of pdfUrls) {
      try {
        const filename = path.basename(pdfUrl);
        const query = `
          INSERT INTO article_pdfs (article_id, filename, file_path, file_size)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `;
        
        await pool.query(query, [articleId, filename, pdfUrl, 0]);
      } catch (error) {
        logger.warn(`Failed to save PDF reference ${pdfUrl}:`, error);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getScrapingJobs(limit: number = 50): Promise<ScrapingJob[]> {
    try {
      const query = `
        SELECT id, search_terms, date_range, status, articles_found, error_message, created_at, completed_at
        FROM scraping_jobs
        ORDER BY created_at DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        searchTerms: row.search_terms,
        dateRange: row.date_range,
        status: row.status,
        articlesFound: row.articles_found,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        completedAt: row.completed_at
      }));

    } catch (error) {
      logger.error('Failed to get scraping jobs:', error);
      throw error;
    }
  }
}