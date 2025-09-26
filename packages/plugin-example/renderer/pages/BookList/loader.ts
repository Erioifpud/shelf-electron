import useRuleStore from "@/store/rule"
import { genScrapingConfig } from "@/store/rule/utils"
import { getService } from "@eleplug/elep/renderer"
import { CrawlerApi } from "src/crawler/api"

interface Params {
  sourceId: string
  pageId: string
}

export async function booksLoader({ params }: { params: Params }) {
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

  const service = await getService<CrawlerApi>()
  if (!scrapingConfig) {
    return {
      item: []
    }
  }
  const ret = await service.crawl.run.ask(scrapingConfig)

  return ret
}