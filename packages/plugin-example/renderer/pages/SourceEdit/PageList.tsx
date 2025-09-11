import { memo, useCallback, useMemo } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { SortableContext, sortableKeyboardCoordinates, useSortable} from '@dnd-kit/sortable'
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Page } from "@/store/rule/type";
import { CSS } from '@dnd-kit/utilities';
import { EditIcon, EyeIcon, EyeOffIcon, GripVerticalIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PageCardProps {
  page: Page
}

const PageCard = memo(({ page }: PageCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: page.id });

  const style = useMemo(() => {
    return {
      transform: CSS.Transform.toString(transform),
      transition,
    };
  }, [transform])

  return (
    <div
      className={cn(
        'border h-12 rounded-sm flex items-center gap-1 overflow-hidden px-2 bg-gray-50 select-none',
      )}
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <div className="shrink-0 text-gray-400" {...listeners}>
        <GripVerticalIcon className="size-4 cursor-move" />
      </div>
      <div className={cn(
        'truncate grow text-sm',
        !page.enabled && 'line-through text-gray-400'
      )}>{page.title}</div>
      <div className="shrink-0">
        <Button variant="outline" size="sm">
          <EditIcon className="size-3" />
        </Button>
      </div>
    </div>
  )
})

const AddCard = memo(() => {
  const fetcher = useFetcher()

  const handleAdd = useCallback(() => {
    fetcher.submit(null, {
      method: 'post',
      action: './create'
    })
  }, [fetcher])

  return (
    <div className="border-2 border-dashed border-gray-300 flex justify-center items-center cursor-pointer rounded-sm h-12 text-sm" onClick={handleAdd}>
      <PlusIcon className="size-6 mr-2" />
      <span>新建页面</span>
    </div>
  )
})

const PageList = memo(() => {
  const pages = useLoaderData()
  const fetcher = useFetcher()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    fetcher.submit({
      activeId: event.active.id,
      overId: event.over.id,
    }, {
      method: 'post',
      action: './sort',
      encType: 'application/json',
    })
    return
  }, [fetcher])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={pages}
      >
        <div className="overflow-y-auto overflow-x-hidden pb-5 h-full flex flex-col">
          <div className="grid grid-cols-1 p-3 sm:grid-cols-3 gap-3 overflow-x-hidden h-full content-start">
            <AddCard />
            {pages.map(page => {
              return (
                <PageCard page={page} key={page.id} />
              )
            })}
          </div>
          
        </div>
      </SortableContext>
    </DndContext>
  )
})

export default PageList