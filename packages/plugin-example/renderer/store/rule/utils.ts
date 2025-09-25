import type { ExtractionRule, ScrapingConfig } from "../../../src/crawler/type";
import type { CollectionRule, DetailRule, Extractor, Page, PreviewRule, Rule, Site } from "./type";
import { reduce, template } from 'lodash-es'
import useRuleStore from ".";

export function getDefaultSite(): Omit<Site, 'id'> {
  return {
    dataVersion: 1,
    namespace: 'com.example.newsite',
    common: {
      author: '佚名',
      cookie: '',
      description: '这是一个示例源',
      flags: '',
      loginUrl: '',
      siteIcon: '',
      siteName: '示例源',
      siteUrl: 'https://www.example.com',
      token: '',
      version: '1.0.0',
      headless: false,
    },
    detailRuleMap: {},
    collectionRuleMap: {},
    previewRuleMap: {},
    pages: [],
  }
}

export function getDefaultPage(): Omit<Page, 'id'> {
  return {
    title: '新页面',
    enabled: true,
    common: {
      siteUrl: '',
      flags: '',
    },
    listView: {
      ruleId: '',
      url: '',
      displayMode: 'card',
    },
    detailView: {
      ruleId: '',
      url: '',
    },
    previewView: {
      ruleId: '',
      url: '',
    },
    searchView: {
      ruleId: '',
      url: '',
    },
  }
}

function extractor(): Extractor {
  return {
    selector: '',
    from: 'text',
    processors: [],
  }
}

export function getDefaultCollectionRule(): Omit<CollectionRule, 'id'> {
  return {
    name: '新建列表规则',
    type: 'collection',
    fetchMode: 'html',
    item: extractor(),
    fields: {
      idCode: extractor(),
      title: extractor(),
      description: extractor(),
      cover: extractor(),
      coverWidth: extractor(),
      coverHeight: extractor(),
      largeImage: extractor(),
      video: extractor(),
      category: extractor(),
      author: extractor(),
      uploader: extractor(),
      publishDate: extractor(),
      updateDate: extractor(),
      rating: extractor(),
      duration: extractor(),
      likes: extractor(),
      views: extractor(),
      totalPictures: extractor(),
      detailUrl: extractor(),
    },
    pager: {
      nextPage: extractor(),
    },
    headers: [],
  }
}

export function getDefaultDetailRule(): Omit<DetailRule, 'id'> {
  return {
    name: '新建详情规则',
    type: 'detail',
    fetchMode: 'html',
    fields: {
      title: extractor(),
      description: extractor(),
      cover: extractor(),
      category: extractor(),
      rating: extractor(),
      totalPictures: extractor(),
      author: extractor(),
      uploader: extractor(),
      publishDate: extractor(),
      updateDate: extractor(),
      likes: extractor(),
      views: extractor(),
    },
    pager: {
      nextPage: extractor(),
    },
    headers: [],
    tags: {
      item: extractor(),
      name: extractor(),
      url: extractor(),
    },
    chapters: {
      item: extractor(),
      url: extractor(),
      title: extractor(),
      idCode: extractor(),
      updateDate: extractor(),
    },
    pictures: {
      item: extractor(),
      url: extractor(),
      thumbnail: extractor(),
      pageUrl: extractor(),
    },
    videos: {
      item: extractor(),
      url: extractor(),
      cover: extractor(),
      title: extractor(),
    },
    comments: {
      item: extractor(),
      avatar: extractor(),
      content: extractor(),
      username: extractor(),
      date: extractor(),
      likes: extractor(),
    }
  }
}

export function getDefaultPreviewRule(): Omit<PreviewRule, 'id'> {
  return {
    name: '新建预览规则',
    type: 'preview',
    fetchMode: 'html',
    fields: {
      pages: extractor(),
      totalPictures: extractor(),
    },
    headers: [],
    pager: {
      nextPage: extractor(),
    },
    pictures: {
      item: extractor(),
      url: extractor(),
    },
    videos: {
      item: extractor(),
      url: extractor(),
      cover: extractor(),
      title: extractor(),
    }
  }
}

export function findRuleById(ruleId: string, site: Site): Rule | null {
  const store = new Map<string, Rule>([
    ...Object.entries({
      ...site.detailRuleMap,
      ...site.previewRuleMap,
      ...site.collectionRuleMap,
    }),
  ]);

  return store.get(ruleId) || null
}

interface RecheckResult {
  success: boolean,
  message: string,
}

// 检查 Site 的内容是否合法，比如 Page 链接的 Rule 是否存在
export function recheckSite(site: Site): RecheckResult {
  const pages = site.pages
  if (!pages || pages.length === 0) {
    return {
      success: false,
      message: '该站点配置没有页面',
    }
  }
  for (const page of pages) {
    const { listView, detailView, previewView, searchView } = page
    const rules = [listView, detailView, previewView, searchView]
    for (const rule of rules) {
      if (!rule) continue
      const ruleId = rule.ruleId
      if (!ruleId) continue
      if (!findRuleById(ruleId, site)) {
        return {
          success: false,
          message: `Page ${page.title} 中引用的 Rule ${ruleId} 不存在`,
        }
      }
    }
  }
  return {
    success: true,
    message: '检查通过',
  }
}

