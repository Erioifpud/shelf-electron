import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { memo } from "react";
import { useLoaderData } from "react-router";
import SiteEdit from "./SiteEdit";

interface Props {

}

const SourceEdit = memo((props: Props) => {
  const currentSite = useLoaderData()
  


  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="site" className="w-full h-full">
        <TabsList className="rounded-none w-full">
          <TabsTrigger value="site">通用设置</TabsTrigger>
          <TabsTrigger value="page">页面设置</TabsTrigger>
          <TabsTrigger value="rule">规则设置</TabsTrigger>
        </TabsList>
        <TabsContent value="site">
          <SiteEdit />
        </TabsContent>
        <TabsContent value="page">Change your password here.</TabsContent>
        <TabsContent value="rule">Change your password here.</TabsContent>
      </Tabs>
    </div>
  )
})

export default SourceEdit