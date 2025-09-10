import useRuleStore from "@/store/rule"
import { redirect } from "react-router";

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

export async function sourceRemoveAction({ request, params }) {
  const ruleState = useRuleStore.getState()

  ruleState.removeSite(params.sourceId);

  return redirect(`/sources`);
}