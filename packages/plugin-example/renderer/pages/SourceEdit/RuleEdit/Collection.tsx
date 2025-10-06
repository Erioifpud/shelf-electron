import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CollectionRule } from "@/store/rule/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { cloneDeep } from "lodash-es";
import { memo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { extractorSchema } from "./utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ExtractorInput from "@/components/ExtractorInput";
import KeyValueInput from "@/components/KeyValueInput";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

const LABEL_MAP = {
  idCode: "作品 ID",
  title: "作品标题",
  description: "作品描述",
  cover: "封面",
  coverWidth: "封面宽度",
  coverHeight: "封面高度",
  largeImage: "大图",
  video: "视频",
  category: "分类",
  author: "作者",
  uploader: "上传者",
  publishDate: "发布日期",
  updateDate: "更新日期",
  rating: "评分",
  duration: "时长",
  likes: "点赞数",
  views: "浏览数",
  $: "项目",
  totalPictures: "总图片数",
  detailUrl: "详情页 URL",
  nextPage: "下一页",
}
  
const formSchema = z.object({
  name: z.string().min(1, { message: "规则名称不能为空" }),
  fetchMode: z.string(),
  items: z.object({
    $: extractorSchema(),
    idCode: extractorSchema(),
    title: extractorSchema(),
    description: extractorSchema(),
    cover: extractorSchema(),
    coverWidth: extractorSchema(),
    coverHeight: extractorSchema(),
    largeImage: extractorSchema(),
    video: extractorSchema(),
    category: extractorSchema(),
    author: extractorSchema(),
    uploader: extractorSchema(),
    publishDate: extractorSchema(),
    updateDate: extractorSchema(),
    rating: extractorSchema(),
    duration: extractorSchema(),
    likes: extractorSchema(),
    views: extractorSchema(),
    totalPictures: extractorSchema(),
    detailUrl: extractorSchema(),
  }),
  pager: z.object({
    nextPage: extractorSchema(),
  }),
  headers: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});
  
interface Props {
  rule: CollectionRule;
  onSubmit: (rule: CollectionRule) => void;
  onRemove: (type: string) => void;
  isSubmitting: boolean;
}

const Collection = memo((props: Props) => {
  const { rule, onRemove, onSubmit, isSubmitting } = props;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...cloneDeep(rule),
    },
  });

  const handleReset = useCallback(() => {
    form.reset();
  }, [form]);

  const handleSubmit = useCallback((values: z.infer<typeof formSchema>) => {
    console.log('🚀 ~ values:', values)
    const fullRule = {
      ...values,
      id: rule.id,
      type: rule.type,
    }
    // @ts-expect-error 表单验证过了
    onSubmit(fullRule);
  }, [onSubmit, rule.id, rule.type]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>规则名称</FormLabel>
              <FormControl>
                <Input placeholder="规则名称" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fetchMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>爬取模式</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择爬取模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                通常使用 HTML 模式即可，如果需要爬取 JSON 数据，请选择 JSON 模式，影响后续字段 Extractor 的解析方式
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium">项目</h3>
          <ExtractorInput name="items.$" />
        </div>

        <Separator />

        {/* Fields */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">字段</h3>
          {Object.keys(form.getValues().items).map((fieldName) => {
            if (fieldName === '$') return null;
            return (
              <FormItem key={fieldName}>
                {/* @ts-expect-error 没问题，找不到就显示原文 */}
                <FormLabel>{LABEL_MAP[fieldName] || fieldName}</FormLabel>
                <ExtractorInput name={`items.${fieldName}`} />
              </FormItem>
            )
          })}
        </div>

        <Separator />
        
        {/* Pager */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">分页</h3>
          <FormItem>
            <FormLabel>{LABEL_MAP['nextPage']}</FormLabel>
            <ExtractorInput name="pager.nextPage" />
          </FormItem>
        </div>

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
                优先级最高，会覆盖 Page 和 Site 配置
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button variant="destructive" type="reset" onClick={handleReset}>重置</Button>
          <Button variant="destructive" type="button" onClick={() => onRemove(rule.type)}>删除</Button>
          <div className="grow"></div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Form>
  );
});

export default Collection;