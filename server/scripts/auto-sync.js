import fs from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';

const SCHEMA_PATH = path.resolve('prisma/schema.prisma');
const HASH_FILE = path.resolve('prisma/.schema.hash');

try {
  if (fs.existsSync(SCHEMA_PATH)) {
    const content = fs.readFileSync(SCHEMA_PATH);
    const currentHash = crypto.createHash('md5').update(content).digest('hex');
    const previousHash = fs.existsSync(HASH_FILE) ? fs.readFileSync(HASH_FILE, 'utf8').trim() : '';

    if (currentHash !== previousHash) {
      console.log('🔄 Detected changes in schema.prisma! Auto-syncing database...');
      execSync('npx prisma db push --accept-data-loss --skip-generate', { stdio: 'inherit' });
      try {
        execSync('npx prisma generate', { stdio: 'inherit' });
      } catch {}
      fs.writeFileSync(HASH_FILE, currentHash);
      console.log('✅ Database auto-synced successfully!\n');
    }
  }
} catch (error) {
  console.warn('⚠️ Auto-sync skipped or encountered warning:', error?.message || error);
}
