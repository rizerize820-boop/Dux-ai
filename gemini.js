import { CEREBRAS_KEY, GROQ_KEY } from './config';

// Gemini API-мен жұмыс. Тарих: [{ role: 'user' | 'model', text, file?: { name, mimeType, data } }]
// Квота таусылса (429), келесі модельге автоматты түрде ауысады
// Тегін тариф — жеңіл модельдер, Premium — ең күшті модельдер
const FREE_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
const PRO_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
const endpoint = (model) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

// Қолданушыға көрсетілетін қателер (тілі қолданбадан беріледі)
let LANG = 'kk';
export const setGeminiLang = (l) => {
  LANG = l;
};
const E = {
  kk: { noKey: 'API кілті жоқ', unknown: 'Белгісіз қате', server: 'Сервер қатесі: ', quota: 'Барлық модельдің күндік квотасы таусылды. Кейінірек қайталаңыз.', noAnswer: 'Жауап алынбады: ', empty: 'бос жауап' },
  ru: { noKey: 'Нет API-ключа', unknown: 'Неизвестная ошибка', server: 'Ошибка сервера: ', quota: 'Дневная квота всех моделей исчерпана. Повторите позже.', noAnswer: 'Ответ не получен: ', empty: 'пустой ответ' },
  en: { noKey: 'API key is missing', unknown: 'Unknown error', server: 'Server error: ', quota: 'The daily quota of all models is used up. Try again later.', noAnswer: 'No answer received: ', empty: 'empty answer' },
};
const e = (k) => (E[LANG] || E.kk)[k];

// OpenAI үйлесімді сервистер (мәтін мен код үшін). Модель аты өзгерсе, осы жерде түзетіңіз
const PROVIDERS = [
  { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: CEREBRAS_KEY, models: ['gpt-oss-120b', 'llama3.1-8b'] },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_KEY, models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] },
];

const SYSTEM = (name, premium) =>
  'Сен — Dux AI, ақылды көмекші. ' +
  'Пайдаланушы қай тілде жазса, сол тілде жауап бер (қазақша, орысша, ағылшынша және кез келген басқа тіл). ' +
  'Фото, видео, PDF және мәтіндік файлдарды мұқият талдап, нақты сипаттап бер. ' +
  'Код жазғанда әрқашан тілі көрсетілген ``` блогын қолдан, қысқа түсініктеме қос. ' +
  'Жауап нақты және пайдалы болсын.' +
  (premium
    ? ' Күрделі сұрақтарда қадам-қадаммен ойлап, терең, толық және дәл жауап бер.'
    : ' Жауапты қысқа ұста.') +
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

async function askGoogle(apiKey, messages, userName, premium) {
  if (!apiKey) throw new Error(e('noKey'));
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM(userName, premium) }] },
    contents: toContents(messages),
    generationConfig: { maxOutputTokens: premium ? 8192 : 1024 },
  });
  let json = {};
  let lastError = e('unknown');
  for (const model of premium ? PRO_MODELS : FREE_MODELS) {
    const res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: body,
    });
    json = await res.json().catch(() => ({}));
    if (res.ok) break;
    lastError = (json.error && json.error.message) || e('server') + res.status;
    // 429 — квота, 404 — модель жоқ, 503 — бос емес: келесі модельді көреміз
    if (res.status !== 429 && res.status !== 404 && res.status !== 503) throw new Error(lastError);
    json = {};
  }
  if (!json.candidates && !json.promptFeedback) {
    throw new Error(e('quota') + '\n' + lastError);
  }
  const cand = json.candidates && json.candidates[0];
  const text = cand && cand.content && cand.content.parts
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) {
    const why = (json.promptFeedback && json.promptFeedback.blockReason) || (cand && cand.finishReason) || e('empty');
    throw new Error(e('noAnswer') + why);
  }
  return text;
}

const toOpenAI = (messages, userName, premium) =>
  [{ role: 'system', content: SYSTEM(userName, premium) }].concat(
    messages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: (m.file ? '[Файл: ' + m.file.name + '] ' : '') + (m.text || ''),
    }))
  );

