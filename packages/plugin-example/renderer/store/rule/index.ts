import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Site } from './type'
import { nanoid } from 'nanoid'
import { produce } from 'immer'

interface RuleStore {
  sites: Site[]
  addSite: (site: Omit<Site, 'id'>) => string
  removeSite: (id: string) =>  void
  updateSite: (id: string, site: Partial<Site>) => void
}

const useRuleStore = create<RuleStore>()(
  persist(
    (set, get) => {
      return {
        sites: [
          {
            id: '1',
            dataVersion: 1,
            namespace: 'example',
            common: {
              author: '佚名',
              cookie: '',
              description: '这是一个示例源',
              flags: '',
              loginUrl: '',
              siteIcon: '',
              siteName: '示例源',
              siteUrl: 'https://www.example.com',
              token: '',
              version: '1.0.0',
            },
            rules: {},
            pages: [],
          },
        ],
        addSite: (site) => {
          const id = nanoid()
          set(produce(state => {
            state.sites.push({
              id,
              ...site,
            })
          }))
          return id
        },
        removeSite: (id) => set(produce(state => {
          const index = state.sites.findIndex(s => s.id === id)
          if (index !== -1) {
            state.sites.splice(index, 1)
          }
        })),
        updateSite: (id, site) => set(produce(state => {
          const index = state.sites.findIndex(s => s.id === id)
          if (index !== -1) {
            state.sites[index] = {
              ...state.sites[index],
              ...site,
            }
          }
        })),
      }
    },
    {
      version: 1,
      name: 'shelf-rule',
      storage: createJSONStorage(() => window.localStorage)
    }
  )
)

export default useRuleStore