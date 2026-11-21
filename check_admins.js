import bcrypt from 'bcryptjs';
import prisma from './src/lib/prisma.js';

async function main() {
  const testPassword = process.argv[2];
  console.log('Fetching all Administrator accounts from database...\n');
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      password: true,
      isSuspended: true,
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
    for (const a of admins) {
      let pwdStatus = 'Not tested';
      if (testPassword) {
        const matches = await bcrypt.compare(testPassword, a.password);
        pwdStatus = matches ? '✓ PASSWORD MATCHES!' : '✗ WRONG PASSWORD';
      }
      console.log('--------------------------------------------------');
      console.log(`Admin ID:      ${a.id}`);
      console.log(`Email:         ${a.email}`);
      console.log(`Username:      ${a.username}`);
      console.log(`Role:          ${a.role}`);
      console.log(`isSuspended:   ${a.isSuspended}`);
      console.log(`EmailVerified: ${a.isEmailVerified}`);
      if (testPassword) {
        console.log(`Password Test: ${pwdStatus}`);
      }
    }
    console.log('--------------------------------------------------');
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
