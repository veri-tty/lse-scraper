import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { User, AuthToken } from '../types';

export class AuthService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateToken(user: User): string {
    const payload: AuthToken = {
      userId: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    };

    return jwt.sign(payload, this.JWT_SECRET, { expiresIn: this.JWT_EXPIRES_IN });
  }

  static verifyToken(token: string): AuthToken | null {
    try {
      return jwt.verify(token, this.JWT_SECRET) as AuthToken;
    } catch (error) {
      logger.warn('Invalid JWT token:', error);
      return null;
    }
  }

  static async registerUser(email: string, password: string): Promise<User> {
    try {
      const passwordHash = await this.hashPassword(password);
      
      const query = `
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, role, is_active, created_at
      `;
      
      const result = await pool.query(query, [email, passwordHash, 'user', true]);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create user');
      }

      const user = result.rows[0];
      logger.info(`User registered successfully: ${email}`);
      
      return {
        id: user.id,
        email: user.email,
        passwordHash: '', // Don't return password hash
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
      };
    } catch (error) {
      logger.error('User registration failed:', error);
      throw error;
    }
  }

  static async loginUser(email: string, password: string): Promise<{ user: User; token: string } | null> {
    try {
      const query = `
        SELECT id, email, password_hash, role, is_active, created_at, last_login
        FROM users 
        WHERE email = $1 AND is_active = true
      `;
      
      const result = await pool.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const userData = result.rows[0];
      const isValidPassword = await this.verifyPassword(password, userData.password_hash);
      
      if (!isValidPassword) {
        return null;
      }

      // Update last login
      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [userData.id]
      );

      const user: User = {
        id: userData.id,
        email: userData.email,
        passwordHash: '', // Don't return password hash
        role: userData.role,
        isActive: userData.is_active,
        createdAt: userData.created_at,
        lastLogin: new Date(),
      };

      const token = this.generateToken(user);
      
      logger.info(`User logged in successfully: ${email}`);
      
      return { user, token };
    } catch (error) {
      logger.error('User login failed:', error);
      throw error;
    }
  }

  static async getUserById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, email, role, is_active, created_at, last_login, openrouter_api_key_encrypted
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const userData = result.rows[0];
      
      return {
        id: userData.id,
        email: userData.email,
        passwordHash: '', // Don't return password hash
        role: userData.role,
        isActive: userData.is_active,
        createdAt: userData.created_at,
        lastLogin: userData.last_login,
        openRouterApiKey: userData.openrouter_api_key_encrypted,
      };
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      return null;
    }
  }
}