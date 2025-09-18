import { ReactNode, useMemo } from "react";
import { FlattenSite, ReadContext, ViewRefConfig } from "./context";

type FlattenSiteProviderProps<
  S extends { pages: any[] },
  C extends ViewRefConfig<S, S['pages'][number]>
> = {
  site: S;
  config: C;
  children: ReactNode;
};

export function flattenSite<
  S extends { pages: any[] },
  C extends ViewRefConfig<S, S['pages'][number]>
>(site: S, config: C): FlattenSite<S, C> {
  const pages = site.pages.map((page) => {
    // 基于不可变更新，逐视图地复制
    let out: any = page;

    // 避免无意义复制：若确实要写入，才做浅拷贝
    let pageCloned = false;

    for (const k in config) {
      const viewKey = k as keyof C & keyof typeof page;
      const mapKey = config[viewKey];
      if (!mapKey) continue;

      const view = (page as any)[viewKey];
      if (!view || typeof view !== 'object') continue;

      const id = view.ruleId as string | undefined;
      const ruleMap = (site as any)[mapKey] as Record<string, unknown> | undefined;
      const ruleObj = id && ruleMap ? ruleMap[id] : undefined;

      if (!pageCloned) {
        out = { ...page };
        pageCloned = true;
      }
      out[viewKey] = { ...view, rule: ruleObj };
    }

    return out;
  });

  return { ...(site as any), pages } as FlattenSite<S, C>;
}

export function FlattenSiteProvider<
  S extends { pages: any[] },
  C extends ViewRefConfig<S, S['pages'][number]>
>({ site, config, children }: FlattenSiteProviderProps<S, C>) {
  // 只依赖 pages + config 中声明到的 ruleMaps 引用
  const mapKeys = useMemo(() => Array.from(new Set(Object.values(config))), [config]);

  const value = useMemo(
    () => flattenSite(site, config),
    // 注意：动态依赖数组是允许的，React 会逐项比较
    [site.pages, ...mapKeys.map((k) => (site as any)[k as keyof S])]
  );

  return (
    <ReadContext.Provider value={value}>
      {children}
    </ReadContext.Provider>
  );
}