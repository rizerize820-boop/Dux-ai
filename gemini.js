import { CEREBRAS_KEY, GROQ_KEY } from './config';

// Gemini API-мен жұмыс. Тарих: [{ role: 'user' | 'model', text, file?: { name, mimeType, data } }]
// Квота таусылса (429), келесі модельге автоматты түрде ауысады
const MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const endpoint = (model) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

// OpenAI үйлесімді сервистер (мәтін мен код үшін). Модель аты өзгерсе, осы жерде түзетіңіз
const PROVIDERS = [
  { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: CEREBRAS_KEY, models: ['gpt-oss-120b', 'llama3.1-8b'] },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_KEY, models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] },
];

const SYSTEM = (name) =>
  'Сен — Dux AI, ақылды көмекші. ' +
  'Пайдаланушы қай тілде жазса, сол тілде жауап бер (қазақша, орысша, ағылшынша және кез келген басқа тіл). ' +
  'Фото, видео, PDF және мәтіндік файлдарды мұқият талдап, нақты сипаттап бер. ' +
  'Код жазғанда әрқашан тілі көрсетілген ``` блогын қолдан, қысқа түсініктеме қос. ' +
  'Жауап нақты және пайдалы болсын.' +
  (name ? ' Пайдаланушының аты: ' + name + '.' : '');

const toContents = (messages) =>
  messages.map((m) => {
    const parts = [];
    if (m.file) {
      if (m.file.data) {
        parts.push({ inlineData: { mimeType: m.file.mimeType, data: m.file.data } });
      } else {
        parts.push({ text: '[Файл: ' + m.file.name + ' — мазмұны қолжетімсіз]' });
      }
    }
    if (m.text) parts.push({ text: m.text });
    if (!parts.length) parts.push({ text: ' ' });
    return { role: m.role === 'model' ? 'model' : 'user', parts: parts };
  });

async function askGoogle(apiKey, messages, userName) {
  if (!apiKey) throw new Error('API кілті жоқ. .env файлына EXPO_PUBLIC_GEMINI_API_KEY қойыңыз');
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM(userName) }] },
    contents: toContents(messages),
  });
  let json = {};
  let lastError = 'Белгісіз қате';
  for (const model of MODELS) {
    const res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: body,
    });
    json = await res.json().catch(() => ({}));
    if (res.ok) break;
    lastError = (json.error && json.error.message) || 'Сервер қатесі: ' + res.status;
    // 429 — квота, 404 — модель жоқ, 503 — бос емес: келесі модельді көреміз
    if (res.status !== 429 && res.status !== 404 && res.status !== 503) throw new Error(lastError);
    json = {};
  }
  if (!json.candidates && !json.promptFeedback) {
    throw new Error('Барлық модельдің күндік квотасы таусылды. Кейінірек қайталаңыз.\n' + lastError);
  }
  const cand = json.candidates && json.candidates[0];
  const text = cand && cand.content && cand.content.parts
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) {
    const why = (json.promptFeedback && json.promptFeedback.blockReason) || (cand && cand.finishReason) || 'бос жауап';
    throw new Error('Жауап алынбады: ' + why);
  }
  return text;
}

const toOpenAI = (messages, userName) =>
  [{ role: 'system', content: SYSTEM(userName) }].concat(
    messages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: (m.file ? '[Файл: ' + m.file.name + '] ' : '') + (m.text || ''),
    }))
  );

async function askCompat(p, messages, userName) {
  let lastError = p.name + ' қатесі';
  for (const model of p.models) {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
      body: JSON.stringify({ model: model, messages: toOpenAI(messages, userName) }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (text) return text;
      lastError = p.name + ': бос жауап';
      continue;
    }
    lastError = p.name + ': ' + ((json.error && json.error.message) || res.status);
    // 404 — модель жоқ, келесісін көреміз; басқа қате — келесі сервиске өтеміз
    if (res.status !== 404) break;
  }
  throw new Error(lastError);
}

// Фото/файл болса — Gemini; әйтпесе Cerebras → Groq → Gemini
export async function askGemini(apiKey, messages, userName) {
  const hasFile = messages.some((m) => m.file && m.file.data);
  if (!hasFile) {
    for (const p of PROVIDERS) {
      if (!p.key) continue;
      try {
        return await askCompat(p, messages, userName);
      } catch (e) {
        console.log(e.message);
      }
    }
  }
  return askGoogle(apiKey, messages, userName);
}
