import useRuleStore from "@/store/rule"
import { getDefaultPage, getDefaultSite } from "@/store/rule/utils";
import { redirect } from "react-router";

// 站点相关

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

export async function sourceCreateAction({ request, params }) {
  const ruleState = useRuleStore.getState()

  const id = ruleState.addSite(getDefaultSite());

  return redirect(`/sources/${id}/edit`);
}

// 页面相关

export function pageListLoader({ params }) {
  const sourceId = params.sourceId
  if (!sourceId) {
    throw new Error('Missing sourceId in params');
  }
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === sourceId)
  if (!site) {
    throw new Error('Site not found');
  }
  return site.pages;
}

export function pageCreateAction({ params }) {
  const sourceId = params.sourceId
  if (!sourceId) {
    throw new Error('Missing sourceId in params');
  }
  const ruleState = useRuleStore.getState()
  ruleState.addPage(sourceId, getDefaultPage());
  return { ok: true };
}

export async function pageSortAction({ params, request }) {
  const sourceId = params.sourceId
  if (!sourceId) {
    throw new Error('Missing sourceId in params');
  }
  const ruleState = useRuleStore.getState()
  const payload = await request.json();
  ruleState.sortPages(payload.activeId, payload.overId);
  return { ok: true };
}