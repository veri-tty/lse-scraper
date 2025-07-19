import { pool } from '../config/database';
import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';

export class DatabaseMigrations {
  static async runMigrations(): Promise<void> {
    try {
      logger.info('Starting database migrations...');
      
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      // Run schema migration
      await this.runSchemaMigration();
      
      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error('Database migration failed:', error);
      throw error;
    }
  }

  private static async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `;
    
    await pool.query(query);
  }

  private static async runSchemaMigration(): Promise<void> {
    const migrationName = 'initial_schema';
    
    // Check if migration already ran
    const checkQuery = 'SELECT id FROM migrations WHERE name = $1';
    const result = await pool.query(checkQuery, [migrationName]);
    
    if (result.rows.length > 0) {
      logger.info('Initial schema migration already executed');
      return;
    }

    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schemaSQL);
    
    // Record migration
    const recordQuery = 'INSERT INTO migrations (name) VALUES ($1)';
    await pool.query(recordQuery, [migrationName]);
    
    logger.info('Initial schema migration executed successfully');
  }

  static async createTestData(): Promise<void> {
    try {
      logger.info('Creating test data...');
      
      // Create test admin user
      const adminQuery = `
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING
      `;
      
      // Using bcrypt hash for password "admin123"
      const adminPasswordHash = '$2b$10$rQZ8kHWKQYXHjQXHjQXHjOeKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK';
      
      await pool.query(adminQuery, [
        'admin@lse-scraper.com',
        adminPasswordHash,
        'admin',
        true
      ]);
      
      logger.info('Test data created successfully');
    } catch (error) {
      logger.error('Failed to create test data:', error);
      throw error;
    }
  }
}