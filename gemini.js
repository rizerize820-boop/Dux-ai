// Gemini API-мен жұмыс. Тарих: [{ role: 'user' | 'model', text, file?: { name, mimeType, data } }]
const MODEL = 'gemini-3.7-flash'; // қажет болса басқа модельге ауыстырыңыз
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

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
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM(userName) }] },
      contents: toContents(messages),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || 'Сервер қатесі: ' + res.status);
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
