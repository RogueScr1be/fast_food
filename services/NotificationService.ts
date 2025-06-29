import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Configure notification behavior
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

interface NotificationData {
  type: 'meal_reminder' | 'grocery_reminder' | 'recipe_suggestion' | 'meal_plan_ready';
  title: string;
  body: string;
  data?: Record<string, any>;
}

class NotificationService {
  private expoPushToken: string | null = null;

  async initialize(): Promise<{ status: string }> {
    try {
      if (Platform.OS === 'web') {
        console.warn('Push notifications not available on web');
        return { status: 'unavailable' };
      }

      if (!Device.isDevice) {
        console.warn('Push notifications only work on physical devices');
        return { status: 'unavailable' };
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return { status: finalStatus };
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('meal-reminders', {
          name: 'Meal Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6B35',
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('grocery-reminders', {
          name: 'Grocery Reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6B35',
        });
      }

      return { status: finalStatus };
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return { status: 'error' };
    }
  }

  async scheduleLocalNotification(notification: NotificationData, trigger?: Notifications.NotificationTriggerInput): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        console.warn('Notifications not available on web');
        return null;
      }

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: 'default',
          badge: 1,
        },
        trigger: trigger || null,
      });

      console.log('📅 Scheduled notification:', identifier);
      return identifier;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  async scheduleMealReminder(mealName: string, cookTime: string, scheduledTime: Date): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    const trigger: Notifications.NotificationTriggerInput = {
      date: scheduledTime,
    };

    return this.scheduleLocalNotification({
      type: 'meal_reminder',
      title: '🍽️ Time to Cook!',
      body: `It's time to start cooking ${mealName}. Estimated time: ${cookTime}`,
      data: {
        type: 'meal_reminder',
        meal: mealName,
        cookTime,
      },
    }, trigger);
  }

  async scheduleGroceryReminder(itemCount: number, scheduledTime: Date): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    const trigger: Notifications.NotificationTriggerInput = {
      date: scheduledTime,
    };

    return this.scheduleLocalNotification({
      type: 'grocery_reminder',
      title: '🛒 Grocery Shopping Time!',
      body: `Don't forget to pick up ${itemCount} items from your grocery list`,
      data: {
        type: 'grocery_reminder',
        itemCount,
      },
    }, trigger);
  }

  async scheduleWeeklyMealPlanReminder(): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    // Schedule for Sunday at 6 PM
    const nextSunday = new Date();
    nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
    nextSunday.setHours(18, 0, 0, 0);

    const trigger: Notifications.NotificationTriggerInput = {
      weekday: 1, // Sunday
      hour: 18,
      minute: 0,
      repeats: true,
    };

    return this.scheduleLocalNotification({
      type: 'meal_plan_ready',
      title: '📋 Plan Your Week!',
      body: 'Time to create your meal plan for the upcoming week',
      data: {
        type: 'weekly_planning',
      },
    }, trigger);
  }

  async sendRecipeSuggestion(recipeName: string, reason: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    return this.scheduleLocalNotification({
      type: 'recipe_suggestion',
      title: '✨ Recipe Suggestion',
      body: `Try ${recipeName} - ${reason}`,
      data: {
        type: 'recipe_suggestion',
        recipe: recipeName,
        reason,
      },
    });
  }

  async cancelNotification(identifier: string): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      await Notifications.cancelScheduledNotificationAsync(identifier);
      console.log('❌ Cancelled notification:', identifier);
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('❌ Cancelled all notifications');
    } catch (error) {
      console.error('Error cancelling all notifications:', error);
    }
  }

  async getBadgeCount(): Promise<number> {
    try {
      if (Platform.OS === 'web') return 0;

      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  async setBadgeCount(count: number): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === 'web') return;
    await this.setBadgeCount(0);
  }

  // Add notification listeners
  addNotificationReceivedListener(listener: (notification: Notifications.Notification) => void) {
    if (Platform.OS === 'web') {
      return { remove: () => {} };
    }
    return Notifications.addNotificationReceivedListener(listener);
  }

  addNotificationResponseReceivedListener(listener: (response: Notifications.NotificationResponse) => void) {
    if (Platform.OS === 'web') {
      return { remove: () => {} };
    }
    return Notifications.addNotificationResponseReceivedListener(listener);
  }

  // Smart notification scheduling based on user behavior
  async scheduleSmartReminders(mealPlan: any[], userPreferences: any): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      // Cancel existing reminders
      await this.cancelAllNotifications();

      // Schedule meal reminders 30 minutes before typical cooking time
      for (const meal of mealPlan) {
        const cookingTime = this.parseCookTime(meal.cook_time);
        const reminderTime = new Date();
        
        // Assume dinner is at 6 PM, schedule reminder 30 minutes + cook time before
        reminderTime.setHours(18 - Math.ceil(cookingTime / 60) - 0.5, 0, 0, 0);
        
        if (reminderTime > new Date()) {
          await this.scheduleMealReminder(meal.meal, meal.cook_time, reminderTime);
        }
      }

      // Schedule grocery reminder for Saturday morning
      const nextSaturday = new Date();
      nextSaturday.setDate(nextSaturday.getDate() + (6 - nextSaturday.getDay()));
      nextSaturday.setHours(10, 0, 0, 0);

      if (nextSaturday > new Date()) {
        await this.scheduleGroceryReminder(10, nextSaturday); // Assume 10 items
      }

      // Schedule weekly meal planning reminder
      await this.scheduleWeeklyMealPlanReminder();

    } catch (error) {
      console.error('Error scheduling smart reminders:', error);
    }
  }

  private parseCookTime(cookTime: string): number {
    const match = cookTime.match(/(\d+)/);
    return match ? parseInt(match[1]) : 30; // Default to 30 minutes
  }
}

export default new NotificationService();