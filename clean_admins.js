import prisma from './src/lib/prisma.js';

async function main() {
  const keepEmail = (process.argv[2] || 'admin@digitalxtrade.com').toLowerCase().trim();
  console.log(`[CLEANUP] Scanning database for any rogue or unauthorized admin accounts...`);
  console.log(`[CLEANUP] Whitelisted Primary Admin: ${keepEmail}`);

  // 1. Find all admin accounts
  const allAdmins = await prisma.user.findMany({
    where: { role: 'ADMIN' }
  });

  console.log(`[CLEANUP] Total Admin accounts found: ${allAdmins.length}`);

  const rogueAdmins = allAdmins.filter(
    (a) => (a.email || '').toLowerCase().trim() !== keepEmail
  );

  if (rogueAdmins.length === 0) {
    console.log(`✓ Database is clean! Only ${keepEmail} has ADMIN role.`);
    return;
  }

  console.log(`[CLEANUP] Found ${rogueAdmins.length} unauthorized admin account(s):`);
  for (const a of rogueAdmins) {
    console.log(` - Demoting/Revoking rogue admin: ID=${a.id}, Email=${a.email}, Username=${a.username}`);
    await prisma.user.update({
      where: { id: a.id },
      data: { role: 'USER', isSuspended: true }
    });
  }

  console.log('--------------------------------------------------');
  console.log(`✓ Successfully demoted and suspended ${rogueAdmins.length} rogue admin account(s)!`);
  console.log(`✓ ONLY ${keepEmail} remains with role: ADMIN.`);
  console.log('--------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Failed to clean admin accounts:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
