import { getMessaging } from '../config/firebase';
import { prisma } from '../lib/prisma';

export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.fcmToken) return false;

  try {
    await getMessaging().send({
      token: user.fcmToken,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' as const },
    });
    return true;
  } catch (error) {
    console.error('Error sending FCM notification:', error);
    return false;
  }
}

export async function updateUserFCMToken(userId: string, fcmToken: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { fcmToken } });
}
