/*
  顶级概念是源/站点（Site），表示一个网站的规则，用户选择了源之后就能进入对应的漫画列表去使用
  Page 表示一整条完整的用户路径，从刚进去的首页列表视图 -> 详情视图 -> 阅读视图
  Site 下可以包含多个 Page，默认会使用第一个 Page，所有 Page 都会以名称的形式显示为顶部的 Tab（本意是作为专题区分）
  爬取规则分为 DetailRule 和 CollectionRule 两种，其中 DetailRule 用于详情视图和阅读视图，其余和列表/多项目有关的均使用 CollectionRule
  提取器可参考 Extractor 的注释，流程上是定位 -> 提取 -> 处理

  规则编写流程：
  1. 先想好用户路径，整理出结构一致的视图，此类可以合并成一种规则
  2. 将 Rule 定义好，相似的可以复用
  3. 定义 Page，为用户路径上的每一个视图选择此前定义的规则 Rule
  4. 定义 Site，做好描述

  关于登录：
  目前的想法是打开登录页面，在登录完成后获得本页的 cookies 与 localstorage 等数据，此后发请求时都携带上
  但无法确定不同网站登录完成的信号，也无法确定登录后的凭证到底储存在哪？应该如何携带？

  WIP：
  1. 不同 Site，但是相同来源的场景（比如都是同站点），Site 应该能迁移，因为此时的作品 ID 都是一样的
*/

// 列表、搜索等 list 概念的页面都是通过 CollectionRule 爬取的，所以在展示上面需要用 DisplayMode 区分
export type DisplayMode = 'card' | 'collection' | 'tag' | 'text' | 'waterfall'

// 优化后的 SelectAction，我们称之为 Extractor
export interface Extractor {
  // mode: 'html' | 'json'。这个模式可以定义在规则的顶层，这里只负责解析
  
  // 对于 HTML 模式，这是 CSS 选择器
  // 对于 JSON 模式，这是 JSONPath 表达式 (e.g., "$.data.items[*]")
  selector: string; 

  // 从选中元素/对象中提取哪个部分
  // 'text': 元素的文本内容
  // 'html': 元素的内部HTML
  // 'outerHTML': 元素的完整HTML
  // 'value': JSON对象的值 (JSON模式下默认)
  // '@attr_name': 提取属性值, e.g., '@href', '@src'
  from?: 'text' | 'html' | 'outerHTML' | 'value' | string;

  // 后处理器链：按顺序对提取出的字符串进行处理
  processors?: Array<
    { type: 'regex', match: string, group?: number } | // 正则匹配，可选捕获组
    { type: 'replace', find: string, with: string } | // 字符串替换
    { type: 'prepend', value: string } | // 添加前缀
    { type: 'append', value: string } |  // 添加后缀
    { type: 'resolve' } // 解析 URL，将相对路径转为绝对路径
  >;
}

/* 关于规则定义格式：
  1. 平铺的结构表示**单一**提取器，如 idCode: Extractor
  2. 嵌套的结构表示**列表**提取器，如 items: { $: Extractor, idCode: Extractor }
    - 列表提取器必须包含一个 $ 提取器，表示元素自身，其余的提取器会应用到 $ 提取到的每一个元素上
  3. 不存在对象提取器，要么单一数据，要么列表数据，如果实在要表达“组”的概念，可使用命名区分，如：pagerNext: Extractor, pagerPrev: Extractor
  4. 不存在 [1, 2, 3] 这种简易的列表结构，如需列表，必须创建成对象列表的形式，参考 2
  
  基于以上四点，提取到的数据结构如下：
  {
    idCode: 'foo',
    items: [
      { idCode: 'bar' },
      { idCode: 'xyz' },
    ],
    pagerNext: 'https://example.com/next',
    pagerPrev: null,
  }
*/

// 通用的“集合”或“列表”页面规则
export interface CollectionRule {
  id: string;
  name: string;
  type: 'collection';

  // 新增：数据获取模式
  fetchMode: 'html' | 'json';

  // 应用在每个 item 上的字段提取规则
  items: {
    // 键是我们的标准字段名，值是提取器
    $: Extractor;
    idCode: Extractor;
    title: Extractor;
    description: Extractor;
    cover: Extractor;
    coverWidth: Extractor;
    coverHeight: Extractor;
    largeImage: Extractor;
    video: Extractor;
    category: Extractor;
    author: Extractor;
    uploader: Extractor;
    publishDate: Extractor;
    updateDate: Extractor;
    rating: Extractor;
    duration: Extractor;
    likes: Extractor;
    views: Extractor;
    totalPictures: Extractor;
    
    // 指向详情页的链接，这是关键的“下一步”指针
    detailUrl: Extractor; 
  };

