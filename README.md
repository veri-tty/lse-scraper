# LSE News Scraper

A comprehensive web scraping and analysis platform for London Stock Exchange (LSE) news articles. The system automatically scrapes news articles from the LSE website, analyzes them using AI for specific keywords like "acquisition" and "merger", and provides a web-based interface for users to search and review the analyzed content.

## Features

- **Automated Web Scraping**: Scrapes LSE news articles with configurable search terms and date ranges
- **AI-Powered Analysis**: Uses OpenRouter/Gemini Flash to analyze articles for financial keywords and generate summaries
- **Advanced Search**: Full-text search with faceted filtering by company, keywords, and date ranges
- **User Management**: Role-based access control with admin and user roles
- **Scheduled Jobs**: Automated daily and weekly scraping with configurable schedules
- **PDF Processing**: Downloads and processes PDF attachments from articles
- **API Key Management**: Secure encrypted storage of OpenRouter API keys
- **Search History**: Tracks user search patterns and popular terms
- **Admin Dashboard**: User management and system monitoring capabilities

## Tech Stack

- **Backend**: Node.js with TypeScript, Express.js
- **Database**: PostgreSQL with full-text search capabilities
- **Web Scraping**: Puppeteer for dynamic content, Cheerio for HTML parsing
- **AI Integration**: OpenRouter API with Gemini Flash model
- **Authentication**: JWT tokens with bcrypt password hashing
- **Scheduling**: node-cron for automated tasks
- **Logging**: Winston for structured logging
- **PDF Processing**: pdf-parse for text extraction

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- OpenRouter API key (for AI analysis)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lse-news-scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database Configuration
   DATABASE_URL=postgresql://username:password@localhost:5432/lse_news_scraper
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=lse_news_scraper
   DB_USER=username
   DB_PASSWORD=password

   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRES_IN=24h

   # Encryption Key for API Keys
   ENCRYPTION_KEY=your-32-character-encryption-key

   # OpenRouter Configuration
   OPENROUTER_API_KEY=your-openrouter-api-key
   ```

4. **Set up PostgreSQL database**
   ```bash
   createdb lse_news_scraper
   ```

5. **Run database migrations**
   The application will automatically run migrations on startup.

## Usage

### Development

```bash
npm run dev
```

The server will start on `http://localhost:3000` with hot reload enabled.

### Production

```bash
npm run build
npm start
```

### Testing

```bash
npm test
npm run test:watch
```

### Code Quality

```bash
npm run lint
npm run lint:fix
npm run format
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/api-key` - Update OpenRouter API key

### Scraping
- `POST /api/scraping/start` - Start scraping job
- `GET /api/scraping/jobs` - Get scraping job history

### Search
- `POST /api/search` - Search articles
- `GET /api/articles/:id` - Get article details
- `POST /api/articles/:id/analyze` - Analyze article with AI

### User Data
- `GET /api/user/search-history` - Get user search history
- `GET /api/stats` - Get platform statistics

### Admin (Admin role required)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/status` - Update user status
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/scheduler/status` - Get scheduler status
- `POST /api/admin/scheduler/custom` - Create custom schedule
- `DELETE /api/admin/scheduler/:name` - Stop scheduled job

## Database Schema

The application uses PostgreSQL with the following main tables:

- **users** - User accounts and authentication
- **articles** - Scraped news articles
- **article_analyses** - AI analysis results
- **article_pdfs** - PDF attachments
- **scraping_jobs** - Scraping job tracking
- **search_history** - User search patterns

Full-text search indexes are created on article content and titles for fast searching.

## Scheduled Jobs

The system runs several automated jobs:

- **Daily Scrape** (6 AM UTC): Scrapes articles from the previous day
- **Weekly Scrape** (Sunday 2 AM UTC): Comprehensive scrape of the past week
- **Hourly Analysis** (Every hour): Analyzes unprocessed articles

Custom schedules can be created through the admin API.

## AI Analysis

Articles are analyzed using OpenRouter's Gemini Flash model to:

- Detect financial keywords (acquisition, merger, takeover, etc.)
- Extract relevant context sentences
- Generate business-focused summaries
- Assign confidence scores

Users must provide their own OpenRouter API key for analysis features.

## Security Features

- JWT-based authentication with configurable expiration
- Bcrypt password hashing with high salt rounds
- Encrypted storage of API keys using AES-256
- Role-based access control
- Request rate limiting and input validation
- SQL injection prevention with parameterized queries

## Monitoring and Logging

- Structured logging with Winston
- Error tracking and performance monitoring
- Database query logging in development
- Health check endpoint for uptime monitoring

## Development

### Project Structure

```
src/
├── config/          # Database and logger configuration
├── database/        # Migrations and schema
├── services/        # Business logic services
├── types/          # TypeScript type definitions
└── server.ts       # Express server setup

database/
└── schema.sql      # Database schema definition
```

### Adding New Features

1. Define types in `src/types/index.ts`
2. Implement business logic in appropriate service
3. Add API endpoints in `src/server.ts`
4. Update database schema if needed
5. Add tests for new functionality

## Troubleshooting

### Common Issues

1. **Database connection fails**
   - Check PostgreSQL is running
   - Verify connection string in `.env`
   - Ensure database exists

2. **Scraping fails**
   - LSE website structure may have changed
   - Check browser launch arguments for your environment
   - Verify network connectivity

3. **AI analysis fails**
   - Check OpenRouter API key is valid
   - Verify API key is properly encrypted/decrypted
   - Check rate limits and quotas

### Logs

Application logs are stored in:
- `logs/error.log` - Error-level logs
- `logs/combined.log` - All logs
- Console output in development

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Create an issue with detailed information