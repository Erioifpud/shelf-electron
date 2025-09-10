import { ArrowLeftIcon } from "lucide-react";
import { memo } from "react";

const SelectSourceHint = memo(() => {
  return (
    <div className="flex h-full items-center justify-center gap-2">
      <ArrowLeftIcon className="size-4" />
      <div className="text-sm">请于左侧选择站点进行编辑</div>
    </div>
  )
})

export default SelectSourceHint