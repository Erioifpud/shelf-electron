import { map, set } from 'lodash-es';
import { IScrapingStrategy } from './strategies/IScrapingStrategy';
import { createStrategy } from './strategyFactory';
import type {
  ScrapingConfig,
  ScrapingResult,
  Processor,
  ExtractionRule,
} from './type';
import { buildUrl } from '../../renderer/lib/utils';

export interface CrawlerEngineOptions {
  baseUrl?: string;
}

export class CrawlerEngine {
  private baseUrl: string;

  constructor(options: CrawlerEngineOptions) {
    this.baseUrl = options.baseUrl || '';
  }

  public async run(config: ScrapingConfig): Promise<ScrapingResult> {
    const strategy = createStrategy(config);
    const context = await strategy.prepare(config);
    let result: ScrapingResult = {};

    try {
      // 初始调用，使用整个文档作为作用域 (scope)
      result = await this.processNode(config.items, context, strategy, config);
    } catch (error) {
      console.error('Scraping failed:', error);
      throw error;
    } finally {
      await context.cleanup();
    }
    
    return result;
  }

  private async processNode(
    rules: ExtractionRule[],
    context: any,
    strategy: IScrapingStrategy,
    config: ScrapingConfig
  ): Promise<ScrapingResult> {
    const nodeResult: ScrapingResult = {};

    for (const rule of rules) {
      const currentRule = { ...rule, type: rule.type || config.subMode };
      
      // 在当前作用域内选择元素
      const elements = await strategy.select(context, currentRule);

      if (!elements || elements.length === 0) {
        set(nodeResult, rule.name, rule.multiple ? [] : null);
        continue;
      }

      // --- 核心逻辑分支 ---

      if (rule.items && rule.items.length > 0) {
        // 1. 列表-详情模式 (有嵌套 items)
        const childResults = await Promise.all(
          map(elements, (element) => {
            return this.processNode(rule.items!, { ...context, document: element }, strategy, config)
          })
        );

        set(nodeResult, rule.name, childResults);
      } else if (rule.multiple) {
        // 2. 提取列表数据模式 (multiple: true)
        const values = await Promise.all(
          elements.map(async (element) => {
            const rawValue = await strategy.extract(context, element, rule.from);
            return this.applyProcessors(rawValue, rule.processors);
          })
        );
        set(nodeResult, rule.name, values);
      } else {
        // 3. 提取单个数据模式 (默认)
        const rawValue = await strategy.extract(context, elements[0], rule.from);
        set(nodeResult, rule.name, this.applyProcessors(rawValue, rule.processors));
      }
    }

    return nodeResult;
  }

  private applyProcessors(value: string | null, processors?: Processor[]): any {
    if (value === null || !processors) {
      return value;
    }

    let processedValue = value;
    for (const processor of processors) {
      switch (processor.type) {
        case 'replace':
          processedValue = processedValue.replace(processor.find, processor.with);
          break;
        case 'regex':
          const match = processedValue.match(processor.match);
          processedValue = match ? (processor.group ? match[processor.group] : match[0]) : '';
          break;
        case 'append':
          processedValue += processor.value;
          break;
        case 'prepend':
          processedValue = processor.value + processedValue;
          break;
        case 'resolve':
          processedValue = buildUrl(this.baseUrl, processedValue);
          break;
      }
    }
    return processedValue;
  }
}