import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { memo } from "react";
import SiteEdit from "./SiteEdit";

interface Props {

}

const SourceEdit = memo((props: Props) => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="site" className="w-full h-full flex flex-col">
        <TabsList className="rounded-none w-full shrink-0">
          <TabsTrigger value="site">通用设置</TabsTrigger>
          <TabsTrigger value="page">页面设置</TabsTrigger>
          <TabsTrigger value="rule">规则设置</TabsTrigger>
        </TabsList>
        <div className="grow h-full overflow-hidden">
          <TabsContent value="site" className="h-full overflow-hidden">
            <SiteEdit />
          </TabsContent>
          <TabsContent value="page">Change your password here.</TabsContent>
          <TabsContent value="rule">Change your password here.</TabsContent>
        </div>
      </Tabs>
    </div>
  )
})

export default SourceEdit