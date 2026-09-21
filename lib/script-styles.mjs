import { randomUUID } from 'node:crypto';
import { fail, text } from './core.mjs';
import { get, hasRedis, setPersistent } from './store.mjs';

export const DEFAULT_SCRIPT_STYLES = Object.freeze([
  {
    id: 'natural-intro',
    name: '🌿 Giới thiệu tự nhiên',
    prompt: 'Viết kịch bản giới thiệu tự nhiên như đang chia sẻ trực tiếp với người xem. Mở đầu nhẹ nhàng nhưng đủ thu hút, giới thiệu chủ đề hoặc sản phẩm rõ ràng, tập trung vào lợi ích và chi tiết thực tế có trong dữ liệu nguồn. Dùng câu ngắn, dễ nói thành tiếng, giọng gần gũi, không quảng cáo quá lố và kết thúc bằng lời kêu gọi hành động tự nhiên.'
  },
  {
    id: 'tiktok-review',
    name: '📱 Review TikTok',
    prompt: 'Viết kịch bản theo phong cách review TikTok đời thường. Vào thẳng điểm đáng chú ý bằng một hook ngắn, nhịp nhanh, câu gọn và dễ nói. Trình bày trải nghiệm hoặc nhận xét dựa trên dữ liệu nguồn, không bịa việc đã sử dụng nếu không có căn cứ. Nêu các điểm nổi bật, lợi ích thực tế, cảm nhận cân bằng và kết thúc bằng lời kêu gọi hành động mềm.'
  },
  {
    id: 'trend',
    name: '🔥 Bắt Trend',
    prompt: 'Viết kịch bản theo phong cách bắt trend mạng xã hội: mở đầu mạnh, nhịp nhanh, ngôn ngữ trẻ và dễ lan truyền. Có thể dùng cấu trúc gây tò mò, đối lập hoặc bất ngờ nhưng không phụ thuộc vào một trend cụ thể nếu dữ liệu nguồn không cung cấp. Không bịa thông tin, không cường điệu quá mức, giữ nội dung tự nhiên và kết thúc gọn.'
  },
  {
    id: 'experience-story',
    name: '🎬 Kể chuyện trải nghiệm',
    prompt: 'Viết kịch bản theo mạch kể chuyện trải nghiệm: bối cảnh → vấn đề → quá trình quan sát hoặc trải nghiệm → điểm thay đổi → kết luận. Giọng kể tự nhiên như kể một câu chuyện thật, ưu tiên chi tiết cụ thể từ dữ liệu nguồn. Không tự bịa trải nghiệm cá nhân hoặc kết quả không có căn cứ. Kết thúc bằng một lời gợi mở hoặc hành động phù hợp.'
  },
  {
    id: 'emotional-storytelling',
    name: '❤️ Storytelling cảm xúc',
    prompt: 'Viết kịch bản storytelling giàu cảm xúc nhưng chân thật. Mở bằng một khoảnh khắc hoặc tình huống gợi tò mò, tạo đồng cảm, phát triển cảm xúc theo từng nhịp rồi gắn chủ đề hoặc sản phẩm vào câu chuyện một cách tự nhiên. Không bi lụy, không cường điệu và không bịa dữ kiện. Kết thúc để lại dư âm và lời kêu gọi hành động nhẹ nhàng.'
  }
]);

const keyForUser = user => `script-custom-styles:${user}`;

function normalizeCustomList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item =>
    item &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.prompt === 'string'
  ).slice(0, 30).map(item => ({
    id: item.id,
    name: item.name,
    prompt: item.prompt,
    kind: 'custom'
  }));
}

export async function defaultScriptStyles() {
  const overrides = await get('script-default-prompts') || {};
  return DEFAULT_SCRIPT_STYLES.map(style => ({
    ...style,
    prompt: typeof overrides?.[style.id] === 'string' && overrides[style.id].trim()
      ? overrides[style.id].trim()
      : style.prompt,
    kind: 'default'
  }));
}

