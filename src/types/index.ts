export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  openRouterApiKey?: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

export interface AuthToken {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

export interface ScrapingJob {
  id: string;
  searchTerms: string[];
  dateRange: DateRange;
  status: 'pending' | 'running' | 'completed' | 'failed';
  articlesFound: number;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ScrapedArticle {
  id: string;
  title: string;
  url: string;
  content: string;
  publishDate: Date;
  company?: string;
  pdfUrls: string[];
  rawHtml: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisRequest {
  articleId: string;
  content: string;
  pdfTexts: string[];
  targetKeywords: string[];
}

export interface AnalysisResult {
  articleId: string;
  keywordsFound: KeywordMatch[];
  summary: string;
  confidence: number;
  processingTime: number;
  analyzedAt: Date;
}

export interface KeywordMatch {
  keyword: string;
  occurrences: number;
  context: string[];
  relevanceScore: number;
}

export interface SearchQuery {
  keywords?: string[];
  dateRange?: DateRange;
  companies?: string[];
  hasKeywordMatches?: boolean;
  limit: number;
  offset: number;
}

export interface SearchResult {
  articles: ArticleSummary[];
  totalCount: number;
  facets: SearchFacets;
}

export interface ArticleSummary {
  id: string;
  title: string;
  url: string;
  publishDate: Date;
  company?: string;
  summary?: string;
  keywordsFound: string[];
  pdfCount: number;
}

export interface SearchFacets {
  companies: Array<{ name: string; count: number }>;
  keywords: Array<{ keyword: string; count: number }>;
  dateRanges: Array<{ range: string; count: number }>;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ArticlePDF {
  id: string;
  articleId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  extractedText?: string;
  createdAt: Date;
}

export interface SearchHistoryEntry {
  id: string;
  userId: string;
  query: SearchQuery;
  resultsCount: number;
  searchedAt: Date;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIAnalysisConfig {
  targetKeywords: string[];
  maxTokens: number;
  temperature: number;
  model: string;
}