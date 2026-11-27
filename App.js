import { Component, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, BackHandler, Dimensions, FlatList, Image,
  Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { askGemini, setGeminiLang, transcribeAudio } from './gemini';
import { BUY_URL } from './config';
import { supabase, configured } from './supabase';

const API_KEY = 'AQ.Ab8RN6KdZxec7Bnx57y36WIBp3oWc0u6UL_j6xIZ96Av-7aumw';
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const CHATS = 'chats_v2';
const LANG = 'lang_v1';
const OLD_HISTORY = 'chat_history';
const FREE_DAILY = 50;
const PREMIUM_DAILY = 500;

const MAX_BASE64 = 17 * 1024 * 1024;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DRAWER_W = Math.min(330, Dimensions.get('window').width * 0.84);

const C = {
  bg: '#0A101D',
  surface: '#111A2C',
  surface2: '#192640',
  border: '#243453',
  text: '#EAF0FA',
  muted: '#8696B3',
  accent: '#2FC4E0',
  accentInk: '#04222B',
  gold: '#F2C14E',
  goldInk: '#2B2005',
  danger: '#FF6B6B',
};

const LANGS = [
  { id: 'kk', label: 'Қазақша' },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];

const STR = {
  kk: {
    suggestions: [
      { icon: 'earth-outline', t: 'Қазақстан туралы қызықты дерек айт' },
      { icon: 'document-text-outline', t: 'Мәтінді қысқаша түйіндеп бер' },
      { icon: 'bulb-outline', t: 'Бизнес-идея ұсын' },
      { icon: 'code-slash-outline', t: 'Python-да қарапайым бот жазып бер' },
    ],
    readFail: 'Файлды оқу мүмкін болмады', code: 'код', copied: 'Көшірілді', copy: 'Көшіру',
    user: 'Қолданушы', oldChat: 'Ескі чат', error: 'Қате', newChat: 'Жаңа чат',
    delChatQ: 'Чатты өшіру?', delChatMsg: 'Бұл чат жойылады', cancel: 'Бас тарту', delete: 'Өшіру',
    badCode: 'Код дұрыс емес', badCodeMsg: 'Код қате немесе бұрын қолданылған',
    premiumOn: 'Premium қосылды',
    premiumOnMsg: (n) => 'Рақмет! Енді күніне ' + n + ' сұрақ және ең күшті модель.',
    clearAllQ: 'Барлық чатты өшіру?', clearAllMsg: 'Бұл әрекетті қайтару мүмкін емес',
    authNeed: 'Email және кемінде 6 таңбалы құпиясөз енгізіңіз', needName: 'Атыңызды жазыңыз',
    confirmEmail: 'Email растаңыз', confirmEmailMsg: 'Поштаңызға хат жіберілді. Сілтемені басып, содан кейін кіріңіз.',
    logoutQ: 'Аккаунттан шығу?', logoutMsg: 'Чаттар құрылғыда қалады, қайта кіргенде көресіз', logout: 'Шығу',
    fileBig: 'Файл тым үлкен', fileBigMsg: 'Кішірек файл таңдаңыз (шамамен 12 МБ дейін)',
    fileBigMsg2: 'Кішірек файл немесе қысқа видео таңдаңыз (шамамен 12 МБ дейін)',
    camPerm: 'Камераға рұқсат керек', limitHit: 'Күндік лимит таусылды', limitTomorrow: 'Лимит ертең жаңарады',
    limitFree: (f, p) => 'Тегін тарифте күніне ' + f + ' сұрақ. Premium-ға ауысып, күніне ' + p + ' сұрақ қойыңыз.',
    close: 'Жабу', offline: 'Интернет байланысы жоқ. Тексеріп, қайта көріңіз',
    signup: 'Жаңа аккаунт жасау', signin: 'Аккаунтқа кіру',
    notConfigured: 'Supabase бапталмаған: config.js ішіне SUPABASE_URL және SUPABASE_ANON_KEY қойыңыз',
    name: 'Атыңыз', password: 'Құпиясөз (кемінде 6 таңба)', signUpBtn: 'Тіркелу', signInBtn: 'Кіру',
    haveAcc: 'Аккаунт бар ма? Кіру', noAcc: 'Аккаунт жоқ па? Тіркелу',
    hello: 'Сәлем', helloHint: 'Сұрақ қойыңыз немесе фото, видео, файл жіберіңіз',
    preparing: 'Файл дайындалуда...', msgPh: 'Хабарлама жазыңыз...',
    recent: 'Соңғы чаттар', noChats: 'Әзірше чат жоқ',
    camera: 'Фото түсіру', videoOpt: 'Видео жазу', gallery: 'Галерея (фото, видео)', fileOpt: 'Файл (PDF, TXT)', micPerm: 'Микрофонға рұқсат керек', micRec: 'Жазылуда… тоқтату үшін басыңыз', micWork: 'Дауыс мәтінге айналуда…', micFail: 'Дауысты тану мүмкін болмады',
    settings: 'Баптаулар', usageToday: 'Бүгінгі қолдану', resetNote: 'Лимит әр күні түнгі 00:00-де жаңарады',
    perk1: (p, f) => '• Күніне ' + p + ' сұрақ (тегін: ' + f + ')',
    perk2: '• Ең күшті модель: дәл жауап, күрделі код', perk3: '• Ұзын, толық жауаптар',
    perk4: '• Фото мен файлдарды терең талдау', buy: 'Premium сатып алу', codePh: 'Белсендіру коды',
    premiumActive: 'Premium белсенді',
    premiumActiveMsg: (p) => 'Күніне ' + p + ' сұрақ және ең күшті модель қосулы.',
    until: 'Мерзімі', clearAll: 'Барлық чатты өшіру', logoutBtn: 'Аккаунттан шығу', language: 'Тіл',
  },
  ru: {
    suggestions: [
      { icon: 'earth-outline', t: 'Расскажи интересный факт о Казахстане' },
      { icon: 'document-text-outline', t: 'Кратко перескажи текст' },
      { icon: 'bulb-outline', t: 'Предложи бизнес-идею' },
      { icon: 'code-slash-outline', t: 'Напиши простого бота на Python' },
    ],
    readFail: 'Не удалось прочитать файл', code: 'код', copied: 'Скопировано', copy: 'Копировать',
    user: 'Пользователь', oldChat: 'Старый чат', error: 'Ошибка', newChat: 'Новый чат',
    delChatQ: 'Удалить чат?', delChatMsg: 'Этот чат будет удалён', cancel: 'Отмена', delete: 'Удалить',
    badCode: 'Неверный код', badCodeMsg: 'Код неверный или уже использован',
    premiumOn: 'Premium включён',
    premiumOnMsg: (n) => 'Спасибо! Теперь ' + n + ' вопросов в день и самая сильная модель.',
    clearAllQ: 'Удалить все чаты?', clearAllMsg: 'Это действие нельзя отменить',
    authNeed: 'Введите email и пароль не короче 6 символов', needName: 'Введите ваше имя',
    confirmEmail: 'Подтвердите email', confirmEmailMsg: 'Мы отправили вам письмо. Перейдите по ссылке, затем войдите.',
    logoutQ: 'Выйти из аккаунта?', logoutMsg: 'Чаты останутся на устройстве, вы увидите их при следующем входе', logout: 'Выйти',
    fileBig: 'Файл слишком большой', fileBigMsg: 'Выберите файл поменьше (до 12 МБ)',
    fileBigMsg2: 'Выберите файл поменьше или короткое видео (до 12 МБ)',
    camPerm: 'Нужен доступ к камере', limitHit: 'Дневной лимит исчерпан', limitTomorrow: 'Лимит обновится завтра',
    limitFree: (f, p) => 'На бесплатном тарифе ' + f + ' вопросов в день. Перейдите на Premium, чтобы задавать ' + p + '.',
    close: 'Закрыть', offline: 'Нет интернета. Проверьте соединение и повторите',
    signup: 'Создать аккаунт', signin: 'Вход в аккаунт',
    notConfigured: 'Supabase не настроен: укажите SUPABASE_URL и SUPABASE_ANON_KEY в config.js',
    name: 'Ваше имя', password: 'Пароль (не короче 6 символов)', signUpBtn: 'Зарегистрироваться', signInBtn: 'Войти',
    haveAcc: 'Уже есть аккаунт? Войти', noAcc: 'Нет аккаунта? Зарегистрироваться',
    hello: 'Привет', helloHint: 'Задайте вопрос или отправьте фото, видео, файл',
    preparing: 'Подготовка файла...', msgPh: 'Напишите сообщение...',
    recent: 'Недавние чаты', noChats: 'Пока нет чатов',
    camera: 'Сделать фото', videoOpt: 'Записать видео', gallery: 'Галерея (фото, видео)', fileOpt: 'Файл (PDF, TXT)', micPerm: 'Нужен доступ к микрофону', micRec: 'Идёт запись… нажмите, чтобы остановить', micWork: 'Распознаю голос…', micFail: 'Не удалось распознать голос',
    settings: 'Настройки', usageToday: 'Использовано сегодня', resetNote: 'Лимит обновляется каждый день в 00:00',
    perk1: (p, f) => '• ' + p + ' вопросов в день (бесплатно: ' + f + ')',
    perk2: '• Самая сильная модель: точные ответы, сложный код', perk3: '• Длинные, подробные ответы',
    perk4: '• Глубокий анализ фото и файлов', buy: 'Купить Premium', codePh: 'Код активации',
    premiumActive: 'Premium активен',
    premiumActiveMsg: (p) => p + ' вопросов в день и самая сильная модель включены.',
    until: 'Действует до', clearAll: 'Удалить все чаты', logoutBtn: 'Выйти из аккаунта', language: 'Язык',
  },
  en: {
    suggestions: [
      { icon: 'earth-outline', t: 'Tell me an interesting fact about Kazakhstan' },
      { icon: 'document-text-outline', t: 'Summarize a text for me' },
      { icon: 'bulb-outline', t: 'Suggest a business idea' },
      { icon: 'code-slash-outline', t: 'Write a simple bot in Python' },
    ],
    readFail: 'Could not read the file', code: 'code', copied: 'Copied', copy: 'Copy',
    user: 'User', oldChat: 'Old chat', error: 'Error', newChat: 'New chat',
    delChatQ: 'Delete chat?', delChatMsg: 'This chat will be deleted', cancel: 'Cancel', delete: 'Delete',
    badCode: 'Invalid code', badCodeMsg: 'The code is wrong or already used',
    premiumOn: 'Premium activated',
    premiumOnMsg: (n) => 'Thanks! You now get ' + n + ' questions a day and the strongest model.',
    clearAllQ: 'Delete all chats?', clearAllMsg: 'This cannot be undone',
    authNeed: 'Enter an email and a password of at least 6 characters', needName: 'Enter your name',
    confirmEmail: 'Confirm your email', confirmEmailMsg: 'We sent you an email. Open the link, then sign in.',
    logoutQ: 'Sign out?', logoutMsg: 'Chats stay on this device and will be here when you sign in again', logout: 'Sign out',
    fileBig: 'File is too large', fileBigMsg: 'Choose a smaller file (up to 12 MB)',
    fileBigMsg2: 'Choose a smaller file or a shorter video (up to 12 MB)',
    camPerm: 'Camera access is required', limitHit: 'Daily limit reached', limitTomorrow: 'The limit resets tomorrow',
    limitFree: (f, p) => 'The free plan allows ' + f + ' questions a day. Upgrade to Premium for ' + p + '.',
    close: 'Close', offline: 'No internet connection. Check it and try again',
    signup: 'Create an account', signin: 'Sign in to your account',
    notConfigured: 'Supabase is not set up: add SUPABASE_URL and SUPABASE_ANON_KEY to config.js',
    name: 'Your name', password: 'Password (at least 6 characters)', signUpBtn: 'Sign up', signInBtn: 'Sign in',
    haveAcc: 'Have an account? Sign in', noAcc: 'No account? Sign up',
    hello: 'Hello', helloHint: 'Ask a question or send a photo, video or file',
    preparing: 'Preparing file...', msgPh: 'Type a message...',
    recent: 'Recent chats', noChats: 'No chats yet',
    camera: 'Take photo', videoOpt: 'Record video', micPerm: 'Microphone access is required', micRec: 'Recording… tap to stop', micWork: 'Transcribing voice…', micFail: 'Could not recognize the voice', gallery: 'Gallery (photo, video)', fileOpt: 'File (PDF, TXT)',
    settings: 'Settings', usageToday: 'Used today', resetNote: 'The limit resets every day at 00:00',
    perk1: (p, f) => '• ' + p + ' questions a day (free: ' + f + ')',
    perk2: '• Strongest model: accurate answers, complex code', perk3: '• Long, detailed answers',
    perk4: '• Deeper analysis of photos and files', buy: 'Buy Premium', codePh: 'Activation code',
    premiumActive: 'Premium is active',
    premiumActiveMsg: (p) => p + ' questions a day and the strongest model are on.',
    until: 'Valid until', clearAll: 'Delete all chats', logoutBtn: 'Sign out', language: 'Language',
  },
};

const detectLang = () => {
  try {
    const l = (Intl.DateTimeFormat().resolvedOptions().locale || '').slice(0, 2);
    return l === 'ru' ? 'ru' : l === 'en' ? 'en' : 'kk';
  } catch (e) {
    return 'kk';
  }
};

// Ағымдағы тіл: Main әр рендерде жаңартады, төмендегі компоненттер осыны оқиды
let tr = STR.kk;

// Файл мазмұны (data) жадта ғана тұрады, тарихқа аты мен түрі сақталады
const strip = (m) =>
  m.file ? { ...m, file: { name: m.file.name, mimeType: m.file.mimeType, uri: m.file.uri } } : m;

const IMAGE_API = 'https://dux-ai.muhammedali8103.workers.dev';

const isImagePrompt = (text) =>
  /^(\\/image\\s+|нарисуй\\b|сгенерируй\\s+(картинку|изображение)|создай\\s+(картинку|изображение)|draw\\b|generate\\s+(an?\\s+)?image\\b|create\\s+(an?\\s+)?image\\b|make\\s+(an?\\s+)?picture\\b)/i.test(text.trim());

async function generateImage(prompt, accessToken) {
  const response = await fetch(IMAGE_API + '/api/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({ prompt: prompt.replace(/^\\/image\\s+/i, '').trim() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось создать изображение');
  if (!data.image) throw new Error('Сервер вернул пустое изображение');
  return 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.image;
}

const isImage = (f) => !!f && !!f.mimeType && f.mimeType.indexOf('image/') === 0;
const isVideo = (f) => !!f && !!f.mimeType && f.mimeType.indexOf('video/') === 0;

const readBase64 = (uri) =>
  new Promise((resolve, reject) => {
    const fail = () => reject(new Error(tr.readFail));
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = fail;
      reader.readAsDataURL(xhr.response);
    };
    xhr.onerror = fail;
    xhr.open('GET', uri);
    xhr.send();
  });

