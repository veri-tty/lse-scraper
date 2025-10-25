import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import {
  AnalysisResult,
  KeywordMatch,
  OpenRouterResponse
} from '../types';

export class OpenRouterService {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly defaultModel = 'google/gemini-flash-1.5';
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000;

  private readonly defaultKeywords = [
    'acquisition',
    'merger',
    'takeover',
    'buyout',
    'joint venture',
    'partnership',
    'strategic alliance',
    'consolidation',
    'divestiture',
    'spin-off'
  ];

  async analyzeArticle(
    articleId: string,
    content: string,
    pdfTexts: string[] = [],
    userApiKey: string,
    targetKeywords?: string[]
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    try {
      const keywords = targetKeywords || this.defaultKeywords;
      const fullContent = [content, ...pdfTexts].join('\n\n');
      
      // Check if analysis already exists
      const existingAnalysis = await this.getExistingAnalysis(articleId);
      if (existingAnalysis) {
        logger.info(`Using existing analysis for article ${articleId}`);
        return existingAnalysis;
      }

      const analysisPrompt = this.buildAnalysisPrompt(fullContent, keywords);
      const response = await this.callOpenRouter(analysisPrompt, userApiKey);
      
      const analysisResult = this.parseAnalysisResponse(response, keywords);
      const processingTime = Date.now() - startTime;

      const result: AnalysisResult = {
        articleId,
        keywordsFound: analysisResult.keywordsFound,
        summary: analysisResult.summary,
        confidence: analysisResult.confidence,
        processingTime,
        analyzedAt: new Date()
      };

      // Save analysis to database
      await this.saveAnalysis(result);
      
      logger.info(`Analysis completed for article ${articleId} in ${processingTime}ms`);
      return result;

    } catch (error) {
      logger.error(`Analysis failed for article ${articleId}:`, error);
      throw error;
    }
  }

  private buildAnalysisPrompt(content: string, keywords: string[]): string {
    return `
You are a financial news analyst. Analyze the following article content and provide a structured response.

KEYWORDS TO SEARCH FOR: ${keywords.join(', ')}

ARTICLE CONTENT:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

Please provide your analysis in the following JSON format:
{
  "keywordsFound": [
    {
      "keyword": "keyword_name",
      "occurrences": number_of_times_found,
      "context": ["sentence containing keyword 1", "sentence containing keyword 2"],
      "relevanceScore": score_from_0_to_1
    }
  ],
  "summary": "A concise 2-3 sentence summary of the article focusing on business implications",
  "confidence": confidence_score_from_0_to_1
}

Rules:
1. Only include keywords that are actually found in the content
2. Context should be the actual sentences containing the keywords
3. Relevance score should reflect how important the keyword is to the article's main topic
4. Confidence should reflect how certain you are about the analysis
5. Summary should focus on business/financial implications
6. Return valid JSON only, no additional text
`;
  }

