import { rpc } from "@eleplug/elep/main";
import { CrawlerEngine, CrawlerEngineOptions } from "./CrawlerEngine";
import type { ScrapingConfig } from "./type";

export const crawlerApi = {
  crawl: {
    test: rpc.ask((_, payload) => {
      console.log("run crawler", payload);
      return 123;
    }),
    run: rpc.ask((_, config: any, engineOptions?: CrawlerEngineOptions) => {
      const engine = new CrawlerEngine(engineOptions || {});
      return engine.run(config as ScrapingConfig);
    })
  }
}

export type CrawlerApi = typeof crawlerApi;