#!/usr/bin/env node

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lse_news_scraper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function createAdminUser(email, password) {
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    
    const query = `
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active
      RETURNING id, email, role
    `;
    
    const result = await pool.query(query, [email, passwordHash, 'admin', true]);
    
    console.log('Admin user created/updated successfully:');
    console.log(result.rows[0]);
  } catch (error) {
    console.error('Failed to create admin user:', error.message);
  } finally {
    await pool.end();
  }
}

async function listUsers() {
  try {
    const query = `
      SELECT id, email, role, is_active, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    console.log('Users:');
    console.table(result.rows);
  } catch (error) {
    console.error('Failed to list users:', error.message);
  } finally {
    await pool.end();
  }
}

async function getStats() {
  try {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM articles) as total_articles,
        (SELECT COUNT(*) FROM article_analyses) as analyzed_articles,
        (SELECT COUNT(*) FROM scraping_jobs) as scraping_jobs,
        (SELECT COUNT(*) FROM search_history) as total_searches
    `;
    
    const result = await pool.query(query);
    
    console.log('Platform Statistics:');
    console.table(result.rows[0]);
  } catch (error) {
    console.error('Failed to get stats:', error.message);
  } finally {
    await pool.end();
  }
}

// Command line interface
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'create-admin':
    if (args.length < 2) {
      console.log('Usage: node scripts/admin.js create-admin <email> <password>');
      process.exit(1);
    }
    createAdminUser(args[0], args[1]);
    break;
    
  case 'list-users':
    listUsers();
    break;
    
  case 'stats':
    getStats();
    break;
    
  default:
    console.log('Available commands:');
    console.log('  create-admin <email> <password> - Create or update admin user');
    console.log('  list-users                      - List all users');
    console.log('  stats                          - Show platform statistics');
    process.exit(1);
}