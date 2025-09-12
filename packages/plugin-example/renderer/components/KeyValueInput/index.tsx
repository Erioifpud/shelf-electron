import { memo } from "react";
import { Control, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

interface KeyValueInputProps {
  name: string;
  control: any;
}

const KeyValueInput = memo(({ name, control }: KeyValueInputProps) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  return (
    <div>
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-center space-x-2 mb-2">
          <Input
            {...control.register(`${name}.${index}.key`)}
            placeholder="Key"
            className="flex-1"
          />
          <Input
            {...control.register(`${name}.${index}.value`)}
            placeholder="Value"
            className="flex-1"
          />
          <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        onClick={() => append({ key: "", value: "" })}
      >
        Add Header
      </Button>
    </div>
  );
});

export default KeyValueInput;
