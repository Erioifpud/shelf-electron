import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useRuleStore from "@/store/rule";
import { Site } from "@/store/rule/type";
import { EditIcon, PlusIcon, SearchIcon, ViewIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Outlet, useNavigate } from "react-router";

// 新建站点等同于创建一个空配置放入 store，再选中他的 id
const Source = memo(() => {
  const sites = useRuleStore(state => state.sites)

  const navigate = useNavigate()

  const toEditPage = useCallback((site: Site) => {
    navigate({
      pathname: `/sources/edit/${site.id}`
    })
  }, [navigate])

  return (
    <div className="flex h-full relative">
      <div className="flex flex-col shrink-0 h-full w-80 border-r border-gray-300">
        {/* 侧边栏内容 */}
        {/* 工具栏 */}
        <div className="p-4 border-b border-gray-300 shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="">Sources</div>
              <Button size="sm" variant="default">
                <PlusIcon className="h-4 w-4" /> New
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
              <div className="rounded-lg border border-gray-300 p-4 bg-gray-50 flex flex-col" key={site.id}>
                {/* 标题和状态 */}
                <div className="flex flex-nowrap gap-2 items-center">
                  <div className="grow truncate text-sm">
                    {site.common.siteName}
                  </div>
                  <div className="bg-green-100 text-green-600 font-semibold text-xs flex items-center px-2 py-2 rounded-sm">
                    ACTIVED
                  </div>
                </div>
                {/* 网址 */}
                <div className="text-xs text-gray-400">
                  {site.common.baseUrl}
                </div>
                {/* 三栏状态，如果有 */}
                {/* 工具栏 */}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="default" className="grow">
                    <ViewIcon className="h-4 w-4" /> Preview
                  </Button>
                  <Button size="sm" variant="outline" className="grow" onClick={() => toEditPage(site)}>
                    <EditIcon className="h-4 w-4" /> Edit
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="grow h-full outline-hidden relative">
        <Outlet />
      </div>
    </div>
  )
})

export default Source;