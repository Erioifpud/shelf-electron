import type { StrategyContext, ExtractionRule, FromRule } from '../type';

/**
 * 爬取策略接口
 * 定义了获取、选择和提取数据的标准方法
 */
export interface IScrapingStrategy {
  /**
   * 准备阶段：根据 URL 获取数据并准备好一个可查询的上下文
   * @param url - 目标 URL
   * @param config - 爬取配置
   */
  prepare(url: string, config: { subMode?: 'xpath' | 'json' }): Promise<StrategyContext>;

  /**
   * 从上下文中选择一个或多个元素/节点
   * @param context - 由 prepare() 返回的上下文
   * @param rule - 提取规则，主要用到 selector 和 type
   */
  select(context: StrategyContext, rule: ExtractionRule): Promise<any[]>;

  /**
   * 从单个元素/节点中提取数据
   * @param element - 由 select() 返回的单个元素
   * @param from - 提取方式
   */
  extract(element: any, from: FromRule): Promise<string | null>;
}