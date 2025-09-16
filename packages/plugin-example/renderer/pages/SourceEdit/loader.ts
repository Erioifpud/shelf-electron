import useRuleStore from "@/store/rule"
import { findRuleById, getDefaultPage, getDefaultSite } from "@/store/rule/utils";
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

export function pageEditLoader({ params }) {
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === params.sourceId)
  if (!site) {
    throw new Error('Site not found');
  }
  const page = site.pages.find(page => page.id === params.pageId)
  if (!page) {
    throw new Error('Page not found');
  }
  return {
    page,
    detailRules: Object.values(site.detailRuleMap),
    collectionRules: Object.values(site.collectionRuleMap),
    previewRules: Object.values(site.previewRuleMap),
  };
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

export async function pageEditAction({ request, params }) {
  const ruleState = useRuleStore.getState()
  const updates = await request.json();
  ruleState.updatePage(params.sourceId, params.pageId, updates);
  return { ok: true }; 
}

export async function pageRemoveAction({ request, params }) {
  const ruleState = useRuleStore.getState()
  ruleState.removePage(params.sourceId, params.pageId);
  return redirect(`/sources/${params.sourceId}/pages`);
}

// 规则相关

export function ruleListLoader({ params }) {
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === params.sourceId)
  if (!site) {
    throw new Error('Site not found');
  }
  return {
    detailRules: Object.values(site.detailRuleMap),
    collectionRules: Object.values(site.collectionRuleMap),
    previewRules: Object.values(site.previewRuleMap),
  };
}

export async function ruleCreateAction({ params, request }) {
  const sourceId = params.sourceId
  if (!sourceId) {
    throw new Error('Missing sourceId in params');
  }
  const ruleState = useRuleStore.getState()
  const payload = await request.json();
  ruleState.addRule(sourceId, payload);
  return { ok: true };
}

export function ruleEditLoader({ params }) {
  const ruleState = useRuleStore.getState()
  const site = ruleState.sites.find(site => site.id === params.sourceId)
  if (!site) {
    throw new Error('Site not found');
  }

  const rule = findRuleById(params.ruleId, site)
  return {
    rule,
    type: rule.type,
  };
}

export async function ruleEditAction({ request, params }) {
  const ruleState = useRuleStore.getState()
  const updates = await request.json();
  ruleState.updatePage(params.sourceId, params.pageId, updates);
  return { ok: true }; 
}