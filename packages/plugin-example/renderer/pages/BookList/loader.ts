import useRuleStore from "@/store/rule"
import { genScrapingConfig } from "@/store/rule/utils"
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
  return scrapingConfig
}

export async function booksLoader({ params }: LoaderFunctionArgs) {
  const scrapingConfig = getScrapingConfig(params)

  const service = await getService<CrawlerApi>()
  if (!scrapingConfig) {
    return {
      item: []
    }
  }
  const ret = await service.crawl.run.ask(scrapingConfig)

  return ret
}

export async function booksNextPageLoader({ params, request }: LoaderFunctionArgs) {
  let url = new URL(request.url);
  let nextPageUrl = url.searchParams.get("page");
  const scrapingConfig = getScrapingConfig(params)
  if (!scrapingConfig || !nextPageUrl) {
    return {
      item: []
    }
  }
  scrapingConfig.url = nextPageUrl

  const service = await getService<CrawlerApi>()
  const ret = await service.crawl.run.ask(scrapingConfig)
  return ret
}