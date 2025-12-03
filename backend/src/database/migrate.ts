import * as fs from 'fs';
import * as path from 'path';
import { query, getClient, closePool } from '../config/database';

async function runMigrations() {
  // Get the migrations directory - handle both source and dist locations
  // __dirname in dist will be backend/dist/database, so we go up to backend and then to src
  const isDist = __dirname.includes('dist');
  const migrationsDir = isDist
    ? path.join(__dirname, '../../src/database/migrations')
    : path.join(__dirname, 'migrations');
  
  // Verify migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files in ${migrationsDir}`);

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    try {
      await query(sql);
      console.log(`✓ Migration ${file} completed`);
    } catch (error) {
      console.error(`✗ Migration ${file} failed:`, error);
      throw error;
    }
  }

  console.log('All migrations completed');
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      closePool();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      closePool();
      process.exit(1);
    });
}

export { runMigrations };

