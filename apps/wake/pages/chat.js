import { withDisclosures } from './parts.js';
import config from '../app.config.js';
import { bootPage, createChatPage, onService } from '../../../kit/page/index.js';

bootPage(config, async ctx => {
  const page = withDisclosures(await createChatPage(ctx));
  const off = onService((event, payload) => { if (event === 'ai-chat' && payload?.op === 'delete') page.onConversationRemoved(payload.id); });
  window.addEventListener('pagehide', off, { once: true });
  return page;
});
