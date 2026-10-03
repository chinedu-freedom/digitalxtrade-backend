import bcrypt from 'bcryptjs';
import prisma from './src/lib/prisma.js';

async function main() {
  const args = process.argv.slice(2);
  let email = args[0];
  let password = args[1];
  let username = args[2] || 'admin';
  let fullName = args[3] || 'Super Administrator';

  if (!email || !password) {
    console.log('No credentials provided in command line arguments.');
    console.log('Usage: node seedAdmin.js <email> <password> [username] [fullName]');
    console.log('Using default admin setup instead...\n');
    email = 'admin@digitalxtrade.com';
    password = 'digitalXAdmin2$';
  }

  const cleanEmail = email.toLowerCase().trim();
  console.log(`Setting up Admin Account:`);
  console.log(`- Email: ${cleanEmail}`);
  console.log(`- Username: ${username}`);
  console.log(`- Role: ADMIN`);

  const passwordHash = await bcrypt.hash(password, 10);

  // Check if admin user already exists by email or username
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanEmail },
        { username: username }
      ]
    }
  });

  let admin;
  if (existing) {
    admin = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: cleanEmail,
        username: username,
        fullName: fullName,
        password: passwordHash,
        role: 'ADMIN',
        isEmailVerified: true,
      }
    });
    console.log('\nExisting Admin account updated successfully!');
  } else {
    admin = await prisma.user.create({
      data: {
        email: cleanEmail,
        username: username,
        fullName: fullName,
        password: passwordHash,
        role: 'ADMIN',
        isEmailVerified: true,
      }
    });
    console.log('\nNew Admin account created successfully!');
  }

  console.log('--------------------------------------------------');
  console.log(`Admin ID:  ${admin.id}`);
  console.log(`Email:     ${admin.email}`);
  console.log(`Username:  ${admin.username}`);
  console.log(`Password:  ${password}`);
  console.log(`Role:      ${admin.role}`);
  console.log('--------------------------------------------------');
  console.log('You can now log in at https://admin.digitalxtrade.com/admin/login (or http://localhost:3002/admin/login)');
}

main()
  .catch((e) => {
    console.error('Error seeding admin account:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
