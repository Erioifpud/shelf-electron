import { memo, useCallback, useEffect, useMemo } from "react";
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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFetcher, useLoaderData } from "react-router";
import { cloneDeep } from "lodash-es";
import { toast } from "sonner";
import { useModals } from "@/components/ModalManager";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  dataVersion: z.number().min(1),
  namespace: z.string().min(1, { message: "命名空间不能为空" }),
  common: z.object({
    author: z.string().optional(),
    cookie: z.string().optional(),
    description: z.string().optional(),
    flags: z.string().optional(),
    loginUrl: z.string().optional(),
    siteIcon: z.string().optional(),
    siteName: z.string().min(1, { message: "站点名称不能为空" }),
    siteUrl: z.string().optional(),
    token: z.string().optional(),
    version: z.string().optional(),
    headless: z.boolean().optional(),
  })
})

const SiteEdit = memo(() => {
  const initialData = useLoaderData();
  const fetcher = useFetcher();

  const modals = useModals()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...cloneDeep(initialData)
    },
  })

  const isSubmitting = useMemo(() => fetcher.state === "submitting", [fetcher])
  
  const handleSubmit = useCallback((values: z.infer<typeof formSchema>) => {
    fetcher.submit(values, {
      method: "post",
      encType: 'application/json'
    });
    toast.success('保存成功', { toasterId: 'global' })
  }, [fetcher])

  const handleReset = useCallback(() => {
    form.reset()
    toast.success('重置成功', { toasterId: 'global' })
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
          action: `/sources/${initialData.id}/edit/destroy`
        })
        toast.success('删除成功', { toasterId: 'global' })
      },
    })
  }, [modals])

  useEffect(() => {
    form.reset(initialData)
  }, [initialData])

  return (
    <div className="overflow-auto p-3 pb-5 h-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="namespace"
            render={({ field }) => (
              <FormItem>
                <FormLabel>命名空间</FormLabel>
                <FormControl>
                  <Input placeholder="站点插件的命名空间" {...field} />
                </FormControl>
                <FormDescription>
                  用于区分是否为相同插件，同一插件的命名空间固定不变，相同的插件可以进行数据转移
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dataVersion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>数据版本</FormLabel>
                <FormControl>
                  <Input placeholder="站点插件采用的数据版本" type="number" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点插件所用数据格式的版本，应用会以此为依据进行数据结构更新
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.siteIcon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>站点图标</FormLabel>
                <FormControl>
                  <Input placeholder="站点图标" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点的图标
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.siteName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>站点名称</FormLabel>
                <FormControl>
                  <Input placeholder="站点名称" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点的名称
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
                  当前站点的地址，填写后会用作请求时的 Base URL
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>插件描述</FormLabel>
                <FormControl>
                  <Textarea placeholder="插件描述" rows={5} {...field} />
                </FormControl>
                <FormDescription>
                  当前站点插件的介绍、注意事项等
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.author"
            render={({ field }) => (
              <FormItem>
                <FormLabel>插件作者</FormLabel>
                <FormControl>
                  <Input placeholder="插件作者" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点插件的作者
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.version"
            render={({ field }) => (
              <FormItem>
                <FormLabel>插件版本</FormLabel>
                <FormControl>
                  <Input placeholder="插件版本" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点插件的语义化版本
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.cookie"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cookie</FormLabel>
                <FormControl>
                  <Input placeholder="登录凭证 Cookie" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点的登录凭证（之一）
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cookie</FormLabel>
                <FormControl>
                  <Input placeholder="登录凭证 Token" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点的登录凭证（之一）
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.loginUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cookie</FormLabel>
                <FormControl>
                  <Input placeholder="登录地址" {...field} />
                </FormControl>
                <FormDescription>
                  当前站点的登录地址
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.headless"
            render={({ field }) => (
              <FormItem>
                <FormLabel>无头模式</FormLabel>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      return field.onChange(checked)
                    }}
                  />
                </FormControl>
                <FormDescription>
                  使用无头浏览器代替 AJAX，此时 JSON 标记会失效，按 HTML 模式解析
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="common.flags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>额外标记</FormLabel>
                <FormControl>
                  <Input placeholder="额外标记" {...field} />
                </FormControl>
                <FormDescription>
                  用于启用一些关于站点的特殊规则
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
  )
})

export default SiteEdit