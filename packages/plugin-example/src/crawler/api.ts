import { rpc } from "@eleplug/elep/main";

export const crawlerApi = {
  crawl: {
    test: rpc.ask((_, payload) => {
      console.log("run crawler", payload);
      return 123;
    })
  }
}

export type CrawlerApi = typeof crawlerApi;