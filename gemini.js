// Gemini API-мен жұмыс. Тарих: [{ role: 'user' | 'model', text, file?: { name, mimeType, data } }]
// Квота таусылса (429), келесі модельге автоматты түрде ауысады
const MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const endpoint = (model) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

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

export async function askGemini(apiKey, messages, userName) {
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