  // 分页规则
  pager: {
    // prevPage: Extractor; // 通常提取的是 URL
    nextPage: Extractor; // 通常提取的是 URL
  };

  headers?: { key: string, value: string }[];
}

export interface PreviewRule {
  id: string;
  name: string;
  type: 'preview';
  fetchMode: 'html' | 'json';

  // 直接提取详情字段
  fields: {
    pages: Extractor; // 总页数
    totalPictures: Extractor; // 总图片数
  };

  // 分页规则
  pager: {
    // prevPage: Extractor; // 通常提取的是 URL
    nextPage: Extractor; // 通常提取的是 URL
  };

  // 嵌套的列表/集合规则
  pictures: {
    $: Extractor;
    url: Extractor;
  }
  videos: {
    $: Extractor;
    title: Extractor;
    cover: Extractor;
    url: Extractor;
  }

  headers?: { key: string, value: string }[];
}

// 详情页规则
export interface DetailRule {
  id: string;
  name: string;
  type: 'detail';
  fetchMode: 'html' | 'json';

  // 直接提取详情字段
  fields: {
    title: Extractor;
    description: Extractor;
    cover: Extractor;
    category: Extractor;
    rating: Extractor;
    totalPictures: Extractor;
    // coverWidth: Extractor;
    // coverHeight: Extractor;
    // largeImage: Extractor;
    // video: Extractor;
    author: Extractor;
    uploader: Extractor;
    publishDate: Extractor;
    updateDate: Extractor;
    likes: Extractor;
    views: Extractor;
  };

  // 分页规则
  pager: {
    // prevPage: Extractor; // 通常提取的是 URL
    nextPage: Extractor; // 通常提取的是 URL
  };

  // 嵌套的列表/集合规则
  tags: {
    $: Extractor;
    name: Extractor;
    url: Extractor;
  }
  chapters: {
    $: Extractor;
    idCode: Extractor;
    title: Extractor;
    url: Extractor;
    updateDate: Extractor;
  }
  pictures: {
    $: Extractor;
    thumbnail: Extractor;
    url: Extractor;
    pageUrl: Extractor;
  }
  videos: {
    $: Extractor;
    title: Extractor;
    cover: Extractor;
    url: Extractor;
  }
  comments: {
    $: Extractor;
    avatar: Extractor;
    username: Extractor;
    content: Extractor;
    date: Extractor;
    likes: Extractor;
  }

  headers?: { key: string, value: string }[];
}

export interface Site {
  id: string;
  namespace: string;
  dataVersion: number;

  common: {
    siteName: string
    siteIcon: string
    siteUrl: string
    author: string
    version: string
    description: string
    
    // 需要登录时打开这个页面登录
    loginUrl: string
    cookie: string
    token: string
    
    headless: boolean; // 无头浏览器模式，启用后 fetchMode 失效，默认使用 html 解析
    flags: string
  };

  detailRuleMap: {
    [ruleId: string]: DetailRule
  }

  collectionRuleMap: {
    [ruleId: string]: CollectionRule
  }

  previewRuleMap: {
    [ruleId: string]: PreviewRule
  }

  // 页面定义
  pages: Page[];
}

export type Rule = CollectionRule | DetailRule | PreviewRule;

export interface Page {
  id: string; // e.g., "romance_category"
  title: string; // e.g., "恋爱" - 用于在UI Tab上显示
  enabled: boolean; // 是否启用该 Page，默认启用

  common: {
    siteUrl: string
    flags: string
  }
  
  // --- 列表视图定义 ---
  // 定义了当用户进入这个 Page 时，首先看到的列表页的行为
  listView: {
    // 引用 CollectionRule ID
    ruleId: string; 
    // 该列表页的 URL
    url: string;
    // UI 展示模式
    displayMode: DisplayMode;
  };

  // --- 详情视图定义 ---
  // 定义了当用户在上面的 listView 中点击一个项目后，如何加载详情页
  detailView: {
    // 引用 DetailRule ID
    ruleId: string;
    url: string;
    // 注意：详情页的URL通常不是固定的模板，
    // 而是由 listView 的规则从列表项中提取出来的 (即我们定义的 `detailUrl` 字段)。
    // 所以这里不需要 urlTemplate。
  };
  
  // --- 预览/阅读视图定义 ---
  previewView?: {
    ruleId: string; // 引用一个 PreviewRule (或者也可是DetailRule的变种)
    url: string;
  };

  // --- （可选）该 Page 专属的搜索功能 ---
  // 如果每个分类下都有独立的搜索入口
  searchView?: {
    // 引用 Site.rules 中的一个 CollectionRule ID，用于解析搜索结果
    ruleId: string;
    // 搜索请求的 URL
    url: string;
  };

  // ... 其他页面元数据
  headers?: { key: string, value: string }[];
}