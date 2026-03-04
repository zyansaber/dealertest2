export type PlanningLang = "en" | "zh";

export const tr = (lang: PlanningLang, en: string, zh: string) => (lang === "zh" ? zh : en);

const statusMap: Record<string, { en: string; zh: string }> = {
  "Melbourn Factory": { en: "Melbourn Factory", zh: "墨尔本工厂" },
  "not confirmed orders": { en: "not confirmed orders", zh: "未确认订单" },
  "Waiting for sending": { en: "Waiting for sending", zh: "待发送" },
  "Not Start in Longtree": { en: "Not Start in Longtree", zh: "Longtree 未开始" },
  "Chassis welding in Longtree": { en: "Chassis welding in Longtree", zh: "Longtree 底盘焊接" },
  "Assembly line Longtree": { en: "Assembly line Longtree", zh: "Longtree 总装线" },
  "Finishedin Longtree": { en: "Finishedin Longtree", zh: "Longtree 已完工" },
  "Leaving factory from Longtree": { en: "Leaving factory from Longtree", zh: "Longtree 出厂" },
  "waiting in port": { en: "waiting in port", zh: "港口等待" },
  "On the sea": { en: "On the sea", zh: "海运中" },
  "Melbourn Port": { en: "Melbourn Port", zh: "墨尔本港" },
};

export const statusText = (lang: PlanningLang, value: string) => {
  const found = statusMap[value];
  if (!found) return value;
  return lang === "zh" ? found.zh : found.en;
};

export const metricText = (lang: PlanningLang, metric: string) => {
  const map: Record<string, string> = {
    "Purchase Order Sent": "采购单发送",
    chassisWelding: "底盘焊接",
    assemblyLine: "总装线",
    finishGoods: "完工入库",
    leavingFactory: "离开工厂",
    estLeavngPort: "预计离港",
    "Left Port": "已离港",
    melbournePortDate: "墨尔本港到港",
  };
  return lang === "zh" ? map[metric] ?? metric : metric;
};