export function getSiteById(siteId: string): Site | null {
  const state = useRuleStore.getState()
  const site = state.sites.find((site) => site.id === siteId)
  return site || null
}

export function getPageById(siteId: string, pageId: string): Page | null {
  const site = getSiteById(siteId)
  if (!site) return null
  const page = site.pages.find((page) => page.id === pageId)
  return page || null
}

type KeysEndingWith<T, Suffix extends string> = {
  [K in keyof T]:
    K extends `${string}${Suffix}`
      ? K
      : never
}[keyof T]

function compileUrl(url: string, data: Record<string, string>): string {
  const compiled = template(url)
  return compiled(data)
}

interface ScrapingConfigOptions {
  prevData?: Record<string, string>
}

type ViewName = 'listView' | 'detailView' | 'previewView' | 'searchView'

function getViewRule(site: Site, page: Page, viewName: ViewName): Rule | null {
  if (!page || !site) return null
  const rule = page[viewName]
  if (!rule) return null
  return findRuleById(rule.ruleId, site) || null
}

function getHeaders(page: Page, rule: Rule) {
  let headers = rule.headers
  if (!headers || headers.length === 0) {
    headers = page.headers
  }
  return headers
}

function parseRuleFields<R extends Rule>(rule: R, scope: Record<string, Extractor> = rule.fields, blackList: string[] = []): ExtractionRule[] {
  const extractionRules = reduce<Record<string, Extractor>, ExtractionRule[]>(scope, (acc, extractor, key) => {
    if (blackList.includes(key)) return acc
    acc.push({
      name: key,
      selector: extractor.selector,
      type: rule.fetchMode === 'json' ? 'json' : 'xpath',
      from: extractor.from,
      processors: extractor.processors,
    })
    return acc
  }, [])
  return extractionRules
}

function convertToExtractionRule(rule: Rule): ExtractionRule[] {
  const configs: ExtractionRule[] = []
  if (rule.type === 'collection') {
    const itemRule: ExtractionRule = {
      name: 'item',
      selector: rule.item.selector,
      type: rule.fetchMode === 'json' ? 'json' : 'xpath',
      from: rule.item.from,
      processors: rule.item.processors,
      items: [],
    }
    // collectionRule fields 的所有字段都是 item 的子字段
    itemRule.items = parseRuleFields(rule)
    configs.push(itemRule)
    return configs
  }

  let nestedFieldNames: string[] = []
  if (rule.type === 'detail') {
    nestedFieldNames = ['pager', 'tags', 'pictures', 'videos', 'chapters', 'comments'] as const
  } else if (rule.type === 'preview') {
    nestedFieldNames = ['pager', 'pictures', 'videos'] as const
  }

  // detailRule fields 的所有字段都是平铺的
  configs.push(...parseRuleFields(rule))
  // detailRule 的 items 存在部分嵌套对象中
  nestedFieldNames.forEach((key) => {
    // @ts-expect-error
    let fields = rule[key] as Record<string, Extractor> | null
    if (!fields) {
      return
    }
    const item: ExtractionRule = {
      name: key,
      selector: fields.item.selector,
      type: rule.fetchMode === 'json' ? 'json' : 'xpath',
      from: fields.item.from,
      processors: fields.item.processors,
      items: [],
    }
    item.items = parseRuleFields(rule, fields, ['item'])
    configs.push(item)
  })
  return configs
}

export function genScrapingConfig(siteId: string, pageId: string, viewName: ViewName, options: ScrapingConfigOptions): ScrapingConfig | null {
  const { prevData } = options

  const site = getSiteById(siteId)
  if (!site) return null
  const page = getPageById(siteId, pageId)
  if (!page) return null
  const view = page[viewName]
  if (!view) return null
  const rule = getViewRule(site, page, viewName)
  if (!rule) return null

  // const cookie = site.common.cookie || ''
  const headers = getHeaders(page, rule)
  const isHeadless = site.common.headless
  const subMode = rule.fetchMode === 'json' ? 'json' : 'xpath'

  const extractionRules = convertToExtractionRule(rule)
  return {
    url: compileUrl(view.url, prevData || {}),
    mode: isHeadless ? 'headless' : 'ajax',
    // TODO: 可能得换一种格式，CustomCookie 构建比较复杂
    cookies: [],
    headers: headers?.reduce<Record<string, string>>((acc, header) => {
      acc[header.key] = header.value
      return acc
    }, {}),
    subMode,
    items: extractionRules,
  }
  
}
