import { query, closePool } from '../config/database';
import { initializeFirebase, getAuth } from '../config/firebase';
import * as dotenv from 'dotenv';

dotenv.config();

interface SeedConfig {
  email: string;
  name?: string;
  password?: string; // If provided, will create Firebase user
  firebaseUid?: string; // If provided, will use this UID instead of creating
  role?: 'admin' | 'super_admin';
  tenantName?: string;
}

/**
 * Seed script to create an admin user in the system
 * 
 * Usage:
 *   Option 1: Create Firebase user automatically
 *     npm run seed -- --email admin@example.com --name "Admin User" --password "securePassword123" --role super_admin
 * 
 *   Option 2: Use existing Firebase UID
 *     npm run seed -- --email admin@example.com --name "Admin User" --firebaseUid "existing-firebase-uid" --role super_admin
 * 
 *   Option 3: Use environment variables
 *     ADMIN_EMAIL=admin@example.com ADMIN_NAME="Admin User" ADMIN_PASSWORD="securePassword123" npm run seed
 */
async function seedAdmin(config: SeedConfig) {
  try {
    // Initialize Firebase
    initializeFirebase();
    const auth = getAuth();

    const email = config.email || process.env.ADMIN_EMAIL;
    const name = config.name || process.env.ADMIN_NAME || 'System Admin';
    const password = config.password || process.env.ADMIN_PASSWORD;
    const firebaseUid = config.firebaseUid || process.env.ADMIN_FIREBASE_UID;
    const role = (config.role || process.env.ADMIN_ROLE || 'super_admin') as 'admin' | 'super_admin';
    const tenantName = config.tenantName || process.env.ADMIN_TENANT_NAME || 'Default Tenant';

    if (!email) {
      throw new Error('Email is required. Provide --email or set ADMIN_EMAIL environment variable');
    }

    let uid: string;

    // Create or use Firebase user
    if (firebaseUid) {
      // Use existing Firebase UID
      console.log(`Using existing Firebase UID: ${firebaseUid}`);
      try {
        const user = await auth.getUser(firebaseUid);
        uid = user.uid;
        console.log(`✓ Verified Firebase user: ${user.email}`);
      } catch (error: any) {
        throw new Error(`Firebase user with UID ${firebaseUid} not found: ${error.message}`);
      }
    } else if (password) {
      // Create new Firebase user
      console.log(`Creating Firebase user: ${email}`);
      try {
        const user = await auth.createUser({
          email,
          password,
          displayName: name,
          emailVerified: true,
        });
        uid = user.uid;
        console.log(`✓ Created Firebase user with UID: ${uid}`);
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          // User already exists, get the UID
          const existingUser = await auth.getUserByEmail(email);
          uid = existingUser.uid;
          console.log(`✓ Firebase user already exists with UID: ${uid}`);
        } else {
          throw error;
        }
      }
    } else {
      throw new Error('Either --password or --firebaseUid must be provided (or set ADMIN_PASSWORD or ADMIN_FIREBASE_UID)');
    }

    // Create or get default tenant
    console.log(`Creating/getting tenant: ${tenantName}`);
    let tenantResult = await query(
      'SELECT id FROM tenants WHERE name = $1',
      [tenantName]
    );

    let tenantId: string;
    if (tenantResult.rows.length === 0) {
      const newTenantResult = await query(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING id',
        [tenantName]
      );
      tenantId = newTenantResult.rows[0].id;
      console.log(`✓ Created tenant: ${tenantName} (${tenantId})`);
    } else {
      tenantId = tenantResult.rows[0].id;
      console.log(`✓ Using existing tenant: ${tenantName} (${tenantId})`);
    }

    // Check if user already exists
    const existingUserResult = await query(
      'SELECT id, role FROM users WHERE firebase_uid = $1',
      [uid]
    );

    if (existingUserResult.rows.length > 0) {
      const existingUser = existingUserResult.rows[0];
      // Update existing user to admin if needed
      if (existingUser.role !== role) {
        await query(
          'UPDATE users SET role = $1, tenant_id = $2, email = $3, name = $4, updated_at = NOW() WHERE id = $5',
          [role, tenantId, email, name, existingUser.id]
        );
        console.log(`✓ Updated existing user to ${role} role`);
      } else {
        console.log(`✓ User already exists with ${role} role`);
      }
    } else {
      // Create new user
      const userResult = await query(
        `INSERT INTO users (firebase_uid, email, name, tenant_id, role) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, role`,
        [uid, email, name, tenantId, role]
      );

      const newUser = userResult.rows[0];
      console.log(`✓ Created admin user:`);
      console.log(`  - ID: ${newUser.id}`);
      console.log(`  - Email: ${newUser.email}`);
      console.log(`  - Role: ${newUser.role}`);
      console.log(`  - Firebase UID: ${uid}`);
      console.log(`  - Tenant: ${tenantName}`);
    }

    console.log('\n✅ Seed completed successfully!');
    console.log(`\nYou can now log in with:`);
    console.log(`  Email: ${email}`);
    if (password) {
      console.log(`  Password: ${password}`);
    }

  } catch (error: any) {
    console.error('❌ Seed failed:', error.message);
    throw error;
  }
}

// Parse command line arguments
function parseArgs(): SeedConfig {
  const args = process.argv.slice(2);
  const config: SeedConfig = { email: '' };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (key === '--email') config.email = value;
    else if (key === '--name') config.name = value;
    else if (key === '--password') config.password = value;
    else if (key === '--firebaseUid') config.firebaseUid = value;
    else if (key === '--role') config.role = value as 'admin' | 'super_admin';
    else if (key === '--tenantName') config.tenantName = value;
  }

  return config;
}

// Main execution
if (require.main === module) {
  const config = parseArgs();
  
  seedAdmin(config)
    .then(() => {
      closePool();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed script failed:', error);
      closePool();
      process.exit(1);
    });
}

export { seedAdmin };





