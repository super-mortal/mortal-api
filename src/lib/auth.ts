// ============================================================
// Authentication utilities
// ============================================================
const jwt = require('jsonwebtoken') as any;
const bcrypt = require('bcryptjs') as any;

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyAdminToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}
