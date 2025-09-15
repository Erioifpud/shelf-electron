import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CollectionRule, DetailRule, Page, PreviewRule, Rule, Site } from './type'
import { nanoid } from 'nanoid'
import { produce } from 'immer'

interface RuleStore {
  sites: Site[]
  addSite: (site: Omit<Site, 'id'>) => string
  removeSite: (id: string) =>  void
  updateSite: (id: string, site: Partial<Site>) => void
  addPage: (siteId: string, page: Omit<Page, 'id'>) => string
  sortPages: (activeId: string, overId: string) => void
  updatePage: (siteId: string, pageId: string, page: Page) => void
  removePage: (siteId: string, pageId: string) => void
  addRule: (siteId: string, page: Omit<Rule, 'id'>) => string
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
              headless: false,
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
            detailRuleMap: {},
            previewRuleMap: {},
            collectionRuleMap: {},
            pages: [],
          },
        ],
        addSite: (site) => {
          const id = nanoid()
          set(produce((state: RuleStore) => {
            state.sites.push({
              id,
              ...site,
            })
          }))
          return id
        },
        removeSite: (id) => set(produce((state: RuleStore) => {
          const index = state.sites.findIndex(s => s.id === id)
          if (index !== -1) {
            state.sites.splice(index, 1)
          }
        })),
        updateSite: (id, site) => set(produce((state: RuleStore) => {
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
          set(produce((state: RuleStore) => {
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
        sortPages: (activeId, overId) => set(produce((state: RuleStore) => {
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
        updatePage: (siteId, pageId, page) => set(produce((state: RuleStore) => {
          const site = state.sites.find(site => site.id === siteId)
          if (!site) {
            throw new Error('Site not found for updating pages')
          }
          const pages = site.pages || []
          const index = pages.findIndex(page => page.id === pageId)
          if (index === -1) {
            throw new Error('Page not found for updating pages')
          }
          site.pages[index] = {
            ...site.pages[index],
            ...page,
          }
        })),
        removePage: (siteId, pageId) => set(produce((state: RuleStore) => {
          const site = state.sites.find(site => site.id === siteId)
          if (!site) {
            throw new Error('Site not found for remove page')
          }
          const pages = site.pages || []
          const index = pages.findIndex(page => page.id === pageId)
          if (index === -1) {
            throw new Error('Page not found for remove page')
          }
          pages.splice(index, 1)
        })),
        addRule: (siteId, rule) => {
          const id = nanoid()
          set(produce((state: RuleStore) => {
            const site = state.sites.find(s => s.id === siteId)
            if (!site) {
              throw new Error('Site not found')
            }
            const type = rule.type
            const fullRule = {
              ...rule,
              id,
            }
            if (type === 'collection') {
              site.collectionRuleMap[id] = fullRule as CollectionRule
            } else if (type === 'detail') {
              site.detailRuleMap[id] = fullRule as DetailRule
            } else if (type === 'preview') {
              site.previewRuleMap[id] = fullRule as PreviewRule
            }
          }))
          return id
        },
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