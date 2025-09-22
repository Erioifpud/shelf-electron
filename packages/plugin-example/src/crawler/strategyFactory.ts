import type { IScrapingStrategy } from './strategies/IScrapingStrategy';
import { AjaxStrategy } from './strategies/AjaxStrategy';
import { HeadlessStrategy } from './strategies/HeadlessStrategy';
import type { ScrapingConfig } from './type';

export function createStrategy(config: ScrapingConfig): IScrapingStrategy {
  switch (config.mode) {
    case 'ajax':
      return new AjaxStrategy();
    case 'headless':
      return new HeadlessStrategy();
    default:
      throw new Error(`Unsupported scraping mode: ${config.mode}`);
  }
}