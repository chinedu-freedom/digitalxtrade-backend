import prisma from './src/lib/prisma.js';

async function main() {
  console.log('Fetching all Administrator accounts from database...\n');
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      lastLoginIp: true
    }
  });

  if (admins.length === 0) {
    console.log('No administrator accounts found in the database!');
    console.log('Run `node seedAdmin.js` to create a default admin.');
  } else {
    console.table(admins.map(a => ({
      ID: a.id,
      Email: a.email,
      Username: a.username,
      FullName: a.fullName,
      Role: a.role,
      Verified: a.isEmailVerified,
      Created: a.createdAt ? a.createdAt.toISOString() : 'N/A'
    })));
  }
}

main()
  .catch((e) => {
    console.error('Error fetching admins:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
