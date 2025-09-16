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
import { DetailRule } from "@/store/rule/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { cloneDeep } from "lodash-es";
import { memo, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
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

const formSchema = z.object({
  name: z.string().min(1, { message: "规则名称不能为空" }),
  fetchMode: z.string(),
  fields: z.object({
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
  comments: z.object({
    item: extractorSchema(),
    avatar: extractorSchema(),
    username: extractorSchema(),
    content: extractorSchema(),
    date: extractorSchema(),
    likes: extractorSchema(),
  }),
  headers: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});

interface Props {
  rule: DetailRule;
}

const Detail = memo(({ rule }: Props) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...cloneDeep(rule),
    },
  });

  const handleSubmit = useCallback((data: z.infer<typeof formSchema>) => {
    console.log(data);
  }, []);

  const handleReset = useCallback(() => {
    form.reset();
  }, [form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rule Name</FormLabel>
              <FormControl>
                <Input placeholder="Rule Name" {...field} />
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
              <FormLabel>Fetch Mode</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a fetch mode" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        
        {/* Fields */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Fields</h3>
          {Object.keys(form.getValues().fields).map((fieldName) => (
            <FormItem key={fieldName}>
              <FormLabel>{fieldName}</FormLabel>
              <ExtractorInput name={`fields.${fieldName}`} />
            </FormItem>
          ))}
        </div>

        <Separator />
        
        {/* Pager */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Pager</h3>
          <FormItem>
              <FormLabel>nextPage</FormLabel>
              <ExtractorInput name="pager.nextPage" />
          </FormItem>
        </div>

        <Separator />

        {/* Tags, Chapters, etc. */}
        {["tags", "chapters", "pictures", "videos", "comments"].map((section) => (
            <div className="space-y-4" key={section}>
                <h3 className="text-lg font-medium">{section}</h3>
                {Object.keys(form.getValues()[section]).map((fieldName) => (
                    <FormItem key={`${section}.${fieldName}`}>
                        <FormLabel>{fieldName}</FormLabel>
                        <ExtractorInput name={`${section}.${fieldName}`} />
                    </FormItem>
                ))}
            </div>
        ))}


        <Separator />

        <FormField
          control={form.control}
          name="headers"
          render={() => (
            <FormItem>
              <FormLabel>HTTP Headers</FormLabel>
              <FormControl>
                <KeyValueInput name="headers" control={form.control} />
              </FormControl>
              <FormDescription>
                These headers will be sent with requests.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
            <Button variant="destructive" type="reset" onClick={handleReset}>Reset</Button>
            <div className="grow"></div>
            <Button type="submit">Save</Button>
        </div>
      </form>
    </Form>
  );
});

export default Detail;