export async function customScriptStylesForUser(user) {
  return normalizeCustomList(await get(keyForUser(user)));
}

export async function scriptStylesForUser(user) {
  return {
    defaults: await defaultScriptStyles(),
    custom: await customScriptStylesForUser(user)
  };
}

export async function resolveScriptStyle(user, styleId) {
  const id = typeof styleId === 'string' && styleId.trim() ? styleId.trim() : DEFAULT_SCRIPT_STYLES[0].id;
  const defaults = await defaultScriptStyles();
  const builtin = defaults.find(style => style.id === id);
  if (builtin) return builtin;
  const custom = (await customScriptStylesForUser(user)).find(style => style.id === id);
  if (custom) return custom;
  fail(404, 'Không tìm thấy phong cách kịch bản này.');
}

export async function createCustomScriptStyle(user, body) {
  if (!hasRedis()) fail(503, 'Cần Upstash Redis để lưu phong cách riêng theo tài khoản.', 'REDIS_REQUIRED');
  const name = text(body.name, 'Tên phong cách', 80);
  const prompt = text(body.prompt, 'Prompt phong cách', 6000);
  const list = await customScriptStylesForUser(user);
  if (list.length >= 20) fail(400, 'Mỗi tài khoản được tạo tối đa 20 phong cách riêng.');
  if (list.some(item => item.name.trim().toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi'))) {
    fail(400, 'Tên phong cách này đã tồn tại trong tài khoản.');
  }
  const style = {
    id: `custom-${randomUUID()}`,
    name,
    prompt,
    kind: 'custom'
  };
  const next = [...list, style];
  await setPersistent(keyForUser(user), next);
  return style;
}

export async function updateCustomScriptStyle(user, body) {
  if (!hasRedis()) fail(503, 'Cần Upstash Redis để quản lý phong cách riêng.', 'REDIS_REQUIRED');
  const id = text(body.styleId, 'Mã phong cách', 120);
  if (!id.startsWith('custom-')) fail(400, 'Phong cách mặc định không thể sửa.');
  const name = text(body.name, 'Tên phong cách', 80);
  const prompt = text(body.prompt, 'Prompt phong cách', 6000);
  const list = await customScriptStylesForUser(user);
  const current = list.find(item => item.id === id);
  if (!current) fail(404, 'Không tìm thấy phong cách riêng của tài khoản này.');
  if (list.some(item => item.id !== id && item.name.trim().toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi'))) {
    fail(400, 'Tên phong cách này đã tồn tại trong tài khoản.');
  }
  const next = list.map(item => item.id === id ? { ...item, name, prompt, kind: 'custom' } : item);
  await setPersistent(keyForUser(user), next);
  return next.find(item => item.id === id);
}

export async function deleteCustomScriptStyle(user, styleId) {
  if (!hasRedis()) fail(503, 'Cần Upstash Redis để quản lý phong cách riêng.', 'REDIS_REQUIRED');
  const id = text(styleId, 'Mã phong cách', 120);
  if (!id.startsWith('custom-')) fail(400, 'Phong cách mặc định không thể xóa.');
  const list = await customScriptStylesForUser(user);
  const next = list.filter(item => item.id !== id);
  if (next.length === list.length) fail(404, 'Không tìm thấy phong cách riêng này.');
  await setPersistent(keyForUser(user), next);
  return { ok: true };
}

export async function saveDefaultScriptPrompt(styleId, promptValue) {
  if (!hasRedis()) fail(503, 'Cần Upstash Redis để lưu prompt mặc định.', 'REDIS_REQUIRED');
  const id = text(styleId, 'Mã phong cách', 120);
  if (!DEFAULT_SCRIPT_STYLES.some(style => style.id === id)) fail(404, 'Không tìm thấy phong cách mặc định.');
  const prompt = text(promptValue, 'Prompt phong cách', 6000);
  const overrides = await get('script-default-prompts') || {};
  await setPersistent('script-default-prompts', { ...overrides, [id]: prompt });
  return (await defaultScriptStyles()).find(style => style.id === id);
}
