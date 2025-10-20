import { getDatabase, ref, set, get, remove } from "firebase/database";
import { database } from "./firebase";
import type { SubscriptionData } from "@/types";

export const saveSubscription = async (subscriptionData: SubscriptionData): Promise<void> => {
  try {
    const subscriptionRef = ref(database, `subscriptions/${subscriptionData.chassis}`);
    await set(subscriptionRef, subscriptionData);
  } catch (error) {
    console.error('Error saving subscription:', error);
    throw error;
  }
};

export const checkSubscription = async (chassis: string): Promise<boolean> => {
  try {
    const subscriptionRef = ref(database, `subscriptions/${chassis}`);
    const snapshot = await get(subscriptionRef);
    return snapshot.exists();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
};

export const getSubscription = async (chassis: string): Promise<SubscriptionData | null> => {
  try {
    const subscriptionRef = ref(database, `subscriptions/${chassis}`);
    const snapshot = await get(subscriptionRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
};

export const removeSubscription = async (chassis: string): Promise<void> => {
  try {
    const subscriptionRef = ref(database, `subscriptions/${chassis}`);
    await remove(subscriptionRef);
  } catch (error) {
    console.error('Error removing subscription:', error);
    throw error;
  }
};