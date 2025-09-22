import axios from 'axios';
import { JSDOM } from 'jsdom';
import * as xpath from 'xpath';
import { JSONPath } from 'jsonpath-plus';
import type { IScrapingStrategy } from './IScrapingStrategy';
import type { StrategyContext, ExtractionRule, FromRule } from '../type';

export class AjaxStrategy implements IScrapingStrategy {
  async prepare(url: string, config: { subMode?: 'xpath' | 'json' }): Promise<StrategyContext> {
    const { data } = await axios.get(url, { responseType: config.subMode === 'json' ? 'json' : 'text' });
    let document: any;

    if (config.subMode === 'xpath') {
      const dom = new JSDOM(data);
      document = dom.window.document;
    } else {
      document = data;
    }

    return { document, cleanup: async () => {} }; // Ajax模式不需要特殊清理
  }

  async select(context: StrategyContext, rule: ExtractionRule): Promise<any[]> {
    if (rule.type === 'xpath') {
      // JSDOM 的 XPath 需要一个 resolver
      const nodes = xpath.select(rule.selector, context.document);
      return nodes as any[];
    } else if (rule.type === 'json') {
      return JSONPath({ path: rule.selector, json: context.document });
    }
    return [];
  }

  async extract(element: any, from: FromRule): Promise<string | null> {
    // 如果是 JSON Path 返回的直接就是值
    if (typeof element !== 'object' || element === null) {
      return String(element);
    }
    
    // 处理 XPath 节点 (DOM Node)
    if (from === 'text') {
      return element.textContent || null;
    }
    if (from === 'html') {
      return element.innerHTML || null;
    }
    if (from === 'outerHTML') {
      return element.outerHTML || null;
    }
    if (from === 'value') {
      return element.value || null;
    }
    if (from?.startsWith('@')) {
      const attr = from.slice(1);
      return element.getAttribute ? element.getAttribute(attr) : null;
    }
    return null;
  }
}