import type { NotionContentSourceGateway } from '../domain/model.js';

export class ContentSourcesService {
  constructor(readonly notion: NotionContentSourceGateway) {}
}