// Ескі хабарламалардағы файл мазмұны жадта жоқ болса, uri арқылы қайта оқимыз (соңғы 3 файл)
const withData = async (msgs) => {
  const out = msgs.slice();
  let n = 0;
  for (let i = out.length - 1; i >= 0 && n < 3; i--) {
    const f = out[i].file;
    if (!f) continue;
    n++;
    if (!f.data && f.uri) {
      try {
        out[i] = { ...out[i], file: { ...f, data: await readBase64(f.uri) } };
      } catch (e) {}
    }
  }
  return out;
};

// **қалың** және `код` белгілерін өңдейді
const inline = (str) =>
  str.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) => {
    if (p.length > 4 && p.indexOf('**') === 0) return <Text key={i} style={s.bold}>{p.slice(2, -2)}</Text>;
    if (p.length > 2 && p[0] === '`') return <Text key={i} style={s.inlineCode}>{p.slice(1, -1)}</Text>;
    return p;
  });

// Жауапты мәтін мен код блоктарына бөледі (``` ... ```)
function RichText({ text, onCopy, copied }) {
  const parts = String(text).split('```');
  return (
    <View style={s.rich}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf('\n');
          const lang = nl > -1 ? part.slice(0, nl).trim() : '';
          const code = (nl > -1 ? part.slice(nl + 1) : part).replace(/\n$/, '');
          return (
            <View key={i} style={s.codeBox}>
              <View style={s.codeHead}>
                <Text style={s.codeLang}>{lang || tr.code}</Text>
                <TouchableOpacity onPress={() => onCopy(code)} hitSlop={10} style={s.codeCopy}>
                  <Ionicons name={copied === code ? 'checkmark' : 'copy-outline'} size={15} color={C.muted} />
                  <Text style={s.codeCopyText}>{copied === code ? tr.copied : tr.copy}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={s.codeText} selectable>{code}</Text>
              </ScrollView>
            </View>
          );
        }
        if (!part.trim()) return null;
        const lines = part.trim().split('\n');
        return (
          <Text key={i} style={s.botText} selectable>
            {lines.map((ln, k) => {
              const h = ln.match(/^#{1,4}\s+(.*)$/);
              const b = ln.match(/^\s*[-*]\s+(.*)$/);
              const node = h ? (
                <Text style={s.heading}>{inline(h[1])}</Text>
              ) : b ? (
                <Text>{'•  '}{inline(b[1])}</Text>
              ) : (
                <Text>{inline(ln)}</Text>
              );
              return <Text key={k}>{k > 0 ? '\n' : ''}{node}</Text>;
            })}
          </Text>
        );
      })}
    </View>
  );
}

