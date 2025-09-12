import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { CollectionRule, DetailRule, Page, PreviewRule } from "@/store/rule/type";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { cloneDeep } from "lodash-es";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import KeyValueInput from "@/components/KeyValueInput";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useModals } from "@/components/ModalManager";

const ANIMATION_DURATION = 500;

const formSchema = z.object({
  title: z.string().min(1, { message: "页面标题不能为空" }),
  enabled: z.boolean(),
  common: z.object({
    siteUrl: z.string().optional(),
    flags: z.string().optional(),
  }),
  listView: z.object({
    ruleId: z.string().optional(),
    url: z.string().optional(),
    displayMode: z.string().optional(),
  }),
  detailView: z.object({
    ruleId: z.string().optional(),
    url: z.string().optional(),
  }),
  previewView: z.object({
    ruleId: z.string().optional(),
    url: z.string().optional(),
  }),
  searchView: z.object({
    ruleId: z.string().optional(),
    url: z.string().optional(),
  }),
  headers: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })),
})

interface LoaderData {
  page: Page
  rules: {
    [ruleId: string]: CollectionRule | DetailRule | PreviewRule;
  }
  detailRules: DetailRule[]
  collectionRules: CollectionRule[]
  previewRules: PreviewRule[]
}

const PageEdit = memo(() => {
  const navigate = useNavigate();
  const { page: initialPage, detailRules, collectionRules, previewRules } = useLoaderData<LoaderData>();
  const fetcher = useFetcher()
  const modals = useModals()

  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...cloneDeep(initialPage),
      headers: Object.entries(initialPage.headers || {}).map(([key, value]) => ({ key, value })),
    },
  })

  const isSubmitting = useMemo(() => fetcher.state === "submitting", [fetcher])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 10); 
    return () => clearTimeout(timer);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);

    setTimeout(() => {
      navigate(-1); 
    }, ANIMATION_DURATION);
  }, [])

  const handleSubmit = useCallback((values: z.infer<typeof formSchema>) => {
    fetcher.submit(values, {
      method: "post",
      encType: 'application/json'
    });
    toast.success('保存成功')
  }, [fetcher])
  
  const handleReset = useCallback(() => {
    form.reset()
    toast.success('重置成功')
  }, [form])

  const handleRemove = useCallback(() => {
    modals.openConfirmModal({
      title: '删除确认',
      children: (
        <div className="">确定要删除该站点规则吗？删除后将无法找回</div>
      ),
      labels: {
        confirm: '确认',
        cancel: '取消'
      },
      onConfirm() {
        fetcher.submit(null, {
          method: 'post',
          action: `/sources/${initialPage.id}/edit/destroy`
        })
        toast.success('删除成功')
      },
    })
  }, [])

  return (
    <Drawer
      direction="right"
      open={isOpen}
      onClose={handleClose}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{initialPage.title}</DrawerTitle>
          <DrawerDescription>编辑页面信息</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>页面标题</FormLabel>
                    <FormControl>
                      <Input placeholder="页面的标题" {...field} />
                    </FormControl>
                    <FormDescription>
                      显示在列表页上方，作为 Tab 区分不同类目/来源下的列表
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="common.siteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>站点地址</FormLabel>
                    <FormControl>
                      <Input placeholder="站点地址" {...field} />
                    </FormControl>
                    <FormDescription>
                      当前站点的地址，填写后会用作请求时的 Base URL（覆盖 Site 设置）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>页面启用</FormLabel>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          return field.onChange(checked)
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      只有启用了的页面才会显示在 Tab 中
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ListView */}
              <Separator />
              <FormField
                control={form.control}
                name="listView.ruleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>列表页规则</FormLabel>
                    <FormControl>
                      <Select { ...field } value={field.value} onValueChange={ev => form.setValue(field.name, ev)}>
                        <SelectTrigger className="">
                          <SelectValue placeholder="列表页规则" />
                        </SelectTrigger>
                        <SelectContent>
                          {collectionRules.map(rule => {
                            return (
                              <SelectItem value={rule.id} key={rule.id}>{rule.name}</SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      列表页将会作为浏览时的首页进行显示
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="listView.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>列表页 URL</FormLabel>
                    <FormControl>
                      <Input placeholder="列表页 URL" {...field} />
                    </FormControl>
                    <FormDescription>
                      访问列表页数据使用的 URL，优先采用规则内采集到的，其次才是 Page 中定义的
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="listView.displayMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>布局</FormLabel>
                    <FormControl>
                      <Select { ...field } value={field.value} onValueChange={ev => form.setValue(field.name, ev)}>
                        <SelectTrigger className="">
                          <SelectValue placeholder="Theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="collection">Collection</SelectItem>
                          <SelectItem value="tag">Tag</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="waterfall">Waterfall</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      列表页数据的展示布局
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* DetailView */}
              <Separator />
              <FormField
                control={form.control}
                name="detailView.ruleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>详情页规则</FormLabel>
                    <FormControl>
                      <Select { ...field } value={field.value} onValueChange={ev => form.setValue(field.name, ev)}>
                        <SelectTrigger className="">
                          <SelectValue placeholder="详情页规则" />
                        </SelectTrigger>
                        <SelectContent>
                          {detailRules.map(rule => {
                            return (
                              <SelectItem value={rule.id} key={rule.id}>{rule.name}</SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      详情页将会作为列表页的下一级，用于展示书本的详情信息
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="detailView.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>详情页 URL</FormLabel>
                    <FormControl>
                      <Input placeholder="详情页 URL" {...field} />
                    </FormControl>
                    <FormDescription>
                      访问详情页数据使用的 URL，优先采用规则内采集到的，其次才是 Page 中定义的
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* PreviewView */}
              <Separator />
              <FormField
                control={form.control}
                name="previewView.ruleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>浏览页规则</FormLabel>
                    <FormControl>
                      <Select { ...field } value={field.value} onValueChange={ev => form.setValue(field.name, ev)}>
                        <SelectTrigger className="">
                          <SelectValue placeholder="浏览页规则" />
                        </SelectTrigger>
                        <SelectContent>
                          {previewRules.map(rule => {
                            return (
                              <SelectItem value={rule.id} key={rule.id}>{rule.name}</SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      浏览页将会作为浏览时的首页进行显示
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="previewView.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>浏览页 URL</FormLabel>
                    <FormControl>
                      <Input placeholder="浏览页 URL" {...field} />
                    </FormControl>
                    <FormDescription>
                      访问浏览页数据使用的 URL，优先采用规则内采集到的，其次才是 Page 中定义的
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SearchView */}
              <Separator />
              <FormField
                control={form.control}
                name="searchView.ruleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>搜索页规则</FormLabel>
                    <FormControl>
                      <Select { ...field } value={field.value} onValueChange={ev => form.setValue(field.name, ev)}>
                        <SelectTrigger className="">
                          <SelectValue placeholder="搜索页规则" />
                        </SelectTrigger>
                        <SelectContent>
                          {collectionRules.map(rule => {
                            return (
                              <SelectItem value={rule.id} key={rule.id}>{rule.name}</SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      搜索页将会作为浏览时的首页进行显示
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="searchView.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>搜索页 URL</FormLabel>
                    <FormControl>
                      <Input placeholder="搜索页 URL" {...field} />
                    </FormControl>
                    <FormDescription>
                      访问搜索页数据使用的 URL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* HTTP 头 */}
              <Separator />
              <FormField
                control={form.control}
                name="headers"
                render={() => (
                  <FormItem>
                    <FormLabel>HTTP 头</FormLabel>
                    <FormControl>
                      <KeyValueInput name="headers" control={form.control} />
                    </FormControl>
                    <FormDescription>
                      请求时会带上这些 HTTP 头
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <div className="flex gap-2">
              <Button variant="destructive" type="reset" onClick={handleReset}>重置</Button>
              <Button variant="destructive" type="button" onClick={handleRemove}>删除</Button>
              <div className="grow"></div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "保存"}
              </Button>
            </div>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  )
})

export default PageEdit