  private async callOpenRouter(
    prompt: string, 
    apiKey: string,
    retryCount: number = 0
  ): Promise<string> {
    try {
      const response: AxiosResponse<OpenRouterResponse> = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.defaultModel,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1500,
          temperature: 0.3,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lse-news-scraper.com',
            'X-Title': 'LSE News Scraper'
          },
          timeout: 30000
        }
      );

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error('No response from OpenRouter API');
      }

      return response.data.choices[0].message.content;

    } catch (error: any) {
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        logger.warn(`OpenRouter API call failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
        await this.delay(this.retryDelay * Math.pow(2, retryCount));
        return this.callOpenRouter(prompt, apiKey, retryCount + 1);
      }

      if (error.response?.status === 401) {
        throw new Error('Invalid OpenRouter API key');
      } else if (error.response?.status === 429) {
        throw new Error('OpenRouter API rate limit exceeded');
      } else if (error.response?.status === 402) {
        throw new Error('OpenRouter API quota exceeded');
      }

      logger.error('OpenRouter API call failed:', error);
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
  }

  private parseAnalysisResponse(response: string, targetKeywords: string[]): {
    keywordsFound: KeywordMatch[];
    summary: string;
    confidence: number;
  } {
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and sanitize the response
      const keywordsFound: KeywordMatch[] = (parsed.keywordsFound || [])
        .filter((kw: any) => kw.keyword && kw.occurrences > 0)
        .map((kw: any) => ({
          keyword: kw.keyword.toLowerCase(),
          occurrences: Math.max(1, parseInt(kw.occurrences) || 1),
          context: Array.isArray(kw.context) ? kw.context.slice(0, 3) : [],
          relevanceScore: Math.min(1, Math.max(0, parseFloat(kw.relevanceScore) || 0.5))
        }));

      const summary = typeof parsed.summary === 'string' 
        ? parsed.summary.substring(0, 500) 
        : 'Summary not available';

      const confidence = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5));

      return {
        keywordsFound,
        summary,
        confidence
      };

    } catch (error) {
      logger.warn('Failed to parse AI response, using fallback analysis:', error);
      
      // Fallback: simple keyword matching
      const keywordsFound = this.performFallbackAnalysis(response, targetKeywords);
      
      return {
        keywordsFound,
        summary: 'AI analysis failed, using basic keyword detection',
        confidence: 0.3
      };
    }
  }

  private performFallbackAnalysis(content: string, keywords: string[]): KeywordMatch[] {
    const found: KeywordMatch[] = [];
    const lowerContent = content.toLowerCase();
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      
      if (matches && matches.length > 0) {
        // Extract context sentences
        const sentences = content.split(/[.!?]+/);
        const context = sentences
          .filter(sentence => sentence.toLowerCase().includes(keyword.toLowerCase()))
          .slice(0, 2)
          .map(s => s.trim());

        found.push({
          keyword: keyword.toLowerCase(),
          occurrences: matches.length,
          context,
          relevanceScore: 0.5
        });
      }
    }

    return found;
  }

  private shouldRetry(error: any): boolean {
    if (!error.response) return true; // Network error
    
    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limiting
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getExistingAnalysis(articleId: string): Promise<AnalysisResult | null> {
    try {
      const query = `
        SELECT article_id, keywords_found, summary, confidence, processing_time, analyzed_at
        FROM article_analyses
        WHERE article_id = $1
        ORDER BY analyzed_at DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [articleId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        articleId: row.article_id,
        keywordsFound: row.keywords_found || [],
        summary: row.summary || '',
        confidence: parseFloat(row.confidence) || 0,
        processingTime: row.processing_time || 0,
        analyzedAt: row.analyzed_at
      };

    } catch (error) {
      logger.error('Failed to get existing analysis:', error);
      return null;
    }
  }

  private async saveAnalysis(analysis: AnalysisResult): Promise<void> {
    try {
      const query = `
        INSERT INTO article_analyses (
          article_id, keywords_found, summary, confidence, processing_time, analyzed_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (article_id) DO UPDATE SET
          keywords_found = EXCLUDED.keywords_found,
          summary = EXCLUDED.summary,
          confidence = EXCLUDED.confidence,
          processing_time = EXCLUDED.processing_time,
          analyzed_at = EXCLUDED.analyzed_at
      `;

      await pool.query(query, [
        analysis.articleId,
        JSON.stringify(analysis.keywordsFound),
        analysis.summary,
        analysis.confidence,
        analysis.processingTime,
        analysis.analyzedAt
      ]);

      logger.info(`Saved analysis for article ${analysis.articleId}`);

    } catch (error) {
      logger.error('Failed to save analysis:', error);
      throw error;
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.status === 200;

    } catch (error: any) {
      if (error.response?.status === 401) {
        return false;
      }
      
      logger.warn('API key validation failed:', error.message);
      return false;
    }
  }

  async encryptApiKey(apiKey: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const secretKey = process.env.ENCRYPTION_KEY || 'fallback-key-32-characters-long!';

    // Ensure key is exactly 32 bytes for AES-256
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag for GCM mode
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  async decryptApiKey(encryptedKey: string): Promise<string> {
    try {
      const algorithm = 'aes-256-gcm';
      const secretKey = process.env.ENCRYPTION_KEY || 'fallback-key-32-characters-long!';

      // Ensure key is exactly 32 bytes for AES-256
      const key = crypto.createHash('sha256').update(secretKey).digest();

      const parts = encryptedKey.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt API key:', error);
      throw new Error('Invalid encrypted API key');
    }
  }

  async updateUserApiKey(userId: string, apiKey: string): Promise<void> {
    try {
      // Validate the API key first
      const isValid = await this.validateApiKey(apiKey);
      if (!isValid) {
        throw new Error('Invalid OpenRouter API key');
      }

      // Encrypt and save the API key
      const encryptedKey = await this.encryptApiKey(apiKey);
      
      const query = `
        UPDATE users 
        SET openrouter_api_key_encrypted = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await pool.query(query, [encryptedKey, userId]);
      
      logger.info(`Updated API key for user ${userId}`);

    } catch (error) {
      logger.error('Failed to update user API key:', error);
      throw error;
    }
  }

  async getUserApiKey(userId: string): Promise<string | null> {
    try {
      const query = `
        SELECT openrouter_api_key_encrypted
        FROM users
        WHERE id = $1 AND is_active = true
      `;

      const result = await pool.query(query, [userId]);
      
      if (result.rows.length === 0 || !result.rows[0].openrouter_api_key_encrypted) {
        return null;
      }

      return await this.decryptApiKey(result.rows[0].openrouter_api_key_encrypted);

    } catch (error) {
      logger.error('Failed to get user API key:', error);
      return null;
    }
  }
}