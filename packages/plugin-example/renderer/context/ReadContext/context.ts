import { Site } from "@/store/rule/type";
import { createContext } from "react";

type MapKeys<S> = {
  [K in keyof S]: S[K] extends Record<string, any> ? K : never
}[keyof S];

type KeysWithRuleId<P> = {
  [K in keyof P]: P[K] extends { ruleId: string } | undefined ? K : never
}[keyof P];

export type ViewRefConfig<S, P> = Partial<Record<KeysWithRuleId<P>, MapKeys<S>>>;

type RuleFromMap<S, MK extends MapKeys<S>> =
  S[MK] extends Record<string, infer V> ? V : never;

type MergeView<PV, R> =
  PV extends undefined ? undefined : PV & { rule?: R };

export type ResolvedPage<P, S, C extends ViewRefConfig<S, P>> =
  P & {
    [K in keyof C & KeysWithRuleId<P>]:
      MergeView<P[K], RuleFromMap<S, NonNullable<C[K]>>>
  };

export type FlattenSite<
  S extends { pages: any[] },
  C extends ViewRefConfig<S, S['pages'][number]>
> = Omit<S, 'pages'> & {
  pages: Array<ResolvedPage<S['pages'][number], S, C>>;
};

export const ReadContext = createContext<unknown>({

})