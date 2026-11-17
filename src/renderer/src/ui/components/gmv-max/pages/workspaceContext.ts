import { inject, type InjectionKey } from "vue";

/**
 * The GMV MAX workspace view owns all state; its pages read it through this context. Refs unwrap in page
 * templates exactly like in the view's own template because a component's setup() result goes through proxyRefs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GmvWorkspaceContext = Record<string, any>;

export const GMV_WORKSPACE_KEY: InjectionKey<GmvWorkspaceContext> = Symbol("gmv-workspace");

export function useGmvWorkspace(): GmvWorkspaceContext {
  const context = inject(GMV_WORKSPACE_KEY);
  if (!context) throw new Error("GMV MAX pages must be rendered inside TiktokGmvMaxOptimizerView");
  return context;
}
