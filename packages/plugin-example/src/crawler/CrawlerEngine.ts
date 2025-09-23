import { createStrategy } from './strategyFactory';
import type {
  ScrapingConfig,
  ScrapingResult,
  Processor,
} from './type';

export class CrawlerEngine {
  public async run(config: ScrapingConfig): Promise<ScrapingResult> {
    const strategy = createStrategy(config);
    const context = await strategy.prepare(config);
    
    const result: ScrapingResult = {};

    try {
      for (const item of config.items) {
        // 根据配置的子模式修正规则类型
        const rule = { ...item, type: config.subMode || item.type };

        const elements = await strategy.select(context, rule);
        if (elements.length > 0) {
          // 简单起见，我们先只取第一个元素
          const rawValue = await strategy.extract(elements[0], rule.from);
          result[rule.name] = this.applyProcessors(rawValue, rule.processors);
        } else {
          result[rule.name] = null;
        }
      }
    } catch (error) {
      console.error('Scraping failed:', error);
      throw error; // 向上抛出异常
    } finally {
      // 确保资源被清理
      await context.cleanup();
    }

    return result;
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
      }
    }
    return processedValue;
  }
}