// Жауап күтіліп жатқанда үш нүкте кезекпен жанады
function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={s.dots}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={[s.dot, { opacity: v }]} />
      ))}
    </View>
  );
}

function FileThumb({ file, size }) {
  if (isImage(file) && file.uri) {
    return <Image source={{ uri: file.uri }} style={{ width: size, height: size, borderRadius: 10 }} />;
  }
  const icon = isVideo(file) ? 'videocam' : 'document-text';
  return (
    <View style={[s.thumbIcon, { width: size, height: size }]}>
      <Ionicons name={icon} size={size * 0.5} color={C.muted} />
    </View>
  );
}

function Main() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recTimer = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState('in');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ premium: false, used: 0, limit: FREE_DAILY, until: null });
  const [settings, setSettings] = useState(false);
  const [copied, setCopied] = useState(null);
  const [lang, setLang] = useState(detectLang());
  tr = STR[lang];
  setGeminiLang(lang);
  const [codeInput, setCodeInput] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const list = useRef(null);
  const chatsOwner = useRef(null);

  const active = chats.find((c) => c.id === activeId);
  const messages = active ? active.messages : [];
  const premium = status.premium;
  const dev = !!status.dev;
  const used = status.used;
  const limit = status.limit;
  const left = Math.max(0, limit - used);
  const uid = session ? session.user.id : null;
  const profile = session
    ? { name: (session.user.user_metadata && session.user.user_metadata.name) || session.user.email || tr.user }
    : null;

  // Таңдалған тіл құрылғыда сақталады
  useEffect(() => {
    AsyncStorage.getItem(LANG)
      .then((l) => {
        if (l && STR[l]) setLang(l);
      })
      .catch(() => {});
  }, []);

  const chooseLang = (l) => {
    setLang(l);
    AsyncStorage.setItem(LANG, l).catch(() => {});
  };

  // Ештеңе қатып қалмауы үшін: 5 сек кейін экранды мәжбүрлеп ашамыз
  useEffect(() => {
    const t = setTimeout(() => {
      setAuthReady(true);
      setReady(true);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Аккаунт сессиясы (Supabase)
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Тариф және бүгінгі қолдану серверден
  useEffect(() => {
    if (!uid) {
      setStatus({ premium: false, used: 0, limit: FREE_DAILY, until: null });
      return;
    }
    supabase.rpc('get_status').then(({ data, error }) => {
      if (!error && data) setStatus(data);
    });
  }, [uid]);

  // Чаттар әр аккаунт үшін құрылғыда бөлек сақталады
  useEffect(() => {
    if (!authReady) return;
    chatsOwner.current = null;
    setReady(false);
    setActiveId(null);
    if (!uid) {
      setChats([]);
      setReady(true);
      return;
    }
    (async () => {
      try {
        const key = CHATS + '_' + uid;
        let saved = JSON.parse((await AsyncStorage.getItem(key)) || 'null');
        if (!saved) {
          // Бұрынғы (аккаунтсыз) чаттарды бірінші кірген аккаунтқа көшіреміз
          saved = JSON.parse((await AsyncStorage.getItem(CHATS)) || 'null');
          if (!saved) {
            const old = JSON.parse((await AsyncStorage.getItem(OLD_HISTORY)) || '[]');
            const first = old.find((m) => m.role === 'user');
            saved = old.length
              ? [{ id: String(Date.now()), title: ((first && first.text) || tr.oldChat).slice(0, 40), messages: old, updatedAt: Date.now() }]
              : [];
          }
          AsyncStorage.removeItem(CHATS).catch(() => {});
          AsyncStorage.removeItem(OLD_HISTORY).catch(() => {});
        }
        chatsOwner.current = uid;
        setChats(saved);
      } catch (e) {
        Alert.alert(tr.error, e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [uid, authReady]);

  useEffect(() => {
    if (!ready || !uid || chatsOwner.current !== uid) return;
    const clean = chats.map((c) => ({ ...c, messages: c.messages.map(strip) }));
    AsyncStorage.setItem(CHATS + '_' + uid, JSON.stringify(clean)).catch(() => {});
  }, [chats, ready, uid]);

  // Android "артқа" батырмасы ашық менюді жабады
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        closeDrawer();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen]);

  const upsert = (id, mutate) =>
    setChats((prev) => {
      const found = prev.find((c) => c.id === id);
      const current = found || { id: id, title: '', messages: [], updatedAt: 0 };
      const msgs = mutate(current.messages);
      if (!msgs.length) return prev.filter((c) => c.id !== id);
      const first = msgs.find((m) => m.role === 'user');
      const title = (first && (first.text || (first.file && first.file.name))) || tr.newChat;
      const updated = { id: id, title: title.slice(0, 40), messages: msgs, updatedAt: Date.now() };
      return [updated].concat(prev.filter((c) => c.id !== id));
    });

  const openDrawer = () => {
    Keyboard.dismiss();
    progress.setValue(0);
    setDrawerOpen(true);
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const closeDrawer = () => {
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setDrawerOpen(false)
    );
  };

  const newChat = () => {
    if (loading) return;
    setActiveId(null);
    setFile(null);
    setInput('');
    if (drawerOpen) closeDrawer();
  };

  const openChat = (id) => {
    if (loading) return;
    setActiveId(id);
    setFile(null);
    closeDrawer();
  };

  const deleteChat = (id) => {
    if (loading) return;
    Alert.alert(tr.delChatQ, tr.delChatMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          setChats((prev) => prev.filter((c) => c.id !== id));
          if (id === activeId) setActiveId(null);
        },
      },
    ]);
  };

  const activate = async () => {
    const code = codeInput.trim();
    if (!code) return;
    const { data, error } = await supabase.rpc('redeem_code', { p_code: code });
    if (error || !data) {
      Alert.alert(tr.badCode, tr.badCodeMsg);
      return;
    }
    setStatus(data);
    setCodeInput('');
    Alert.alert(tr.premiumOn, tr.premiumOnMsg(PREMIUM_DAILY));
  };

  const clearAll = () =>
    Alert.alert(tr.clearAllQ, tr.clearAllMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          setChats([]);
          setActiveId(null);
        },
      },
    ]);

  const submitAuth = async () => {
    const email = emailInput.trim();
    if (!email || passInput.length < 6) {
      Alert.alert(tr.error, tr.authNeed);
      return;
    }
    if (mode === 'up' && !nameInput.trim()) {
      Alert.alert(tr.error, tr.needName);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: passInput,
          options: { data: { name: nameInput.trim() } },
        });
        if (error) throw error;
        if (!data.session) Alert.alert(tr.confirmEmail, tr.confirmEmailMsg);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email, password: passInput });
        if (error) throw error;
      }
      setPassInput('');
    } catch (e) {
      Alert.alert(tr.error, e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    Alert.alert(tr.logoutQ, tr.logoutMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.logout,
        style: 'destructive',
        onPress: () => {
          supabase.auth.signOut().catch(() => {});
          progress.setValue(0);
          setDrawerOpen(false);
          setActiveId(null);
          setFile(null);
          setInput('');
        },
      },
    ]);
  };

  const attach = (picked) => {
    if (picked.data.length > MAX_BASE64) {
      Alert.alert(tr.fileBig, tr.fileBigMsg);
      return;
    }
    setFile(picked);
  };

  const pickMedia = async (camera, kind) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert(tr.camPerm);
      }
      const open = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await open({
        mediaTypes: kind === 'video' ? ['videos'] : kind === 'photo' ? ['images'] : ['images', 'videos'],
        base64: true,
        quality: 0.6,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      if (a.fileSize && a.fileSize > MAX_FILE_BYTES) {
        Alert.alert(tr.fileBig, tr.fileBigMsg2);
        return;
      }
      const video = a.type === 'video' || (a.mimeType || '').indexOf('video/') === 0;
      setPicking(true);
      const data = a.base64 || (await readBase64(a.uri));
      attach({
        name: a.fileName || (video ? 'video.mp4' : 'photo.jpg'),
        uri: a.uri,
        mimeType: a.mimeType || (video ? 'video/mp4' : 'image/jpeg'),
        data: data,
      });
    } catch (e) {
      Alert.alert(tr.error, e.message);
    } finally {
      setPicking(false);
    }
  };

  const toggleMic = async () => {
    if (transcribing || loading) return;
    try {
      if (!recording) {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) return Alert.alert(tr.micPerm);
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecSec(0);
        setRecording(true);
        recTimer.current = setInterval(() => setRecSec((n) => n + 1), 1000);
        return;
      }
      clearInterval(recTimer.current);
      setRecording(false);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) return;
      setTranscribing(true);
      const data = await readBase64(uri);
      const text = await transcribeAudio(API_KEY, data, 'audio/mp4', uri);
      if (text) setInput((p) => (p ? p + ' ' : '') + text);
    } catch (err) {
      Alert.alert(tr.micFail, err && err.message ? err.message : '');
    } finally {
      setTranscribing(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      if (a.size && a.size > MAX_FILE_BYTES) {
        Alert.alert(tr.fileBig, tr.fileBigMsg);
        return;
      }
      setPicking(true);
      const data = await readBase64(a.uri);
      attach({ name: a.name, uri: a.uri, mimeType: a.mimeType || 'application/pdf', data: data });
    } catch (e) {
      Alert.alert(tr.error, e.message);
    } finally {
      setPicking(false);
    }
  };

  const copyText = async (t) => {
    try {
      await Clipboard.setStringAsync(t);
      setCopied(t);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {}
  };

  const choose = (fn) => {
    setSheet(false);
    setTimeout(fn, Platform.OS === 'ios' ? 600 : 250);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !file) || loading || picking) return;
    setLoading(true);
    let q;
    try {
      const { data, error } = await supabase.rpc('consume_request');
      if (error) throw error;
      q = data;
    } catch (e) {
      setLoading(false);
      Alert.alert(tr.error, e.message);
      return;
    }
    setStatus((p) => ({ ...p, used: q.used, limit: q.limit, premium: q.premium, dev: !!q.dev }));
    if (!q.ok) {
      setLoading(false);
      Alert.alert(
        tr.limitHit,
        q.premium ? tr.limitTomorrow : tr.limitFree(FREE_DAILY, PREMIUM_DAILY),
        q.premium
          ? [{ text: 'OK' }]
          : [{ text: tr.close, style: 'cancel' }, { text: 'Premium', onPress: () => setSettings(true) }]
      );
      return;
    }
    const base = messages;
    const userMsg = file ? { role: 'user', text: text, file: file } : { role: 'user', text: text };
    const next = base.concat([userMsg]);
    let id = activeId;
    if (!id) {
      id = String(Date.now());
      setActiveId(id);
    }
    const sentFile = file;
    upsert(id, () => next);
    setInput('');
    setFile(null);
    setLoading(true);
    try {
      if (isImagePrompt(text)) {
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (authError || !authData.session || !authData.session.access_token) {
          throw new Error('Сессия истекла. Войдите в аккаунт заново.');
        }
        const imageData = await generateImage(text, authData.session.access_token);
        upsert(id, (m) => m.concat([{ role: 'model', text: 'Готово. Вот изображение:', imageData }]));
      } else {
        const answer = await askGemini(API_KEY, await withData(next), profile ? profile.name : '', q.premium);
        upsert(id, (m) => m.concat([{ role: 'model', text: answer }]));
      }
    } catch (e) {
      upsert(id, () => base);
      setInput(text);
      setFile(sentFile);
      Alert.alert(tr.error, /Network request failed/i.test(e.message) ? tr.offline : e.message);
    } finally {
      setLoading(false);
    }
  };

  const canSend = (input.trim().length > 0 || !!file) && !loading && !picking;

  const renderMessage = ({ item }) => {
    if (item.role === 'user') {
      return (
        <View style={s.userBubble}>
          {item.file ? (
            isImage(item.file) && item.file.uri ? (
              <Image source={{ uri: item.file.uri }} style={s.msgImage} />
            ) : (
              <View style={s.fileRow}>
                <FileThumb file={item.file} size={36} />
                <Text style={s.fileName} numberOfLines={1}>{item.file.name}</Text>
              </View>
            )
          ) : null}
          {!!item.text && <Text style={s.userText} selectable>{item.text}</Text>}
        </View>
      );
    }
    return (
      <View style={s.botRow}>
        <Image source={require('./assets/dux-icon.png')} style={s.botAvatar} />
        <View style={s.botBody}>
          <RichText text={item.text || ''} onCopy={copyText} copied={copied} />
          {!!item.imageData && <Image source={{ uri: item.imageData }} style={s.generatedImage} resizeMode="contain" />}
          {!!item.text && <TouchableOpacity onPress={() => copyText(item.text)} hitSlop={10} style={s.copyBtn}>
            <Ionicons name={copied === item.text ? 'checkmark' : 'copy-outline'} size={17} color={C.muted} />
          </TouchableOpacity>}
        </View>
      </View>
    );
  };

  let body;
  if (!ready || !authReady) {
    body = <ActivityIndicator style={s.flex} color={C.accent} />;
  } else if (!session) {
    body = (
      <KeyboardAvoidingView style={[s.flex, s.loginWrap]} behavior="padding">
        <Image source={require('./assets/dux-icon.png')} style={s.logo} />
        <Text style={s.hello}>Dux AI</Text>
        <Text style={s.hint}>{mode === 'up' ? tr.signup : tr.signin}</Text>
        {!configured && (
          <Text style={[s.hint, { color: C.danger }]}>
            {tr.notConfigured}
          </Text>
        )}
        {mode === 'up' && (
          <View style={s.authField}>
            <TextInput
              style={s.loginInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={tr.name}
              placeholderTextColor={C.muted}
              maxLength={30}
            />
          </View>
        )}
        <View style={s.authField}>
          <TextInput
            style={s.loginInput}
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder="Email"
            placeholderTextColor={C.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={s.authField}>
          <TextInput
            style={s.loginInput}
            value={passInput}
            onChangeText={setPassInput}
            placeholder={tr.password}
            placeholderTextColor={C.muted}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submitAuth}
          />
        </View>
        <TouchableOpacity style={[s.newBtn, s.loginBtn, busy && s.sendOff]} onPress={submitAuth} disabled={busy}>
          {busy ? <ActivityIndicator color={C.accentInk} /> : <Text style={s.newBtnText}>{mode === 'up' ? tr.signUpBtn : tr.signInBtn}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'up' ? 'in' : 'up')} hitSlop={10}>
          <Text style={s.authSwitch}>{mode === 'up' ? tr.haveAcc : tr.noAcc}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  } else {
    body = (
      <KeyboardAvoidingView style={s.flex} behavior="padding">
        <View style={s.header}>
          <TouchableOpacity style={s.iconBtn} onPress={openDrawer}>
            <Ionicons name="menu" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{active ? active.title : 'Dux AI'}</Text>
          <TouchableOpacity style={s.iconBtn} onPress={newChat} disabled={loading}>
            <Ionicons name="create-outline" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <FlatList
          key={activeId || 'new'}
          ref={list}
          style={s.flex}
          contentContainerStyle={s.list}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          onContentSizeChange={() => list.current && list.current.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={s.empty}>
              <Image source={require('./assets/dux-icon.png')} style={s.logo} />
              <Text style={s.hello}>{tr.hello}, {profile ? profile.name : ''}</Text>
              <Text style={s.hint}>{tr.helloHint}</Text>
              <View style={s.chips}>
                {tr.suggestions.map((x) => (
                  <TouchableOpacity key={x.t} style={s.chip} onPress={() => setInput(x.t)}>
                    <View style={s.chipIcon}>
                      <Ionicons name={x.icon} size={20} color={C.accent} />
                    </View>
                    <Text style={s.chipText}>{x.t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={renderMessage}
          ListFooterComponent={
            loading ? (
              <View style={s.botRow}>
                <Image source={require('./assets/dux-icon.png')} style={s.botAvatar} />
                <TypingDots />
              </View>
            ) : null
          }
        />

        {(file || picking) && (
          <View style={s.preview}>
            {picking ? (
              <>
                <ActivityIndicator color={C.accent} />
                <Text style={s.previewName}>{tr.preparing}</Text>
              </>
            ) : (
              <>
                <FileThumb file={file} size={44} />
                <Text style={s.previewName} numberOfLines={1}>{file.name}</Text>
                <TouchableOpacity onPress={() => setFile(null)} style={s.iconBtn}>
                  <Ionicons name="close-circle" size={24} color={C.muted} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {(recording || transcribing) && (
          <View style={s.recBanner}>
            {transcribing ? <ActivityIndicator color={C.accent} /> : <View style={s.recDot} />}
            <Text style={s.recText}>
              {transcribing ? tr.micWork : tr.micRec + '  ' + Math.floor(recSec / 60) + ':' + String(recSec % 60).padStart(2, '0')}
            </Text>
          </View>
        )}
        <View style={s.bar}>
          <View style={s.inputWrap}>
            <TouchableOpacity style={s.plusBtn} onPress={() => setSheet(true)} disabled={loading}>
              <Ionicons name="add" size={24} color={C.text} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              multiline
              placeholder={tr.msgPh}
              placeholderTextColor={C.muted}
            />
            {!canSend || recording ? (
              <TouchableOpacity style={[s.micBtn, recording && s.micOn]} onPress={toggleMic} disabled={transcribing}>
                <Ionicons name={recording ? 'stop' : 'mic'} size={20} color={recording ? '#fff' : C.accent} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[s.sendBtn, !canSend && s.sendOff]}
              onPress={send}
              disabled={!canSend}
            >
              <Ionicons name="arrow-up" size={20} color={C.accentInk} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      {body}

      {drawerOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[s.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]}
          >
            <Pressable style={s.flex} onPress={closeDrawer} />
          </Animated.View>
          <Animated.View
            style={[
              s.drawer,
              {
                width: DRAWER_W,
                transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_W, 0] }) }],
              },
            ]}
          >
            <View style={s.drawerHead}>
              <Image source={require('./assets/dux-icon.png')} style={s.drawerLogo} />
              <Text style={s.drawerTitle}>Dux AI</Text>
            </View>

            <TouchableOpacity style={s.newBtn} onPress={newChat} disabled={loading}>
              <Ionicons name="add" size={22} color="#fff" />
              <Text style={s.newBtnText}>{tr.newChat}</Text>
            </TouchableOpacity>

            <Text style={s.section}>{tr.recent}</Text>
            <FlatList
              data={chats}
              keyExtractor={(c) => c.id}
              style={s.flex}
              ListEmptyComponent={<Text style={s.noChats}>{tr.noChats}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.chatItem, item.id === activeId && s.chatItemActive]}
                  onPress={() => openChat(item.id)}
                  onLongPress={() => deleteChat(item.id)}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={C.muted} />
                  <Text style={s.chatTitle} numberOfLines={1}>{item.title}</Text>
                  <TouchableOpacity onPress={() => deleteChat(item.id)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={18} color={C.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />

            <View style={s.profileRow}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{profile ? profile.name.charAt(0).toUpperCase() : ''}</Text>
              </View>
              <Text style={s.profileName} numberOfLines={1}>{profile ? profile.name : ''}</Text>
              <Text style={[s.badge, premium && s.badgePro]}>{dev ? 'DEV' : premium ? 'PRO' : left + '/' + limit}</Text>
              <TouchableOpacity
                onPress={() => {
                  closeDrawer();
                  setTimeout(() => setSettings(true), 250);
                }}
                hitSlop={10}
              >
                <Ionicons name="settings-outline" size={22} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={logout} hitSlop={10}>
                <Ionicons name="log-out-outline" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setSheet(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.grabber} />
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(() => pickMedia(true, 'photo'))}>
              <View style={s.sheetIcon}><Ionicons name="camera" size={22} color={C.accent} /></View>
              <Text style={s.sheetText}>{tr.camera}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(() => pickMedia(true, 'video'))}>
              <View style={s.sheetIcon}><Ionicons name="videocam" size={22} color={C.accent} /></View>
              <Text style={s.sheetText}>{tr.videoOpt}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(() => pickMedia(false))}>
              <View style={s.sheetIcon}><Ionicons name="images" size={22} color={C.accent} /></View>
              <Text style={s.sheetText}>{tr.gallery}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(pickDocument)}>
              <View style={s.sheetIcon}><Ionicons name="document-text" size={22} color={C.accent} /></View>
              <Text style={s.sheetText}>{tr.fileOpt}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={s.screen}>
            <View style={s.header}>
              <View style={s.iconBtn} />
              <Text style={s.headerTitle}>{tr.settings}</Text>
              <TouchableOpacity style={s.iconBtn} onPress={() => setSettings(false)}>
                <Ionicons name="close" size={26} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.setList} keyboardShouldPersistTaps="handled">
              <View style={s.card}>
                <View style={s.profileRow2}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{profile ? profile.name.charAt(0).toUpperCase() : ''}</Text>
                  </View>
                  <Text style={s.profileName} numberOfLines={1}>{profile ? profile.name : ''}</Text>
                  <Text style={[s.badge, premium && s.badgePro]}>{dev ? 'DEVELOPER' : premium ? 'PREMIUM' : 'FREE'}</Text>
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>{tr.usageToday}</Text>
                <Text style={s.usageNum}>{dev ? used + ' / ∞' : used + ' / ' + limit}</Text>
                <View style={s.bar2}>
                  <View style={[s.bar2Fill, { width: dev ? '100%' : Math.min(100, (used / limit) * 100) + '%', backgroundColor: !dev && used / limit > 0.9 ? C.danger : premium ? C.gold : C.accent }]} />
                </View>
                <Text style={s.cardHint}>{tr.resetNote}</Text>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>{tr.language}</Text>
                <View style={s.langRow}>
                  {LANGS.map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={[s.langBtn, lang === l.id && s.langBtnOn]}
                      onPress={() => chooseLang(l.id)}
                    >
                      <Text style={[s.langText, lang === l.id && s.langTextOn]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {!premium ? (
                <View style={[s.card, s.cardPro]}>
                  <Text style={s.cardTitle}>Dux Premium</Text>
                  <Text style={s.perk}>{tr.perk1(PREMIUM_DAILY, FREE_DAILY)}</Text>
                  <Text style={s.perk}>{tr.perk2}</Text>
                  <Text style={s.perk}>{tr.perk3}</Text>
                  <Text style={s.perk}>{tr.perk4}</Text>
                  {!!BUY_URL && (
                    <TouchableOpacity style={s.newBtn} onPress={() => Linking.openURL(BUY_URL)}>
                      <Text style={s.newBtnText}>{tr.buy}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={s.codeRow}>
                    <TextInput
                      style={s.codeInput}
                      value={codeInput}
                      onChangeText={setCodeInput}
                      placeholder={tr.codePh}
                      placeholderTextColor={C.muted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={s.codeBtn} onPress={activate}>
                      <Text style={s.newBtnText}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[s.card, s.cardPro]}>
                  <Text style={s.cardTitle}>{tr.premiumActive}</Text>
                  <Text style={s.perk}>{tr.premiumActiveMsg(PREMIUM_DAILY)}</Text>
                  {!!status.until && (
                    <Text style={s.cardHint}>{tr.until}: {new Date(status.until).toLocaleDateString()}</Text>
                  )}
                </View>
              )}

              <TouchableOpacity style={s.ghostBtn} onPress={clearAll}>
                <Text style={[s.ghostText, { color: C.danger }]}>{tr.clearAll}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={() => {
                  setSettings(false);
                  setTimeout(logout, 300);
                }}
              >
                <Text style={s.ghostText}>{tr.logoutBtn}</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>Dux AI error</Text>
          <Text selectable style={{ color: C.danger, marginTop: 12 }}>{String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err))}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Boundary>
        <SafeAreaProvider>
          <Main />
        </SafeAreaProvider>
      </Boundary>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center', paddingHorizontal: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, paddingBottom: 12, gap: 22, flexGrow: 1 },

  userBubble: {
    alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: C.accent,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, borderBottomRightRadius: 6, gap: 8,
  },
  userText: { color: C.accentInk, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  msgImage: { width: 220, height: 220, borderRadius: 14 },
  generatedImage: { width: 280, height: 280, maxWidth: '100%', borderRadius: 14, backgroundColor: C.surface },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileName: { color: C.accentInk, flexShrink: 1, fontWeight: '500' },
  thumbIcon: { backgroundColor: C.surface, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  botRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingRight: 8 },
  botAvatar: { width: 28, height: 28, borderRadius: 9, marginTop: 2 },
  botBody: { flex: 1, gap: 6 },
  rich: { gap: 12 },
  botText: { color: C.text, fontSize: 16, lineHeight: 25 },
  heading: { color: C.text, fontWeight: '700', fontSize: 18, letterSpacing: -0.2 },
  bold: { fontWeight: '700' },
  inlineCode: { fontFamily: MONO, backgroundColor: C.surface2, color: C.gold },
  copyBtn: { alignSelf: 'flex-start', padding: 2 },

  codeBox: { backgroundColor: '#070B14', borderColor: C.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  codeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  codeLang: { color: C.muted, fontSize: 12 },
  codeCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeCopyText: { color: C.muted, fontSize: 12 },
  codeText: { color: '#CFE3F5', fontFamily: MONO, fontSize: 13.5, lineHeight: 20, padding: 12 },

  dots: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 28 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

  empty: { alignItems: 'flex-start', paddingTop: 36, gap: 10, paddingHorizontal: 4 },
  logo: { width: 56, height: 56, borderRadius: 16, marginBottom: 14 },
  hello: { color: C.text, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  hint: { color: C.muted, fontSize: 16, lineHeight: 23 },
  chips: { marginTop: 26, gap: 10, alignSelf: 'stretch' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 14 },
  chipIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  chipText: { flex: 1, color: C.text, fontSize: 15.5, lineHeight: 21 },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6,
    padding: 8, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
  },
  previewName: { flex: 1, color: C.text },

  bar: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: C.surface, borderRadius: 26, borderWidth: 1, borderColor: C.border, padding: 5 },
  plusBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: C.text, fontSize: 16, maxHeight: 130, minHeight: 38, paddingVertical: 8, paddingHorizontal: 8 },
  micBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: C.danger },
  recBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
  recText: { color: C.text, fontSize: 14, flex: 1 },
  sheetIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: C.surface2, opacity: 0.5 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.surface, paddingHorizontal: 14, paddingTop: 14, borderRightWidth: 1, borderRightColor: C.border },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, paddingHorizontal: 4 },
  drawerLogo: { width: 34, height: 34, borderRadius: 10 },
  drawerTitle: { color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 13 },
  newBtnText: { color: C.accentInk, fontSize: 16, fontWeight: '700' },
  section: { color: C.muted, fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  noChats: { color: C.muted, paddingHorizontal: 4, paddingTop: 6 },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14 },
  chatItemActive: { backgroundColor: C.surface2 },
  chatTitle: { flex: 1, color: C.text, fontSize: 15 },

  loginWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  loginInput: { color: C.text, fontSize: 17, minHeight: 50 },
  loginBtn: { alignSelf: 'stretch' },
  authField: { alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  authSwitch: { color: C.accent, fontSize: 15, marginTop: 6 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.accentInk, fontSize: 16, fontWeight: '700' },
  profileName: { flex: 1, color: C.text, fontSize: 16 },
  badge: { color: C.muted, fontSize: 12, fontWeight: '700', backgroundColor: C.surface2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  badgePro: { color: C.goldInk, backgroundColor: C.gold },

  setList: { padding: 16, gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  cardPro: { borderColor: C.gold },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  cardHint: { color: C.muted, fontSize: 13 },
  profileRow2: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  usageNum: { color: C.text, fontSize: 28, fontWeight: '700' },
  bar2: { height: 8, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' },
  bar2Fill: { height: 8, backgroundColor: C.accent },
  perk: { color: C.text, fontSize: 15, lineHeight: 22 },
  codeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  codeInput: { flex: 1, color: C.text, fontSize: 16, minHeight: 46, paddingHorizontal: 14, backgroundColor: C.surface2, borderRadius: 14 },
  codeBtn: { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 14 },
  ghostBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  ghostText: { color: C.text, fontSize: 16 },

  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: C.surface2 },
  langBtnOn: { backgroundColor: C.accent },
  langText: { color: C.text, fontSize: 15 },
  langTextOn: { color: C.accentInk, fontWeight: '700' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 28, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 8 },
  sheetText: { color: C.text, fontSize: 17 },
});
