import { memo, useEffect } from "react";
import { useLoaderData } from "react-router";
import { getService } from "@eleplug/elep/renderer";
import type { CrawlerApi } from "../../../src/crawler/api";

const BookList = memo(() => {
  const { page, site } = useLoaderData()

  useEffect(() => {
    getService<CrawlerApi>().then(async (service) => {
      const ret = await service.crawl.test.ask({
        site,
        page
      })
      console.log(ret)
    })
  })

  return (
    <div className="">books</div>
  )
})

export default BookList;