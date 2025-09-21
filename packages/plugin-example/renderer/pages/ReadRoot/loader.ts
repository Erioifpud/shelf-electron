import useRuleStore from "@/store/rule"

export function readRootLoader({ params }) {
  const { sourceId } = params
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find((site) => site.id === sourceId)
  if (!site) {
    throw new Error("Site not found")
  }
  return {
    site,
  }
}