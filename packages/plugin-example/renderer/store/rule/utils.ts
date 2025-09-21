import { CollectionRule, DetailRule, Extractor, Page, PreviewRule, Rule, Site } from "./type";

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

export function findRuleById(ruleId: string, site: Site): Rule {
  const store = new Map<string, Rule>([
    ...Object.entries({
      ...site.detailRuleMap,
      ...site.previewRuleMap,
      ...site.collectionRuleMap,
    }),
  ]);

  return store.get(ruleId)
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