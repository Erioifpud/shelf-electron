import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Site } from './type'
import { nanoid } from 'nanoid'

interface RuleStore {
  sites: Site[]
  addSite: (site: Omit<Site, 'id'>) => void
  removeSite: (id: string) =>  void
  updateSite: (id: string, site: Partial<Site>) => void
}

const useRuleStore = create<RuleStore>()(
  persist(
    immer((set) => {
      return {
        sites: [],
        addSite: (site) => set(state => {
          const id = nanoid()
          state.sites.push({
            id,
            ...site,
          })
        }),
        removeSite: (id) => set(state => {
          const index = state.sites.findIndex(s => s.id === id)
          if (index !== -1) {
            state.sites.splice(index, 1)
          }
        }),
        updateSite: (id, site) => set(state => {
          const index = state.sites.findIndex(s => s.id === id)
          if (index !== -1) {
            state.sites[index] = {
              ...state.sites[index],
              ...site,
            }
          }
        }),
      }
    }),
    {
      version: 1,
      name: 'shelf-rule',
      storage: createJSONStorage(() => window.localStorage)
    }
  )
)

export default useRuleStore