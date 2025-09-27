import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import Collection from "./Collection";
import Detail from "./Detail";
import Preview from "./Preview";
import { DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, Drawer } from "@/components/ui/drawer";
import { Rule } from "@/store/rule/type";
import { toast } from "sonner";
import { useModals } from "@/components/ModalManager";

const FORM_MAP = {
  detail: Detail,
  collection: Collection,
  preview: Preview,
}

const ANIMATION_DURATION = 500;

const RuleEdit = memo(() => {
  const { type, rule: initialRule } = useLoaderData<{ type: string, rule: Rule }>()
  const navigate = useNavigate()
  const fetcher = useFetcher()
  const modals = useModals()

  const [isOpen, setIsOpen] = useState(false);

  const isSubmitting = useMemo(() => fetcher.state === "submitting", [fetcher])
  const Component = useMemo(() => FORM_MAP[type], [type])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 10); 
    return () => clearTimeout(timer);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);

    setTimeout(() => {
      navigate(-1); 
    }, ANIMATION_DURATION);
  }, [])

  const handleSubmit = useCallback((values: any) => {
    fetcher.submit(values, {
      method: "post",
      encType: 'application/json'
    });
    toast.success('保存成功', { toasterId: 'global' })
  }, [fetcher]);

  const handleRemove = useCallback((type: string) => {
    modals.openConfirmModal({
      title: '删除确认',
      children: (
        <div className="">确定要删除该页面规则吗？删除后将无法找回</div>
      ),
      labels: {
        confirm: '确认',
        cancel: '取消'
      },
      onConfirm() {
        fetcher.submit(null, {
          method: 'post',
          action: `./destroy`
        })
        toast.success('删除成功', { toasterId: 'global' })
      },
    })
  }, [fetcher])
  
  if (!Component) {
    navigate(-1)
    toast.error('无效的规则类型', { toasterId: 'global' })
    return null;
  }

  return (
    <Drawer
      direction="right"
      open={isOpen}
      onClose={handleClose}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{initialRule.name}</DrawerTitle>
          <DrawerDescription>编辑规则信息</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 overflow-y-auto">
          <Component
            rule={initialRule}
            onSubmit={handleSubmit}
            onRemove={handleRemove}
            isSubmitting={isSubmitting}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
})

export default RuleEdit