import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { memo, useMemo } from "react";
import { useLocation } from "react-router";
import { NavLink, Outlet } from "react-router";

const SourceEdit = memo(() => {
  const location = useLocation();

  const activeTab = useMemo(() => location.pathname.split('/').pop() || 'edit', [location.pathname])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs value={activeTab} defaultValue="edit" className="w-full h-full flex flex-col">
        <TabsList className="rounded-none w-full shrink-0">
          <TabsTrigger value="edit" asChild>
            <NavLink to="./edit">通用设置</NavLink>
          </TabsTrigger>
          <TabsTrigger value="pages">
            <NavLink to="./pages">页面设置</NavLink>
          </TabsTrigger>
          <TabsTrigger value="rules">
            <NavLink to="./rules">规则设置</NavLink>
          </TabsTrigger>
        </TabsList>
        <div className="grow h-full overflow-hidden">
          <Outlet />
        </div>
      </Tabs>
    </div>
  )
})

export default SourceEdit