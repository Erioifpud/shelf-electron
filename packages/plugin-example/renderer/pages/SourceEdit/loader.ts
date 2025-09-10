import useRuleStore from "@/store/rule"

export function sourceEditLoader({ params }) {
  const ruleState = useRuleStore.getState()
  return ruleState.sites.find(site => site.id === params.sourceId)
}

export async function sourceEditAction({ request, params }) {
  const ruleState = useRuleStore.getState()

  const updates = await request.json();

  ruleState.updateSite(params.sourceId, updates);

  return { ok: true }; 
}