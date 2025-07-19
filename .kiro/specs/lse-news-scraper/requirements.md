# Requirements Document

## Introduction

This feature involves building a comprehensive web scraping and analysis platform for London Stock Exchange (LSE) news articles. The system will automatically scrape news articles from the LSE website, analyze them using AI for specific keywords like "acquisition" and "merger", and provide a web-based interface for users to search and review the analyzed content. The platform will include user authentication, admin controls, and integration with AI services through OpenRouter.

## Requirements

### Requirement 1

**User Story:** As a financial analyst, I want to scrape LSE news articles automatically, so that I can monitor market activities without manual browsing.

#### Acceptance Criteria

1. WHEN the system runs a scrape operation THEN it SHALL fetch news articles from the LSE news explorer API
2. WHEN scraping articles THEN the system SHALL support filtering by date ranges (e.g., last month)
3. WHEN scraping articles THEN the system SHALL support filtering by free text search terms
4. WHEN an article contains PDF attachments THEN the system SHALL download and store the PDF files
5. WHEN scraping fails due to rate limiting THEN the system SHALL implement retry logic with exponential backoff

### Requirement 2

**User Story:** As a financial analyst, I want AI analysis of scraped articles and PDFs, so that I can quickly identify relevant content containing specific keywords.

#### Acceptance Criteria

1. WHEN an article is scraped THEN the system SHALL send the article text to AI analysis via OpenRouter
2. WHEN a PDF is downloaded THEN the system SHALL extract text and send it to AI analysis via OpenRouter
3. WHEN sending to AI THEN the system SHALL search for keywords including "acquisition", "merger", "takeover", "buyout", "joint venture"
4. WHEN AI analysis completes THEN the system SHALL return structured output with keyword matches and summary
5. WHEN AI analysis fails THEN the system SHALL log the error and mark the article for manual review

### Requirement 3

**User Story:** As a financial analyst, I want a web interface to search analyzed articles, so that I can quickly find relevant market intelligence.

#### Acceptance Criteria

1. WHEN accessing the web interface THEN the system SHALL display a search form with keyword, date range, and company filters
2. WHEN performing a search THEN the system SHALL return matching articles with AI-generated summaries
3. WHEN viewing search results THEN the system SHALL display article title, date, company, keywords found, and summary
4. WHEN clicking on an article THEN the system SHALL display the full article content and original LSE link
5. WHEN an article has PDF attachments THEN the system SHALL provide download links for the PDFs

### Requirement 4

**User Story:** As a system administrator, I want user account management capabilities, so that I can control access to the platform.

#### Acceptance Criteria

1. WHEN a new user registers THEN the system SHALL require email verification before account activation
2. WHEN an admin accesses the admin panel THEN the system SHALL display all user accounts with status and activity
3. WHEN an admin views user history THEN the system SHALL show search queries, articles viewed, and usage statistics
4. WHEN an admin disables a user account THEN the system SHALL prevent that user from logging in
5. WHEN managing users THEN the system SHALL support role assignment (admin, standard user)

### Requirement 5

**User Story:** As a platform user, I want secure authentication with API key management, so that I can safely access AI services.

#### Acceptance Criteria

1. WHEN a user logs in THEN the system SHALL authenticate using email and password
2. WHEN a user accesses AI features THEN the system SHALL require a valid OpenRouter API key
3. WHEN a user enters their API key THEN the system SHALL securely store it encrypted in the database
4. WHEN making AI requests THEN the system SHALL use the user's individual API key for billing transparency
5. IF a user's API key is invalid THEN the system SHALL display an error message and prevent AI operations

### Requirement 6

**User Story:** As a platform user, I want the system to handle LSE website structure changes gracefully, so that scraping continues to work reliably.

#### Acceptance Criteria

1. WHEN the LSE website structure changes THEN the system SHALL log parsing errors without crashing
2. WHEN scraping encounters unknown page formats THEN the system SHALL skip the article and continue processing
3. WHEN the system detects parsing failures THEN it SHALL notify administrators via email
4. WHEN scraping is successful THEN the system SHALL store raw HTML as backup for manual processing
5. WHEN articles fail to parse THEN the system SHALL provide a manual review interface for administrators

### Requirement 7

**User Story:** As a financial analyst, I want to schedule automated scraping runs, so that I can stay updated with the latest news without manual intervention.

#### Acceptance Criteria

1. WHEN setting up automated scraping THEN the system SHALL allow scheduling at hourly, daily, or weekly intervals
2. WHEN a scheduled scrape runs THEN the system SHALL process only new articles since the last run
3. WHEN new articles are found THEN the system SHALL automatically trigger AI analysis
4. WHEN scheduled scraping completes THEN the system SHALL send email notifications to subscribed users
5. IF scheduled scraping fails THEN the system SHALL retry up to 3 times before alerting administrators