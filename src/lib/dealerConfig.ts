// src/lib/dealerConfig.ts
import { database } from "./firebase";
import { ref, onValue, off, set, remove, push } from "firebase/database";
import type { DealerConfig, DealerConfigs } from "@/types/dealer";

const DEALER_CONFIGS_PATH = "dealerConfigs";

/**
 * 订阅所有经销商配置
 */
export const subscribeToDealerConfigs = (callback: (data: DealerConfigs) => void) => {
  const configsRef = ref(database, DEALER_CONFIGS_PATH);
  
  const handler = (snapshot: any) => {
    const data = snapshot.val();
    callback(data || {});
  };
  
  onValue(configsRef, handler);
  return () => off(configsRef, "value", handler);
};

/**
 * 订阅单个经销商配置
 */
export const subscribeToDealerConfig = (
  dealerSlug: string, 
  callback: (data: DealerConfig | null) => void
) => {
  const configRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}`);
  
  const handler = (snapshot: any) => {
    const data = snapshot.val();
    callback(data || null);
  };
  
  onValue(configRef, handler);
  return () => off(configRef, "value", handler);
};

/**
 * 保存经销商配置
 */
export const saveDealerConfig = async (dealerSlug: string, config: Omit<DealerConfig, 'slug'>) => {
  const configRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}`);
  const fullConfig: DealerConfig = {
    ...config,
    slug: dealerSlug,
    updatedAt: new Date().toISOString()
  };
  
  await set(configRef, fullConfig);
  return fullConfig;
};

/**
 * 删除经销商配置
 */
export const removeDealerConfig = async (dealerSlug: string) => {
  const configRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}`);
  await remove(configRef);
};

/**
 * 更新经销商的PowerBI URL
 */
export const updateDealerPowerbiUrl = async (dealerSlug: string, powerbiUrl: string) => {
  const configRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}/powerbiUrl`);
  await set(configRef, powerbiUrl);
  
  // 同时更新 updatedAt
  const updatedAtRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}/updatedAt`);
  await set(updatedAtRef, new Date().toISOString());
};

/**
 * 更新经销商激活状态
 */
export const updateDealerActiveStatus = async (dealerSlug: string, isActive: boolean) => {
  const configRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}/isActive`);
  await set(configRef, isActive);
  
  // 同时更新 updatedAt
  const updatedAtRef = ref(database, `${DEALER_CONFIGS_PATH}/${dealerSlug}/updatedAt`);
  await set(updatedAtRef, new Date().toISOString());
};

/**
 * 生成随机6位字符串
 */
export function generateRandomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 将dealer名称转换为slug
 */
export function dealerNameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}