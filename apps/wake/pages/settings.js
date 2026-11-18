import { withDisclosures } from './parts.js';
import config from '../app.config.js';
import { bootPage, createSettingsPage } from '../../../kit/page/index.js';

bootPage(config, async ctx => withDisclosures(await createSettingsPage(ctx)));
