import { Site } from "./type";

export function getDefaultSite(): Omit<Site, 'id'> {
  return {
    dataVersion: 1,
    namespace: 'com.example.newsite',
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
  }
}