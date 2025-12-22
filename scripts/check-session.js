const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSession() {
  const sessionId = 'ac885350-2fe7-4800-a399-07c56f2f6212';
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    console.log('Session Data:', JSON.stringify(session, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));
  } catch (error) {
    console.error('Error checking session:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSession();
