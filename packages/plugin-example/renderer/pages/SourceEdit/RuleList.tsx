import { memo, useCallback } from "react";
import { Link, Outlet, useFetcher, useLoaderData } from "react-router";
import { Rule } from "@/store/rule/type";
import { EditIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDefaultCollectionRule, getDefaultDetailRule, getDefaultPreviewRule } from "@/store/rule/utils";

interface ColProps {
  rules: Rule[]
  type: string
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
  }, [fetcher, props.type])

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
          .map((rule) => (
            <li
              key={rule.id}
              className="group relative bg-gray-50 px-3 py-2 rounded border border-gray-300 flex items-center gap-2"
            >
              <p className="text-sm text-gray-800 grow">{rule.name}</p>
              <Button
                size="sm"
                variant="outline"
                asChild
              >
                <Link to={`./${rule.id}/edit`}>
                  <EditIcon className="size-3" />
                </Link>
              </Button>
            </li>
          ))}
      </ul>
    </section>
  )
})

const RuleList = memo(() => {
  const { previewRules, collectionRules, detailRules } = useLoaderData()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-3">
      <Col rules={detailRules} type="detail" />
      <Col rules={collectionRules} type="collection" />
      <Col rules={previewRules} type="preview" />
      <Outlet />
    </div>
  )
})

export default RuleList