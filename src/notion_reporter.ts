import { Client } from '@notionhq/client';
import { logger } from './utils/logger.js';

export class NotionReporter {
  private enabled: boolean;
  private client: Client | null = null;
  private databaseId: string;

  constructor(apiKey: string, databaseId: string, enabled: boolean) {
    this.enabled = enabled;
    this.databaseId = databaseId;
    if (!enabled) return;
    if (!apiKey || !databaseId) {
      throw new Error('NOTION_API_KEY 和 NOTION_DATABASE_ID 必须同时配置');
    }
    this.client = new Client({ auth: apiKey });
  }

  async pushTextPage(
    dateStr: string,
    title: string,
    bodyText: string,
  ): Promise<unknown> {
    if (!this.enabled || !this.client) {
      logger.info('Notion 集成未启用，跳过推送');
      return null;
    }

    try {
      const page = await this.client.pages.create({
        parent: { database_id: this.databaseId },
        properties: {
          'Title': { title: [{ text: { content: title } }] },
          'Date': { date: { start: dateStr } },
          'Content': { rich_text: [{ text: { content: bodyText } }] },
        },
      });
      logger.info(`✅ 每日汇总已推送到 Notion (页面 ID: ${page.id})`);
      return page;
    } catch (e) {
      logger.error(`❌ 推送 Notion 失败: ${e}`);
      return null;
    }
  }
}
