import { getMessaging } from '../config/firebase';
import { query } from '../config/database';

export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const userResult = await query(
    'SELECT fcm_token FROM users WHERE id = $1 AND fcm_token IS NOT NULL',
    [userId]
  );

  if (userResult.rows.length === 0 || !userResult.rows[0].fcm_token) {
    return false;
  }

  const token = userResult.rows[0].fcm_token;
  const messaging = getMessaging();

  try {
    await messaging.send({
      token,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high' as const,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending FCM notification:', error);
    return false;
  }
}

export async function updateUserFCMToken(userId: string, fcmToken: string): Promise<void> {
  await query(
    'UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2',
    [fcmToken, userId]
  );
}






