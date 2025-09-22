import { BrowserWindow } from 'electron';
import type { IScrapingStrategy } from './IScrapingStrategy';
import type { StrategyContext, ExtractionRule, FromRule } from '../type';

export class HeadlessStrategy implements IScrapingStrategy {
  async prepare(url: string): Promise<StrategyContext> {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    
    await win.loadURL(url);
    // 等待页面完全加载，可以根据需要换成更复杂的等待条件
    await new Promise(resolve => win.webContents.on('did-finish-load', () => {
      resolve(null);
    }));

    const context: StrategyContext = {
      document: win.webContents, // 将 webContents 作为 document
      cleanup: async () => {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      },
    };
    return context;
  }

  async select(context: StrategyContext, rule: ExtractionRule): Promise<any[]> {
    // Headless 模式只支持 XPath
    if (rule.type !== 'xpath') {
      console.warn('Headless mode only supports XPath. Skipping rule:', rule.name);
      return [];
    }
    
    // 在页面中执行脚本来运行 XPath
    const script = `
      const results = [];
      const query = document.evaluate("${rule.selector.replace(/"/g, '\\"')}", document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      let node = query.iterateNext();
      while (node) {
        // 为了能把节点信息传回主进程，我们提取需要的信息而不是返回整个节点对象
        // 这里简化处理，为每个匹配的节点创建一个唯一的id，后续通过这个id操作
        const tempId = 'scraper-node-' + Math.random().toString(36).substr(2, 9);
        node.setAttribute('data-scraper-id', tempId);
        results.push(tempId);
        node = query.iterateNext();
      }
      results;
    `;
    const tempIds = await context.document.executeJavaScript(script);
    return tempIds;
  }
  
  async extract(elementId: any, from: FromRule): Promise<string | null> {
    const selector = `[data-scraper-id="${elementId}"]`;
    let script: string;

    if (from === 'text') {
      script = `document.querySelector('${selector}').textContent`;
    } else if (from === 'html') {
      script = `document.querySelector('${selector}').innerHTML`;
    } else if (from === 'outerHTML') {
      script = `document.querySelector('${selector}').outerHTML`;
    } else if (from === 'value') {
      script = `document.querySelector('${selector}').value`;
    } else if (from?.startsWith('@')) {
      const attr = from.slice(1);
      script = `document.querySelector('${selector}').getAttribute('${attr}')`;
    } else {
      return null;
    }
    
    // 在页面中执行脚本提取数据
    // 注意：这里的 context.document 实际上是 webContents
    const webContents = elementId.context; // 假设 select 时把 webContents 传过来了
    return webContents.executeJavaScript(script);
  }
  
  // 一个优化的版本
  async selectAndExtract(context: StrategyContext, rule: ExtractionRule): Promise<string[]> {
      const { selector, from } = rule;
      const script = `
        (() => {
          const results = [];
          const query = document.evaluate("${selector.replace(/"/g, '\\"')}", document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          let node = query.iterateNext();
          while (node) {
            let value = null;
            const fromRule = ${JSON.stringify(from)};
            if (fromRule === 'text') value = node.textContent;
            else if (fromRule === 'html') value = node.innerHTML;
            else if (fromRule === 'outerHTML') value = node.outerHTML;
            else if (fromRule === 'value') value = node.value;
            else if (fromRule?.startsWith('@')) value = node.getAttribute(fromRule.slice(1)
            results.push(value);
            node = query.iterateNext();
          }
          return results;
        })();
      `;
      return context.document.executeJavaScript(script);
  }
}