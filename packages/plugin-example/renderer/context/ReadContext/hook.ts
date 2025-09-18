import { useContext } from "react";
import { FlattenSite, ReadContext, ViewRefConfig } from "./context";
import { Page, Site } from "@/store/rule/type";

export function useFlattenSite<
  S extends { pages: any[] },
  C extends ViewRefConfig<S, S['pages'][number]>
>() {
  return useContext(ReadContext) as FlattenSite<S, C>;
}

export const pageViewConfig = {
  listView: 'collectionRuleMap',
  detailView: 'detailRuleMap',
  previewView: 'previewRuleMap',
  searchView: 'collectionRuleMap',
} as const satisfies ViewRefConfig<Site, Page>;