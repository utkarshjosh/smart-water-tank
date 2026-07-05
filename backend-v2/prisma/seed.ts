import { prisma } from '../src/lib/prisma';
import { initializeFirebase, getAuth } from '../src/config/firebase';

interface SeedConfig {
  email: string;
  name?: string;
  password?: string; // If provided, will create a Firebase user
  firebaseUid?: string; // If provided, uses this UID instead of creating one
  role?: 'admin' | 'super_admin';
  tenantName?: string;
}

/**
 * Seed script to create an admin user in the system.
 *
 * Usage:
 *   Option 1: Create Firebase user automatically
 *     npx prisma db seed -- --email admin@example.com --name "Admin User" --password "securePassword123" --role super_admin
 *
 *   Option 2: Use an existing Firebase UID
 *     npx prisma db seed -- --email admin@example.com --name "Admin User" --firebaseUid "existing-firebase-uid" --role super_admin
 *
 *   Option 3: Use environment variables
 *     ADMIN_EMAIL=admin@example.com ADMIN_NAME="Admin User" ADMIN_PASSWORD="securePassword123" npx prisma db seed
 */
async function seedAdmin(config: SeedConfig) {
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

  if (firebaseUid) {
    console.log(`Using existing Firebase UID: ${firebaseUid}`);
    const user = await auth.getUser(firebaseUid);
    uid = user.uid;
    console.log(`✓ Verified Firebase user: ${user.email}`);
  } else if (password) {
    console.log(`Creating Firebase user: ${email}`);
    try {
      const user = await auth.createUser({ email, password, displayName: name, emailVerified: true });
      uid = user.uid;
      console.log(`✓ Created Firebase user with UID: ${uid}`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
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

  console.log(`Creating/getting tenant: ${tenantName}`);
  let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: tenantName } });
    console.log(`✓ Created tenant: ${tenantName} (${tenant.id})`);
  } else {
    console.log(`✓ Using existing tenant: ${tenantName} (${tenant.id})`);
  }

  const existingUser = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (existingUser) {
    if (existingUser.role !== role) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role, tenantId: tenant.id, email, name },
      });
      console.log(`✓ Updated existing user to ${role} role`);
    } else {
      console.log(`✓ User already exists with ${role} role`);
    }
  } else {
    const newUser = await prisma.user.create({
      data: { firebaseUid: uid, email, name, tenantId: tenant.id, role },
    });
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
}

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

seedAdmin(parseArgs())
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('❌ Seed failed:', error.message);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
