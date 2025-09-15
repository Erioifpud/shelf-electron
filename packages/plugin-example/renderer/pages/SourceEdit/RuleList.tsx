import { memo, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { CollectionRule, DetailRule, PreviewRule, Rule } from "@/store/rule/type";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDefaultCollectionRule, getDefaultDetailRule, getDefaultPreviewRule } from "@/store/rule/utils";

interface ColProps {
  rules: Rule[]
  type: string
  onEdit: (id: string, type: string) => void
}

const NAME_MAP = {
  detail: '详情页规则',
  collection: '列表页规则',
  preview: '浏览页规则',
}

const Col = memo((props: ColProps) => {
  const fetcher = useFetcher()

  const handleCreate = useCallback(() => {
    let rule
    if (props.type === 'detail') {
      rule = getDefaultDetailRule()
    } else if (props.type === 'collection') {
      rule = getDefaultCollectionRule()
    } else if (props.type === 'preview') {
      rule = getDefaultPreviewRule()
    }
    if (!rule) {
      throw new Error('unknown rule type')
    }
    fetcher.submit(rule, {
      method: 'post',
      encType: 'application/json',
      action: './create'
    })
  }, [])

  return (
    <section className="rounded-md flex flex-col border border-gray-300 bg-white">
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <span className="font-semibold text-gray-700">{NAME_MAP[props.type]}</span>
        <Button onClick={handleCreate} size="sm">
          <PlusIcon className="size-4"></PlusIcon>
          新建
        </Button>
      </header>

      <ul className="flex-1 overflow-y-auto p-3 space-y-2">
        {props.rules
          .map((r) => (
            <li
              key={r.id}
              className="group relative bg-gray-50 p-3 rounded border hover:shadow"
            >
              <p className="text-sm text-gray-800 pr-8">{r.name}</p>
              <button
                className="absolute top-2 right-2 hidden group-hover:block text-xs text-gray-500 hover:text-gray-800"
                onClick={() => props.onEdit(r.id, r.type)}
              >
                ✏️
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
})

const RuleList = memo(() => {
  const { previewRules, collectionRules, detailRules } = useLoaderData()
  const fetcher = useFetcher()

  const handleEdit = useCallback((id: string, type: string) => {
    console.log(id, type)
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-3">
      <Col rules={detailRules} type="detail" onEdit={handleEdit} />
      <Col rules={collectionRules} type="collection" onEdit={handleEdit} />
      <Col rules={previewRules} type="preview" onEdit={handleEdit} />
    </div>
  )
})

export default RuleList