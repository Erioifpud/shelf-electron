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
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="regex">Regex</SelectItem>
                          <SelectItem value="replace">Replace</SelectItem>
                          <SelectItem value="prepend">Prepend</SelectItem>
                          <SelectItem value="append">Append</SelectItem>
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
                  render={({ field }) => <FormItem><FormLabel>Match</FormLabel><FormControl><Input placeholder="Regex pattern" {...field} /></FormControl></FormItem>}
                />
                <Controller
                  control={control}
                  name={`${name}.${index}.group`}
                  render={({ field }) => <FormItem><FormLabel>Group</FormLabel><FormControl><Input type="number" placeholder="Capture group index" {...field} /></FormControl></FormItem>}
                />
              </>
            )}

            {type === 'replace' && (
              <>
                <Controller
                  control={control}
                  name={`${name}.${index}.find`}
                  render={({ field }) => <FormItem><FormLabel>Find</FormLabel><FormControl><Input placeholder="String to find" {...field} /></FormControl></FormItem>}
                />
                <Controller
                  control={control}
                  name={`${name}.${index}.with`}
                  render={({ field }) => <FormItem><FormLabel>With</FormLabel><FormControl><Input placeholder="Replacement string" {...field} /></FormControl></FormItem>}
                />
              </>
            )}

            {(type === 'prepend' || type === 'append') && (
              <Controller
                control={control}
                name={`${name}.${index}.value`}
                render={({ field }) => <FormItem><FormLabel>Value</FormLabel><FormControl><Input placeholder="Value to add" {...field} /></FormControl></FormItem>}
              />
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
