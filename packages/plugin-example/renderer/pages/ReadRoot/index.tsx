import Tabs from "@/components/Tabs";
import { Button } from "@/components/ui/button";
import { FlattenSiteProvider } from "@/context/ReadContext";
import { pageViewConfig } from "@/context/ReadContext/hook";
import { Page, Site } from "@/store/rule/type";
import { ArrowLeftIcon } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { useMatches } from "react-router";
import { Outlet, useLoaderData, useNavigate } from "react-router";

const BookListHeader = memo(() => {
  const { site } = useLoaderData<{ site: Site }>()
  const navigate = useNavigate()
  
  const tabs = useMemo(() => {
    return site.pages.map(page => ({
      label: page.title,
      key: page.id,
    }))
  }, [site])

  const handleTabChange = useCallback((key: string) => {
    navigate(`/read/${site.id}/pages/${key}`, {
      replace: true,
    })
  }, [navigate, site])

  return (
    <div className="flex relative gap-2 items-center">
      <div className="grow">
        <Tabs items={tabs} onChange={handleTabChange} />
      </div>
      <div className="shrink-0">
        {/* TODO: 搜索 */}
      </div>
    </div>
  )
})

const ROUTE_ID_MAP = {
  'read-list': BookListHeader
}

const Header = memo(() => {
  const matches = useMatches()
  
  const ToolbarComponent = useMemo(() => {
    const lastMatch = matches[matches.length - 1]
    const Component = ROUTE_ID_MAP[lastMatch?.id as keyof typeof ROUTE_ID_MAP]
    if (!Component) return null
    return Component
  }, [matches])

  return (
    <div className="flex relative shrink-0 gap-2 border-b border-gray-300 items-center p-2 select-none bg-gray-50">
      <div className="shrink-0">
        <Button variant="ghost" size="sm">
          <ArrowLeftIcon className="size-4" />
        </Button>
      </div>
      <div className="grow">
        {ToolbarComponent && <ToolbarComponent />}
      </div>
    </div>
  )
})

const ReadRoot = memo(() => {
  const { site } = useLoaderData<{ site: Site, page: Page }>()

  return (
    <FlattenSiteProvider
      site={site}
      config={pageViewConfig}
    >
      <div className="flex flex-col h-full relative">
        <Header />
        <div className="grow relative h-full outline-hidden">
          <Outlet />
        </div>
      </div>
    </FlattenSiteProvider>
  )
})

export default ReadRoot