import useRuleStore from "@/store/rule"

export function booksLoader({ params }) {
  const { sourceId, pageId } = params
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === sourceId)
  if (!site) {
    throw new Error(`Site not found for sourceId ${sourceId}`)
  }
  const pages = site.pages
  const page = pages.find(page => page.id === pageId)

  return {
    page,
    site,
  }
}