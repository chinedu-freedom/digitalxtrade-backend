import fs from 'fs';
import path from 'path';
import prisma from './src/lib/prisma.js';

async function main() {
  const possibleSourcePaths = [
    path.resolve('../digital-user/public/logo.jpeg'),
    path.resolve('../digital-user/public/logo.png'),
    path.resolve('./public/logo.jpeg'),
    path.resolve('./public/logo.png')
  ];

  let logoPath = possibleSourcePaths.find(p => fs.existsSync(p));
  if (!logoPath) {
    console.error('Error: logo file not found in public directories.');
    process.exit(1);
  }

  console.log(`Using source logo from: ${logoPath}`);
  const logoBuffer = fs.readFileSync(logoPath);
  const base64Logo = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  // 1. Update database platform logo if settings model exists
  try {
    const settings = await prisma.settings.findFirst();
    if (settings) {
      await prisma.settings.update({
        where: { id: settings.id },
        data: { platform_logo: base64Logo }
      });
      console.log('✓ Database settings.platform_logo updated successfully!');
    }
  } catch (err) {
    // Settings table may not have platform_logo
  }

  // 2. Overwrite user, admin and backend asset targets
  const targets = [
    '../digital-user/public/logo.jpeg',
    '../digital-user/public/logo.png',
    '../digital-user/public/favicon.ico',
    '../digital-user/src/app/favicon.ico',
    '../digital-user/src/app/icon.png',
    '../digital-user/public/icon-192.png',
    '../digital-user/public/icon-512.png',
    '../digital-admin/public/logo.jpeg',
    '../digital-admin/public/logo.png',
    '../digital-admin/public/favicon.ico',
    '../digital-admin/src/app/favicon.ico',
    '../digital-admin/src/app/icon.png',
    './public/logo.jpeg',
    './public/logo.png'
  ];

  for (const target of targets) {
    const targetPath = path.resolve(target);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, logoBuffer);
    console.log(`✓ Synchronized ${targetPath}`);
  }

  console.log('\nAll logo and icon assets synchronized across DigitalXTrade apps!');
}

main()
  .catch((e) => {
    console.error('Error synchronizing logos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
