import { getScrapingConfig } from "@/lib/loader"
import { getEmptyCollectionValue } from "@/store/rule/utils"
import { getService } from "@eleplug/elep/renderer"
import { LoaderFunctionArgs } from "react-router"
import { CrawlerApi } from "src/crawler/api"

export async function booksLoader({ params }: LoaderFunctionArgs) {
  const { scrapingConfig, baseUrl } = getScrapingConfig(params)

  const service = await getService<CrawlerApi>()
  if (!scrapingConfig) {
    return getEmptyCollectionValue()
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
    return getEmptyCollectionValue()
  }
  // 无需 buildUrl，因为能在 processor 中处理（如果有需要）
  scrapingConfig.url = nextPageUrl

  const service = await getService<CrawlerApi>()
  const ret = await service.crawl.run.ask(scrapingConfig, {
    baseUrl,
  })
  return ret
}