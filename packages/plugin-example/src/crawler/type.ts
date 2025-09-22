export type Processor = 
  | { type: 'regex', match: string, group?: number } // 正则匹配，可选捕获组
  | { type: 'replace', find: string, with: string } // 字符串替换
  | { type: 'prepend', value: string } // 添加前缀
  | { type: 'append', value: string } // 添加后缀

export interface ExtractionRule {
  name: string;
  selector: string; 

  // 从选中元素/对象中提取哪个部分
  // 'text': 元素的文本内容
  // 'html': 元素的内部HTML
  // 'outerHTML': 元素的完整HTML
  // 'value': JSON对象的值 (JSON模式下默认)
  // '@attr_name': 提取属性值, e.g., '@href', '@src'
  from?: 'text' | 'html' | 'outerHTML' | 'value' | string;
  type: 'xpath' | 'json';

  // 后处理器链：按顺序对提取出的字符串进行处理
  processors?: Array<Processor>;
}

export type FromRule = ExtractionRule['from']



export interface ScrapingConfig {
  url: string;
  mode: 'ajax' | 'headless';
  // ajax模式下的具体解析类型
  subMode?: 'xpath' | 'json';
  // 一个页面下的所有规则
  items: ExtractionRule[];
}

export type ScrapingResult = Record<string, any>;

export interface StrategyContext {
  document: any;
  cleanup: () => Promise<void>; // 用于资源清理
}