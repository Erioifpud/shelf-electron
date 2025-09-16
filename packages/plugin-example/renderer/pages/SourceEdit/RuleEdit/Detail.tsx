import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DetailRule } from "@/store/rule/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { cloneDeep } from "lodash-es";
import { memo, useCallback } from "react";
import { Form, useForm } from "react-hook-form";
import z from "zod";
import { extractorSchema } from "./utils";

const formSchema = z.object({
  name: z.string().min(1, { message: "规则名称不能为空" }),
  fetchMode: z.string().optional(),
  field: z.object({
    title: extractorSchema(),
    description: extractorSchema(),
    cover: extractorSchema(),
    category: extractorSchema(),
    rating: extractorSchema(),
    totalPictures: extractorSchema(),
    author: extractorSchema(),
    uploader: extractorSchema(),
    publishDate: extractorSchema(),
    updateDate: extractorSchema(),
    likes: extractorSchema(),
    views: extractorSchema(),
  }),
  pager: z.object({
    nextPage: extractorSchema(),
  }),
  tags: z.object({
    item: extractorSchema(),
    name: extractorSchema(),
    url: extractorSchema(),
  }),
  chapters: z.object({
    item: extractorSchema(),
    idCode: extractorSchema(),
    title: extractorSchema(),
    url: extractorSchema(),
    updateDate: extractorSchema(),
  }),
  pictures: z.object({
    item: extractorSchema(),
    thumbnail: extractorSchema(),
    url: extractorSchema(),
    pageUrl: extractorSchema(),
  }),
  videos: z.object({
    item: extractorSchema(),
    title: extractorSchema(),
    cover: extractorSchema(),
    url: extractorSchema(),
  }),
  comments: {
    item: extractorSchema(),
    avatar: extractorSchema(),
    username: extractorSchema(),
    content: extractorSchema(),
    date: extractorSchema(),
    likes: extractorSchema(),
  },
  headers: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })),
})

interface Props {
  rule: DetailRule
}

const Detail = memo(({ rule }: Props) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...cloneDeep(rule),
    },
  })

  const handleSubmit = useCallback((data: z.infer<typeof formSchema>) => {
    
  }, [form])

  const handleReset = useCallback(() => {
    form.reset()
  }, [form])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* <FormField
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
        /> */}
      </form>
    </Form>
  );
})

export default Detail;