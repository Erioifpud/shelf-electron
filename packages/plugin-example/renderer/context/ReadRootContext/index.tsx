import { useMemo } from "react";
import { ReadRootContext } from "./context";
import { useParams } from "react-router";
import useRuleStore from "@/store/rule";


export const ReadRootProvider = ({ children }: { children: React.ReactNode }) => {
  const { sourceId = '', pageId = '' } = useParams();

  const sites = useRuleStore((state) => state.sites);

  const site = useMemo(() => {
    const item = sites.find((item) => item.id === sourceId);
    if (!item) {
      throw new Error('site not found')
    }
    return item;
  }, [sites, sourceId]);

  const page = useMemo(() => {
    const item = site.pages.find((item) => item.id === pageId);
    if (!item) {
      throw new Error('page not found')
    }
    return item;
  }, [site, pageId])

  const value = useMemo(() => {
    return {
      siteId: sourceId,
      pageId,
      currentSite: site,
      currentPage: page,
    }
  }, [sourceId, pageId])

  return (
    <ReadRootContext.Provider value={value}>
      {children}
    </ReadRootContext.Provider>
  )
}