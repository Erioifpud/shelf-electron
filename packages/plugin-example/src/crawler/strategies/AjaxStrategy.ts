import axios from 'axios';
import * as cheerio from 'cheerio';
import { JSONPath } from 'jsonpath-plus';
import type { IScrapingStrategy } from './IScrapingStrategy';
import type { StrategyContext, ExtractionRule, FromRule, ScrapingConfig } from '../type';

export class AjaxStrategy implements IScrapingStrategy {
  async prepare(config: ScrapingConfig): Promise<StrategyContext> {
    const { url, headers = {}, cookies = [], subMode } = config;

    const requestHeaders: Record<string, string> = { ...headers };
    if (cookies.length > 0) {
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      // 如果已存在 Cookie header 则追加，否则新建
      requestHeaders['Cookie'] = requestHeaders['Cookie'] 
        ? `${requestHeaders['Cookie']}; ${cookieString}` 
        : cookieString;
    }

    const { data } = await axios.get(url, {
      responseType: subMode === 'json' ? 'json' : 'text',
      headers: requestHeaders,
    });
    let document: any;
    let extra: any = {};

    if (subMode === 'xpath') {
      document = cheerio.load(data)
      extra = { $: document }
    } else {
      document = data;
    }

    return { document, cleanup: async () => {}, extra }; // Ajax模式不需要特殊清理
  }

  async select(context: StrategyContext, rule: ExtractionRule): Promise<any[]> {
    if (rule.type === 'xpath') {
      if (!rule.selector) {
        return [];
      }
      const $ = context.extra.$;
      let nodes: any[] = []
      if (typeof context.document !== 'function') {
        // 表示当前的是 Element
        nodes = $(context.document).find(rule.selector)
      } else {
        nodes = $(rule.selector)
      }
      return nodes as any[];
    } else if (rule.type === 'json') {
      return JSONPath({ path: rule.selector, json: context.document });
    }
    return [];
  }

  async extract(context: StrategyContext, element: any, from: FromRule): Promise<string | null> {
    // 如果是 JSON Path 返回的直接就是值
    if (typeof element !== 'object' || element === null) {
      return String(element);
    }
    const $ = context.extra.$;
    // 处理 XPath 节点 (DOM Node)
    if (from === 'text') {
      return $(element)?.text?.() || null;
    }
    if (from === 'html') {
      return $(element)?.html?.() || null;
    }
    if (from === 'outerHTML') {
      return $(element)?.html?.().prop?.('outerHTML') || null;
    }
    if (from === 'value') {
      return $(element)?.val?.() || null;
    }
    if (from?.startsWith('@')) {
      const attr = from.slice(1);
      return $(element)?.attr?.(attr) || null;
    }
    return null;
  }
}