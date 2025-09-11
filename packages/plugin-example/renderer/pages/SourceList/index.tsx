import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import useRuleStore from "@/store/rule";
import { Site } from "@/store/rule/type";
import { EditIcon, PlusIcon, SearchIcon, ViewIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Outlet, useFetcher, useNavigate } from "react-router";

interface SiteCardProps {
  site: Site
  onEditClick: (site: Site) => void
  className?: HTMLDivElement['className']
}

const SiteCard = memo(({ site, className = '', onEditClick }: SiteCardProps) => {
  return (
    <Tooltip key={site.id}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'rounded-lg border border-gray-300 p-4 bg-gray-50 flex flex-col',
            className,
          )}
        >
          {/* 标题和状态 */}
          <div className="flex flex-nowrap gap-2 items-center">
            <div className="grow truncate text-sm">
              {site.common.siteName}
            </div>
            <div className="bg-green-100 text-green-600 font-semibold text-xs flex items-center px-2 py-2 rounded-sm">
              {site.common.version}
            </div>
          </div>
          {/* 网址 */}
          <div className="text-xs text-gray-400">
            {site.common.siteUrl}
          </div>
          {/* 三栏状态，如果有 */}
          {/* 工具栏 */}
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="default" className="grow">
              <ViewIcon className="h-4 w-4" /> Preview
            </Button>
            <Button size="sm" variant="outline" className="grow" onClick={() => onEditClick(site)}>
              <EditIcon className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </TooltipTrigger>
      {!!site.common.description.trim() && (
        <TooltipContent>
          <p>{site.common.description.trim()}</p>
        </TooltipContent>
      )}
    </Tooltip> 
  )
})

// 新建站点等同于创建一个空配置放入 store，再选中他的 id
const Source = memo(() => {
  const sites = useRuleStore(state => state.sites)

  const navigate = useNavigate()
  const fetcher = useFetcher()
  const params = useParams()

  const toEditPage = useCallback((site: Site) => {
    navigate({
      pathname: `/sources/${site.id}/edit`
    })
  }, [navigate])

  const handleCreate = useCallback(() => {
    fetcher.submit(null, {
      method: 'post',
      action: '/sources/create'
    })
  }, [fetcher])

  const isCreating = useMemo(() => fetcher.state === 'submitting', [fetcher])

  return (
    <div className="flex h-full relative">
      <div className="flex flex-col shrink-0 h-full w-80 border-r border-gray-300">
        {/* 侧边栏内容 */}
        {/* 工具栏 */}
        <div className="p-4 border-b border-gray-300 shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="">Sources</div>
              <Button size="sm" variant="default" onClick={handleCreate} disabled={isCreating}>
                <PlusIcon className="h-4 w-4" />
                {isCreating ? '创建中...' : '新建'}
              </Button>
            </div>
            {/* 搜索 */}
            <Input placeholder="Search sources..." startIcon={SearchIcon} />
          </div>
        </div>
        {/* 列表 */}
        <div className="grow h-full flex flex-col overflow-auto gap-3 p-3">
          {sites.map(site => {
            return (
              <SiteCard
                key={site.id}
                site={site}
                onEditClick={toEditPage}
                className={cn(
                  'transition-shadow',
                  params.sourceId === site.id && 'shadow shadow-primary/20'
                )}
              />
            )
          })}
        </div>
      </div>
      <div className="grow h-full outline-hidden relative">
        <Outlet />
      </div>
      <Toaster position="top-right" richColors />
    </div>
  )
})

export default Source;