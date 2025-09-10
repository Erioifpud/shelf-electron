import useRuleStore from "@/store/rule"

export function sourceEditLoader({ params }) {
  const ruleState = useRuleStore.getState()
  return ruleState.sites.find(site => site.id === params.sourceId)
}