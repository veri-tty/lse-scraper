import { pool } from '../config/database';
import { logger } from '../config/logger';
import { 
  SearchQuery, 
  SearchResult, 
  ArticleSummary, 
  SearchFacets,
  SearchHistoryEntry 
} from '../types';

export class SearchService {
  async searchArticles(query: SearchQuery, userId?: string): Promise<SearchResult> {
    try {
      const startTime = Date.now();
      
      // Build the main search query
      const { sql, params } = this.buildSearchQuery(query);
      
      // Execute search
      const result = await pool.query(sql, params);
      
      // Get total count for pagination
      const countQuery = this.buildCountQuery(query);
      const countResult = await pool.query(countQuery.sql, countQuery.params);
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Format results
      const articles = result.rows.map(row => this.formatArticleSummary(row));
      
      // Get search facets
      const facets = await this.getSearchFacets(query);
      
      // Save search history if user is provided
      if (userId) {
        await this.saveSearchHistory(userId, query, totalCount);
      }
      
      const searchTime = Date.now() - startTime;
      logger.info(`Search completed in ${searchTime}ms, found ${totalCount} results`);
      
      return {
        articles,
        totalCount,
        facets
      };

    } catch (error) {
      logger.error('Search failed:', error);
      throw error;
    }
  }

  private buildSearchQuery(query: SearchQuery): { sql: string; params: any[] } {
    let sql = `
      SELECT DISTINCT
        a.id,
        a.title,
        a.url,
        a.publish_date,
        a.company,
        aa.summary,
        aa.keywords_found,
        COUNT(ap.id) as pdf_count,
        ts_rank(
          to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
          plainto_tsquery('english', $1)
        ) as relevance_score
      FROM articles a
      LEFT JOIN article_analyses aa ON a.id = aa.article_id
      LEFT JOIN article_pdfs ap ON a.id = ap.article_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    // Full-text search
    if (query.keywords && query.keywords.length > 0) {
      const searchText = query.keywords.join(' ');
      params.push(searchText);
      
      sql += ` AND (
        to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')) 
        @@ plainto_tsquery('english', $${paramIndex})
      )`;
      paramIndex++;
    } else {
      params.push(''); // Placeholder for relevance score calculation
    }

    // Date range filter
    if (query.dateRange) {
      sql += ` AND a.publish_date >= $${paramIndex}`;
      params.push(query.dateRange.from);
      paramIndex++;
      
      sql += ` AND a.publish_date <= $${paramIndex}`;
      params.push(query.dateRange.to);
      paramIndex++;
    }

    // Company filter
    if (query.companies && query.companies.length > 0) {
      sql += ` AND a.company = ANY($${paramIndex})`;
      params.push(query.companies);
      paramIndex++;
    }

    // Keyword matches filter
    if (query.hasKeywordMatches) {
      sql += ` AND aa.keywords_found IS NOT NULL AND jsonb_array_length(aa.keywords_found) > 0`;
    }

    // Group by and order
    sql += `
      GROUP BY a.id, a.title, a.url, a.publish_date, a.company, aa.summary, aa.keywords_found
      ORDER BY 
        CASE WHEN $1 != '' THEN relevance_score ELSE 0 END DESC,
        a.publish_date DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(query.limit || 20);
    params.push(query.offset || 0);

    return { sql, params };
  }

