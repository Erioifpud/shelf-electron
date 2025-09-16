import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import Detail from "./Detail";
import { DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, Drawer } from "@/components/ui/drawer";
import { Rule } from "@/store/rule/type";
import { toast } from "sonner";

const DIALOG_MAP = {
  detail: Detail,
}

const ANIMATION_DURATION = 500;

const RuleEdit = memo(() => {
  const { type, rule: initialRule } = useLoaderData<{ type: string, rule: Rule }>()
  const navigate = useNavigate()
  const fetcher = useFetcher()

  const [isOpen, setIsOpen] = useState(false);

  const isSubmitting = useMemo(() => fetcher.state === "submitting", [fetcher])
  const Component = useMemo(() => DIALOG_MAP[type], [type])

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
  
  if (!Component) {
    navigate(-1)
    toast.error('无效的规则类型')
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
          <Component rule={initialRule} />
        </div>
      </DrawerContent>
    </Drawer>
  )
})

export default RuleEdit