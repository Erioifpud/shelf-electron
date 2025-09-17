import { memo } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import ProcessorInput from "../ProcessorInput";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface ExtractorInputProps {
  name: string;
}

const ExtractorInput = memo(({ name }: ExtractorInputProps) => {
  const form = useFormContext();

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <FormField
        control={form.control}
        name={`${name}.selector`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>元素选择器</FormLabel>
            <FormControl>
              <Input placeholder="CSS Selector or JSONPath" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`${name}.from`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>值选择器</FormLabel>
            <FormControl>
              <Input placeholder="text, html, @href, etc." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`${name}.processors`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>后处理</FormLabel>
            <FormControl>
              <ProcessorInput name={field.name} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
});

export default ExtractorInput;
