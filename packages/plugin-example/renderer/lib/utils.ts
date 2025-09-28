import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const buildUrl = (baseUrl: string, url: string): string => {
  if (!url) {
    // 如果 url 不存在，返回空字符串
    return "";
  }

  const rawUrl = url.trim();

  try {
    if (baseUrl) {
      return new URL(rawUrl, baseUrl).href;
    }
    return new URL(rawUrl).href;
  } catch (error) {
    // baseUrl 不存在
    // rawUrl 是相对路径
    return rawUrl;
  }
};