import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Page, Site } from './type'
import { nanoid } from 'nanoid'
import { produce } from 'immer'

interface RuleStore {
  sites: Site[]
  addSite: (site: Omit<Site, 'id'>) => string
  removeSite: (id: string) =>  void
  updateSite: (id: string, site: Partial<Site>) => void
  addPage: (siteId: string, page: Omit<Page, 'id'>) => string
  sortPages: (activeId: string, overId: string) => void
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
        addPage: (siteId, page) => {
          const id = nanoid()
          set(produce(state => {
            const site = state.sites.find(s => s.id === siteId)
            if (!site) {
              throw new Error('Site not found')
            }
            site.pages.push({
              id,
              ...page,
            })
          }))
          return id
        },
        sortPages: (activeId, overId) => set(produce(state => {
          const site = state.sites.find(s => s.pages.find(p => p.id === activeId))
          if (!site) {
            throw new Error('Site not found for sorting pages')
          }
          const pages = site.pages || []
          const oldIndex = pages.findIndex(p => p.id === activeId)
          const newIndex = pages.findIndex(p => p.id === overId)
          if (oldIndex === -1 || newIndex === -1) return
          const [movedPage] = pages.splice(oldIndex, 1)
          pages.splice(newIndex, 0, movedPage)
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