import { randomUUID } from 'node:crypto';
import { fail, text } from './core.mjs';
import { get, hasRedis, setPersistent } from './store.mjs';

export const DEFAULT_SCRIPT_STYLES = Object.freeze([
  {
    id: 'natural-intro',
    name: '🌿 Giới thiệu tự nhiên',
    prompt: 'Viết như một người thật đang chia sẻ trực tiếp với người xem, không mở đầu bằng “xin chào” hoặc “hôm nay mình sẽ giới thiệu”. Câu đầu cần tạo chú ý bằng một câu hỏi, nhận xét, tình huống hoặc phát hiện phù hợp với chủ đề. Chọn một ý chính và dẫn mạch tự nhiên qua các chi tiết quan trọng thay vì liệt kê. Nếu là sản phẩm/dịch vụ thì làm rõ giá trị và CTA mềm; nếu là kiến thức, cảm xúc, giải trí hoặc nội dung cá nhân thì kết thúc bằng một nhận xét, bài học hoặc lời gợi mở phù hợp, không ép bán hàng. Câu chữ đời thường, dễ nói và sát dữ liệu nguồn.'
  },
  {
    id: 'tiktok-review',
    name: '📱 Review TikTok',
    prompt: 'Viết như một creator đang review trên TikTok: vào thẳng vấn đề bằng hook gây tò mò, một nhận xét trái kỳ vọng hoặc góc nhìn riêng, không chào hỏi dài. Review có thể là sản phẩm, dịch vụ, địa điểm, trải nghiệm, ý tưởng, câu chuyện hoặc bất kỳ đối tượng nào trong nguồn. Nhịp nhanh nhưng tự nhiên, lồng các chi tiết đáng chú ý vào một quan điểm rõ ràng thay vì dùng danh sách. Không giả vờ đã mua, dùng hoặc trải nghiệm nếu dữ liệu không chứng minh. Có thể hài hước/cà khịa nhẹ khi phù hợp; kết thúc bằng phản ứng, nhận xét hoặc lời gợi mở đúng mục tiêu, chỉ dùng CTA bán hàng khi chủ đề thực sự thương mại.'
  },
  {
    id: 'trend',
    name: '🔥 Bắt Trend',
    prompt: 'Viết theo tinh thần video bắt trend nhưng không phụ thuộc vào một meme hay trend cụ thể. Mở bằng punchline, đối lập, tình huống oái oăm hoặc câu nói khiến người xem muốn biết tiếp. Dùng ngôn ngữ trẻ vừa đủ, không cố nhồi tiếng lóng. Để đối tượng hoặc chủ đề của video trở thành trung tâm của cú bẻ lái, sự hài hước hoặc bất ngờ; không biến nội dung thành quảng cáo nếu nguồn không có mục tiêu bán hàng. Giữ nhịp gọn, có một khoảnh khắc dễ nhớ và kết thúc phù hợp với nội dung: câu chốt, phản ứng, lời mời tương tác hoặc CTA tự nhiên.'
  },
  {
    id: 'experience-story',
    name: '🎬 Kể chuyện trải nghiệm',
    prompt: 'Kể một câu chuyện có bối cảnh, vấn đề hoặc mong muốn cụ thể, không viết thành bản tường thuật từng cảnh. Mở ngay giữa tình huống để tạo lý do xem tiếp; sau đó dẫn qua quá trình nhận ra, quan sát, trải nghiệm hoặc thay đổi, rồi đưa chủ đề vào đúng thời điểm như một phần có ý nghĩa của câu chuyện. Chỉ dùng chi tiết và kết quả có trong nguồn, không bịa trải nghiệm cá nhân của người nói. Tạo một điểm chuyển rõ ràng, câu chữ đời thường và kết thúc bằng bài học, cảm nhận hoặc CTA phù hợp với mục tiêu của video.'
  },
  {
    id: 'emotional-storytelling',
    name: '❤️ Storytelling cảm xúc',
    prompt: 'Viết storytelling có cảm xúc nhưng tiết chế và chân thật. Mở bằng một khoảnh khắc, hình ảnh hoặc nỗi niềm khiến người xem thấy mình trong đó; phát triển cảm xúc theo từng nhịp, tạo một khoảng chờ hoặc câu hỏi trong đầu, rồi để chủ đề, nhân vật, sản phẩm hoặc thông điệp xuất hiện tự nhiên tùy nội dung nguồn. Chọn một thông điệp chính, dùng chi tiết nguồn làm điểm chạm cảm xúc, không bi lụy, không phóng đại và không bịa dữ kiện. Kết thúc bằng một câu còn dư âm, bài học hoặc lời gợi mở; chỉ dùng CTA thương mại khi phù hợp.'
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
