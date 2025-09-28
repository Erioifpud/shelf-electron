import { memo } from "react";
import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { FormItem, FormLabel, FormControl } from "@/components/ui/form";

interface ProcessorInputProps {
  name: string;
}

const ProcessorInput = memo(({ name }: ProcessorInputProps) => {
  const { control, watch } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  const watchFieldArray = watch(name);
  const controlledFields = fields.map((field, index) => {
    return {
      ...field,
      ...watchFieldArray[index]
    };
  });

  return (
    <div className="space-y-4">
      {controlledFields.map((field, index) => {
        const type = field.type;
        return (
          <div key={field.id} className="p-3 border rounded-md space-y-3">
            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <Controller
                  control={control}
                  name={`${name}.${index}.type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>类型</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="regex">正则</SelectItem>
                          <SelectItem value="replace">替换</SelectItem>
                          <SelectItem value="prepend">开头新增</SelectItem>
                          <SelectItem value="append">末尾新增</SelectItem>
                          <SelectItem value="resolve">组合完整 URL</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            {type === 'regex' && (
              <>
                <Controller
                  control={control}
                  name={`${name}.${index}.match`}
                  render={({ field }) => <FormItem><FormLabel>匹配</FormLabel><FormControl><Input placeholder="正则表达式" {...field} /></FormControl></FormItem>}
                />
                <Controller
                  control={control}
                  name={`${name}.${index}.group`}
                  render={({ field }) => <FormItem><FormLabel>分组</FormLabel><FormControl><Input type="number" placeholder="捕获分组的索引" {...field} /></FormControl></FormItem>}
                />
              </>
            )}

            {type === 'replace' && (
              <>
                <Controller
                  control={control}
                  name={`${name}.${index}.find`}
                  render={({ field }) => <FormItem><FormLabel>查找</FormLabel><FormControl><Input placeholder="要找的内容" {...field} /></FormControl></FormItem>}
                />
                <Controller
                  control={control}
                  name={`${name}.${index}.with`}
                  render={({ field }) => <FormItem><FormLabel>替换</FormLabel><FormControl><Input placeholder="替换为的内容" {...field} /></FormControl></FormItem>}
                />
              </>
            )}

            {(type === 'prepend' || type === 'append') && (
              <Controller
                control={control}
                name={`${name}.${index}.value`}
                render={({ field }) => <FormItem><FormLabel>内容</FormLabel><FormControl><Input placeholder="新增的内容" {...field} /></FormControl></FormItem>}
              />
            )}

            {type === 'resolve' && (
              <div className="text-xs text-gray-500">使用 siteUrl 作为 BaseURL 组合出绝对地址</div>
            )}
          </div>
        )
      })}
      <Button
        type="button"
        size="sm"
        onClick={() => append({ type: "regex", match: "" })}
      >
        Add Processor
      </Button>
    </div>
  );
});

export default ProcessorInput;
