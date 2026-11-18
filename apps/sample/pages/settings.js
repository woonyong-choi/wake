import config from '../app.config.js';
import { bootPage, createSettingsPage } from '../../../kit/page/index.js';

bootPage(config, ctx => createSettingsPage(ctx));
