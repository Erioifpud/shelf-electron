import { Page, Site } from "@/store/rule/type";
import { createContext } from "react";

interface ContextValue {
  currentSite: Site;
  currentPage: Page;
  siteId: string;
  pageId: string;
}

export const ReadRootContext = createContext<ContextValue>({
  currentSite: {} as Site,
  currentPage: {} as Page,
  siteId: "",
  pageId: "",
});