async function askCompat(p, messages, userName, premium) {
  let lastError = p.name + ' қатесі';
  for (const model of p.models) {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
      body: JSON.stringify({ model: model, max_tokens: premium ? 4096 : 1024, messages: toOpenAI(messages, userName, premium) }),
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

// Фото үшін Groq vision (Gemini кілті жұмыс істемесе де фото талдайды)
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
async function askGroqVision(messages, userName, premium) {
  if (!GROQ_KEY) throw new Error('no groq key');
  const isImg = (m) => m.file && m.file.data && /^image\//.test(m.file.mimeType || '');
  let lastImg = -1;
  messages.forEach((m, i) => { if (isImg(m)) lastImg = i; });
  if (lastImg < 0) throw new Error('no image');
  const msgs = [{ role: 'system', content: SYSTEM(userName, premium) }].concat(
    messages.map((m, i) => {
      const role = m.role === 'model' ? 'assistant' : 'user';
      if (i === lastImg) {
        return { role, content: [
          { type: 'text', text: m.text || 'Describe this image.' },
          { type: 'image_url', image_url: { url: 'data:' + m.file.mimeType + ';base64,' + m.file.data } },
        ] };
      }
      return { role, content: (m.file ? '[Файл: ' + m.file.name + '] ' : '') + (m.text || '') };
    })
  );
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: premium ? 4096 : 1024, messages: msgs }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Groq: ' + ((json.error && json.error.message) || res.status));
  const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!text) throw new Error('Groq: empty');
  return text;
}

// Тегін: мәтін — Cerebras/Groq, содан кейін Gemini (жеңіл). Premium: Gemini (күшті), қате болса — Cerebras/Groq
export async function askGemini(apiKey, allMessages, userName, premium) {
  // Тек соңғы 20 хабарлама жіберіледі: жылдамырақ және квота аз кетеді
  let messages = allMessages.slice(-20);
  while (messages.length > 1 && messages[0].role === 'model') messages = messages.slice(1);
  const hasFile = messages.some((m) => m.file && m.file.data);
  const viaCompat = async () => {
    for (const p of PROVIDERS) {
      if (!p.key) continue;
      try {
        return await askCompat(p, messages, userName, premium);
      } catch (e) {
        console.log(e.message);
      }
    }
    return null;
  };
  if (premium) {
    try {
      return await askGoogle(apiKey, messages, userName, true);
    } catch (e) {
      if (hasFile) {
        try { return await askGroqVision(messages, userName, true); } catch (e2) { console.log(e2.message); }
        throw e;
      }
      const r = await viaCompat();
      if (r) return r;
      throw e;
    }
  }
  if (!hasFile) {
    const r = await viaCompat();
    if (r) return r;
  }
  if (hasFile) {
    try {
      return await askGoogle(apiKey, messages, userName, false);
    } catch (e) {
      try { return await askGroqVision(messages, userName, false); } catch (e2) { console.log(e2.message); }
      throw e;
    }
  }
  return askGoogle(apiKey, messages, userName, false);
}

// Дауысты мәтінге айналдыру (Gemini аудионы тікелей түсінеді)
async function transcribeGroq(uri) {
  const form = new FormData();
  form.append('file', { uri: uri, name: 'voice.m4a', type: 'audio/m4a' });
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + GROQ_KEY },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || e('server') + res.status);
  return (json.text || '').trim();
}

export async function transcribeAudio(apiKey, base64, mimeType, uri) {
  if (GROQ_KEY && uri) {
    try {
      const t = await transcribeGroq(uri);
      if (t) return t;
    } catch (err) {
      console.log('groq stt: ' + err.message);
    }
  }
  if (!apiKey) throw new Error(e('noKey'));
  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType, data: base64 } },
          { text: 'Transcribe this audio exactly as spoken, in its original language. Output only the transcript text, nothing else.' },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 2048 },
  });
  let lastError = e('unknown');
  for (const model of [...FREE_MODELS, ...PRO_MODELS]) {
    const res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: body,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
      const text = parts ? parts.map((p) => p.text || '').join('').trim() : '';
      if (text) return text;
      lastError = e('empty');
      continue;
    }
    lastError = (json.error && json.error.message) || e('server') + res.status;
    if (![429, 404, 503].includes(res.status)) break;
  }
  throw new Error(lastError);
}
