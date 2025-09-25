import { memo, useEffect, useMemo } from "react";
import { useLoaderData } from "react-router";
import { getService } from "@eleplug/elep/renderer";
import type { CrawlerApi } from "../../../src/crawler/api";
import { genScrapingConfig } from "@/store/rule/utils";
import { booksLoader } from "./loader";

const BookList = memo(() => {
  const { page, site } = useLoaderData<Awaited<ReturnType<typeof booksLoader>>>()

  const scrapingConfig = useMemo(() => {
    if (!site || !page) return null
    return genScrapingConfig(site.id, page.id, 'listView', {})
  }, [site, page])
  
  useEffect(() => {
    getService<CrawlerApi>().then(async (service) => {
      if (!scrapingConfig) return
      const ret = await service.crawl.run.ask(scrapingConfig)
      console.log(ret)
    })
  }, [])

  return (
    <div className="">books</div>
  )
})

export default BookList;