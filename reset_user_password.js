import bcrypt from 'bcryptjs';
import prisma from './src/lib/prisma.js';

async function main() {
  const inputEmail = (process.argv[2] || '').trim();
  const newPassword = process.argv[3];

  if (!inputEmail || !newPassword) {
    console.log('Usage: node reset_user_password.js <email> <newPassword>');
    process.exit(1);
  }

  console.log(`Resetting password for user: ${inputEmail}...`);

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: inputEmail,
        mode: 'insensitive'
      }
    }
  });

  if (!user) {
    console.error(`Error: User with email "${inputEmail}" not found in database!`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash }
  });

  console.log('--------------------------------------------------');
  console.log('✓ User password reset successfully in database!');
  console.log(`- User ID:      ${updated.id}`);
  console.log(`- Full Name:    ${updated.fullName || updated.username}`);
  console.log(`- Email:        ${updated.email}`);
  console.log(`- New Password: ${newPassword}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Failed to reset user password:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

