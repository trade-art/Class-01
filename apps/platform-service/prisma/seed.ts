import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create super admin
  const hashedPassword = await bcrypt.hash('admin123456', 10);

  const superAdmin = await prisma.platformAdmin.upsert({
    where: { email: 'admin@mt5platform.com' },
    update: {},
    create: {
      email: 'admin@mt5platform.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log('✅ Created super admin:', superAdmin.email);

  // Create demo tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { code: 'demo' },
    update: {},
    create: {
      name: 'Demo Trading Company',
      code: 'demo',
      email: 'demo@example.com',
      phone: '+1234567890',
      company: 'Demo Trading Corp',
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      maxInstances: 5,
      maxAdmins: 10,
      billingCycle: 'MONTHLY',
    },
  });

  console.log('✅ Created demo tenant:', demoTenant.name);

  // Create tenant admin for demo
  const tenantAdminPassword = await bcrypt.hash('demo123456', 10);

  const tenantAdmin = await prisma.tenantAdmin.upsert({
    where: {
      tenantId_email: {
        tenantId: demoTenant.id,
        email: 'admin@demo.com',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'admin@demo.com',
      password: tenantAdminPassword,
      name: 'Demo Admin',
      role: 'OWNER',
      isActive: true,
    },
  });

  console.log('✅ Created tenant admin:', tenantAdmin.email);

  // Create MT Server for demo tenant
  // Note: In production, password should be encrypted with proper encryption
  const demoMtServer = await prisma.mtServer.upsert({
    where: {
      tenantId_serverId: {
        tenantId: demoTenant.id,
        serverId: 'demo-mt5-server',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      serverId: 'demo-mt5-server',
      displayName: 'Demo MT5 Server',
      platformType: 'MT5',
      middlewareUrl: 'http://localhost:8080',
      serverAddress: 'demo.mt5server.com:443',
      managerLogin: BigInt(1000),
      managerPasswordEncrypted: 'encrypted_password_placeholder', // Should be encrypted in production
      isActive: true,
      isDefault: true,
    },
  });

  console.log('✅ Created MT server:', demoMtServer.displayName);

  // Create system settings
  const settings = [
    {
      key: 'platform.name',
      value: { value: 'MT5 SaaS Platform' },
      category: 'general',
      description: 'Platform display name',
    },
    {
      key: 'platform.version',
      value: { value: '1.0.0' },
      category: 'general',
      description: 'Platform version',
    },
    {
      key: 'billing.currency',
      value: { value: 'USD' },
      category: 'billing',
      description: 'Default billing currency',
    },
    {
      key: 'trial.duration_days',
      value: { value: 14 },
      category: 'subscription',
      description: 'Trial period duration in days',
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('✅ Created system settings');

  console.log('\n🎉 Database seed completed!');
  console.log('\n📋 Login credentials:');
  console.log('   Platform Admin:');
  console.log('     Email: admin@mt5platform.com');
  console.log('     Password: admin123456');
  console.log('\n   Demo Tenant Admin:');
  console.log('     Tenant Code: demo');
  console.log('     Email: admin@demo.com');
  console.log('     Password: demo123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