  private buildCountQuery(query: SearchQuery): { sql: string; params: any[] } {
    let sql = `
      SELECT COUNT(DISTINCT a.id) as count
      FROM articles a
      LEFT JOIN article_analyses aa ON a.id = aa.article_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    // Full-text search
    if (query.keywords && query.keywords.length > 0) {
      const searchText = query.keywords.join(' ');
      params.push(searchText);
      
      sql += ` AND (
        to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')) 
        @@ plainto_tsquery('english', $${paramIndex})
      )`;
      paramIndex++;
    }

    // Date range filter
    if (query.dateRange) {
      sql += ` AND a.publish_date >= $${paramIndex}`;
      params.push(query.dateRange.from);
      paramIndex++;
      
      sql += ` AND a.publish_date <= $${paramIndex}`;
      params.push(query.dateRange.to);
      paramIndex++;
    }

    // Company filter
    if (query.companies && query.companies.length > 0) {
      sql += ` AND a.company = ANY($${paramIndex})`;
      params.push(query.companies);
      paramIndex++;
    }

    // Keyword matches filter
    if (query.hasKeywordMatches) {
      sql += ` AND aa.keywords_found IS NOT NULL AND jsonb_array_length(aa.keywords_found) > 0`;
    }

    return { sql, params };
  }

  private formatArticleSummary(row: any): ArticleSummary {
    const keywordsFound = row.keywords_found 
      ? (row.keywords_found as any[]).map(kw => kw.keyword)
      : [];

    return {
      id: row.id,
      title: row.title,
      url: row.url,
      publishDate: row.publish_date,
      company: row.company,
      summary: row.summary,
      keywordsFound,
      pdfCount: parseInt(row.pdf_count) || 0
    };
  }

  private async getSearchFacets(query: SearchQuery): Promise<SearchFacets> {
    try {
      // Get company facets
      const companiesQuery = `
        SELECT company, COUNT(*) as count
        FROM articles a
        LEFT JOIN article_analyses aa ON a.id = aa.article_id
        WHERE company IS NOT NULL AND company != ''
        ${this.buildFacetFilters(query)}
        GROUP BY company
        ORDER BY count DESC
        LIMIT 20
      `;

      const companiesResult = await pool.query(companiesQuery);
      const companies = companiesResult.rows.map(row => ({
        name: row.company,
        count: parseInt(row.count)
      }));

      // Get keyword facets
      const keywordsQuery = `
        SELECT 
          jsonb_array_elements(aa.keywords_found)->>'keyword' as keyword,
          COUNT(*) as count
        FROM article_analyses aa
        JOIN articles a ON a.id = aa.article_id
        WHERE aa.keywords_found IS NOT NULL
        ${this.buildFacetFilters(query)}
        GROUP BY keyword
        ORDER BY count DESC
        LIMIT 20
      `;

      const keywordsResult = await pool.query(keywordsQuery);
      const keywords = keywordsResult.rows.map(row => ({
        keyword: row.keyword,
        count: parseInt(row.count)
      }));

      // Get date range facets
      const dateRanges = [
        { range: 'Last 7 days', count: 0 },
        { range: 'Last 30 days', count: 0 },
        { range: 'Last 3 months', count: 0 },
        { range: 'Last year', count: 0 }
      ];

      // Calculate date range counts
      const dateRangeQueries = [
        "SELECT COUNT(*) FROM articles WHERE publish_date >= NOW() - INTERVAL '7 days'",
        "SELECT COUNT(*) FROM articles WHERE publish_date >= NOW() - INTERVAL '30 days'",
        "SELECT COUNT(*) FROM articles WHERE publish_date >= NOW() - INTERVAL '3 months'",
        "SELECT COUNT(*) FROM articles WHERE publish_date >= NOW() - INTERVAL '1 year'"
      ];

      for (let i = 0; i < dateRangeQueries.length; i++) {
        const result = await pool.query(dateRangeQueries[i]);
        dateRanges[i].count = parseInt(result.rows[0].count);
      }

      return {
        companies,
        keywords,
        dateRanges
      };

    } catch (error) {
      logger.error('Failed to get search facets:', error);
      return {
        companies: [],
        keywords: [],
        dateRanges: []
      };
    }
  }

  private buildFacetFilters(query: SearchQuery): string {
    let filters = '';

    if (query.dateRange) {
      filters += ` AND a.publish_date >= '${query.dateRange.from.toISOString()}'`;
      filters += ` AND a.publish_date <= '${query.dateRange.to.toISOString()}'`;
    }

    if (query.keywords && query.keywords.length > 0) {
      const searchText = query.keywords.join(' ');
      filters += ` AND (
        to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')) 
        @@ plainto_tsquery('english', '${searchText}')
      )`;
    }

    return filters;
  }

  async getArticleById(articleId: string): Promise<any> {
    try {
      const query = `
        SELECT 
          a.*,
          aa.summary,
          aa.keywords_found,
          aa.confidence,
          aa.analyzed_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ap.id,
                'filename', ap.filename,
                'filePath', ap.file_path,
                'fileSize', ap.file_size
              )
            ) FILTER (WHERE ap.id IS NOT NULL),
            '[]'
          ) as pdfs
        FROM articles a
        LEFT JOIN article_analyses aa ON a.id = aa.article_id
        LEFT JOIN article_pdfs ap ON a.id = ap.article_id
        WHERE a.id = $1
        GROUP BY a.id, aa.summary, aa.keywords_found, aa.confidence, aa.analyzed_at
      `;

      const result = await pool.query(query, [articleId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      logger.error('Failed to get article by ID:', error);
      throw error;
    }
  }

  private async saveSearchHistory(
    userId: string, 
    query: SearchQuery, 
    resultsCount: number
  ): Promise<void> {
    try {
      const insertQuery = `
        INSERT INTO search_history (user_id, query, results_count)
        VALUES ($1, $2, $3)
      `;

      await pool.query(insertQuery, [
        userId,
        JSON.stringify(query),
        resultsCount
      ]);

    } catch (error) {
      logger.warn('Failed to save search history:', error);
      // Don't throw error as this is not critical
    }
  }

  async getUserSearchHistory(userId: string, limit: number = 50): Promise<SearchHistoryEntry[]> {
    try {
      const query = `
        SELECT id, user_id, query, results_count, searched_at
        FROM search_history
        WHERE user_id = $1
        ORDER BY searched_at DESC
        LIMIT $2
      `;

      const result = await pool.query(query, [userId, limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        query: row.query,
        resultsCount: row.results_count,
        searchedAt: row.searched_at
      }));

    } catch (error) {
      logger.error('Failed to get user search history:', error);
      throw error;
    }
  }

  async getPopularSearchTerms(limit: number = 20): Promise<Array<{ term: string; count: number }>> {
    try {
      const query = `
        SELECT 
          jsonb_array_elements_text(query->'keywords') as term,
          COUNT(*) as count
        FROM search_history
        WHERE query->'keywords' IS NOT NULL
          AND searched_at >= NOW() - INTERVAL '30 days'
        GROUP BY term
        ORDER BY count DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);
      
      return result.rows.map(row => ({
        term: row.term,
        count: parseInt(row.count)
      }));

    } catch (error) {
      logger.error('Failed to get popular search terms:', error);
      return [];
    }
  }

  async getSearchStats(): Promise<{
    totalArticles: number;
    analyzedArticles: number;
    totalSearches: number;
    uniqueUsers: number;
  }> {
    try {
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM articles) as total_articles,
          (SELECT COUNT(*) FROM article_analyses) as analyzed_articles,
          (SELECT COUNT(*) FROM search_history) as total_searches,
          (SELECT COUNT(DISTINCT user_id) FROM search_history) as unique_users
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      return {
        totalArticles: parseInt(stats.total_articles),
        analyzedArticles: parseInt(stats.analyzed_articles),
        totalSearches: parseInt(stats.total_searches),
        uniqueUsers: parseInt(stats.unique_users)
      };

    } catch (error) {
      logger.error('Failed to get search stats:', error);
      return {
        totalArticles: 0,
        analyzedArticles: 0,
        totalSearches: 0,
        uniqueUsers: 0
      };
    }
  }
}