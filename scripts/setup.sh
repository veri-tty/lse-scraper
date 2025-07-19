#!/bin/bash

# LSE News Scraper Setup Script

set -e

echo "🚀 Setting up LSE News Scraper..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL 14+ first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before starting the server."
fi

# Create database if it doesn't exist
echo "🗄️  Setting up database..."
DB_NAME=${DB_NAME:-lse_news_scraper}
if ! psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    createdb $DB_NAME
    echo "✅ Database '$DB_NAME' created."
else
    echo "ℹ️  Database '$DB_NAME' already exists."
fi

# Build the application
echo "🔨 Building application..."
npm run build

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Set up your OpenRouter API key"
echo "3. Run 'npm run dev' to start development server"
echo "4. Create an admin user: node scripts/admin.js create-admin admin@example.com password123"
echo ""
echo "🌐 The server will be available at http://localhost:3000"