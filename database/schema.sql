-- LSE News Scraper Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    openrouter_api_key_encrypted TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    url VARCHAR(500) UNIQUE NOT NULL,
    content TEXT,
    publish_date TIMESTAMP,
    company VARCHAR(255),
    raw_html TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Article analysis results
CREATE TABLE article_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    keywords_found JSONB,
    summary TEXT,
    confidence DECIMAL(3,2),
    processing_time INTEGER,
    analyzed_at TIMESTAMP DEFAULT NOW()
);

-- PDF attachments
CREATE TABLE article_pdfs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    extracted_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Scraping jobs
CREATE TABLE scraping_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    search_terms JSONB,
    date_range JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    articles_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- User search history
CREATE TABLE search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    query JSONB NOT NULL,
    results_count INTEGER DEFAULT 0,
    searched_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_articles_publish_date ON articles(publish_date);
CREATE INDEX idx_articles_company ON articles(company);
CREATE INDEX idx_articles_created_at ON articles(created_at);
CREATE INDEX idx_article_analyses_article_id ON article_analyses(article_id);
CREATE INDEX idx_article_pdfs_article_id ON article_pdfs(article_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_created_at ON scraping_jobs(created_at);
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_searched_at ON search_history(searched_at);

-- Full-text search indexes
CREATE INDEX idx_articles_content_fts ON articles USING gin(to_tsvector('english', content));
CREATE INDEX idx_articles_title_fts ON articles USING gin(to_tsvector('english', title));
CREATE INDEX idx_pdf_text_fts ON article_pdfs USING gin(to_tsvector('english', extracted_text));

-- Composite indexes for common queries
CREATE INDEX idx_articles_date_company ON articles(publish_date, company);
CREATE INDEX idx_articles_content_date ON articles(publish_date) WHERE content IS NOT NULL;

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();