import useRuleStore from "@/store/rule"
import { genScrapingConfig, getBaseUrl } from "@/store/rule/utils"
import { LoaderFunctionArgs } from "react-router"
import { buildUrl } from "./utils"
import { reduce } from "lodash-es"

export function getScrapingConfig(params: LoaderFunctionArgs['params'], viewName: 'listView' | 'detailView' | 'searchView' | 'previewView' = 'listView') {
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

  const scrapingConfig = genScrapingConfig(site.id, page.id, viewName, {
    prevData: reduce(params, (acc, value, key) => {
      return {
        ...acc,
        [key]: value || '',
      }
    }, {}),
  })
  return {
    scrapingConfig,
    baseUrl: buildUrl(getBaseUrl(site, page), page[viewName]?.url || ''),
  }
}