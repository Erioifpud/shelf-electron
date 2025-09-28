import { buildUrl } from "@/lib/utils"
import useRuleStore from "@/store/rule"
import { genScrapingConfig, getBaseUrl } from "@/store/rule/utils"
import { getService } from "@eleplug/elep/renderer"
import { LoaderFunctionArgs } from "react-router"
import { CrawlerApi } from "src/crawler/api"

function getScrapingConfig(params: LoaderFunctionArgs['params']) {
  const { sourceId, pageId } = params
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === sourceId)
  if (!site) {
    throw new Error(`Site not found for sourceId ${sourceId}`)
  }
  const pages = site.pages
  const page = pages.find(page => page.id === pageId)
  if (!page) {
    throw new Error(`Page not found for pageId ${pageId}`)
  }

  const scrapingConfig = genScrapingConfig(site.id, page.id, 'listView', {})
  return {
    scrapingConfig,
    baseUrl: buildUrl(getBaseUrl(site, page), page.listView.url),
  }
}

export async function booksLoader({ params }: LoaderFunctionArgs) {
  const { scrapingConfig, baseUrl } = getScrapingConfig(params)

  const service = await getService<CrawlerApi>()
  if (!scrapingConfig) {
    return {
      item: []
    }
  }
  const ret = await service.crawl.run.ask(scrapingConfig, {
    baseUrl,
  })

  return ret
}

export async function booksNextPageLoader({ params, request }: LoaderFunctionArgs) {
  let url = new URL(request.url);
  let nextPageUrl = url.searchParams.get("page");
  const { scrapingConfig, baseUrl } = getScrapingConfig(params)
  if (!scrapingConfig || !nextPageUrl) {
    return {
      item: []
    }
  }
  // 无需 buildUrl，因为能在 processor 中处理（如果有需要）
  scrapingConfig.url = nextPageUrl

  const service = await getService<CrawlerApi>()
  const ret = await service.crawl.run.ask(scrapingConfig, {
    baseUrl,
  })
  return ret
}