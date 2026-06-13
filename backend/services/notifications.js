/**
 * Push Notification Service using Expo Push API
 * For sending notifications to React Native app devices
 */
const pool = require('../db/database');

// Expo push notifications endpoint
const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

class NotificationService {
  /**
   * Send a push notification to a specific user
   */
  async sendToUser(userId, title, body, data = {}) {
    try {
      // Get all device tokens for the user
      const res = await pool.query('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
      const tokens = res.rows.map(r => r.token);

      if (tokens.length === 0) return false;

      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }));

      // Send to Expo Push service
      const response = await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const tickets = await response.json();
      console.log('Push notifications sent:', tickets);
      return true;
    } catch (err) {
      console.error('Push notification error:', err);
      return false;
    }
  }

  /**
   * Notify client about appointment confirmation
   */
  async notifyAppointmentConfirmed(clientId, date, time) {
    return this.sendToUser(
      clientId,
      'Appointment Confirmed ✅',
      `Your consultation with Dt. Disha on ${date} at ${time} is confirmed.`
    );
  }

  /**
   * Notify client about new diet plan
   */
  async notifyNewDietPlan(clientId, planName) {
    return this.sendToUser(
      clientId,
      'New Diet Plan Available 🥗',
      `Dt. Disha has uploaded a new diet plan: ${planName}`
    );
  }

  /**
   * Simulate "ringing" for a video call (sends a data-only or high-priority notification)
   */
  async notifyIncomingCall(clientId, roomId) {
    return this.sendToUser(
      clientId,
      'Incoming Call 📞',
      'Dt. Disha is calling you for your consultation.',
      { type: 'incoming_call', roomId }
    );
  }
}

module.exports = new NotificationService();
