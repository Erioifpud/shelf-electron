import { getScrapingConfig } from "@/lib/loader"
import { getService } from "@eleplug/elep/renderer"
import { LoaderFunctionArgs } from "react-router"
import { CrawlerApi } from "src/crawler/api"

export async function bookDetailLoader({ params }: LoaderFunctionArgs) {
  const { scrapingConfig, baseUrl } = getScrapingConfig(params, 'detailView')

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