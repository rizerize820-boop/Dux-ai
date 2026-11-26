import { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { askGemini } from './gemini';
import { BUY_URL } from './config';
import { supabase, configured } from './supabase';

const API_KEY = 'AQ.Ab8RN6KdZxec7Bnx57y36WIBp3oWc0u6UL_j6xIZ96Av-7aumw';
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const CHATS = 'chats_v2';
const OLD_HISTORY = 'chat_history';
const FREE_DAILY = 50;
const PREMIUM_DAILY = 500;

const MAX_BASE64 = 17 * 1024 * 1024;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DRAWER_W = Math.min(330, Dimensions.get('window').width * 0.84);

const C = {
  bg: '#0e0f12',
  surface: '#1a1b20',
  surface2: '#23242a',
  border: '#2c2d34',
  text: '#ececf1',
  muted: '#8e8ea0',
  accent: '#4f7cff',
  danger: '#ff6b6b',
};

const SUGGESTIONS = [
  'Қазақстан туралы қызықты дерек айт',
  'Мәтінді қысқаша түйіндеп бер',
  'Бизнес-идея ұсын',
];

// Файл мазмұны (data) жадта ғана тұрады, тарихқа аты мен түрі сақталады
const strip = (m) =>
  m.file ? { ...m, file: { name: m.file.name, mimeType: m.file.mimeType, uri: m.file.uri } } : m;

const isImage = (f) => !!f && !!f.mimeType && f.mimeType.indexOf('image/') === 0;
const isVideo = (f) => !!f && !!f.mimeType && f.mimeType.indexOf('video/') === 0;

const readBase64 = (uri) =>
  new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Файлды оқу мүмкін болмады'));
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
function RichText({ text }) {
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
              {!!lang && <Text style={s.codeLang}>{lang}</Text>}
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
  const [codeInput, setCodeInput] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const list = useRef(null);
  const chatsOwner = useRef(null);

  const active = chats.find((c) => c.id === activeId);
  const messages = active ? active.messages : [];
  const premium = status.premium;
  const used = status.used;
  const limit = status.limit;
  const left = Math.max(0, limit - used);
  const uid = session ? session.user.id : null;
  const profile = session
    ? { name: (session.user.user_metadata && session.user.user_metadata.name) || session.user.email || 'Қолданушы' }
    : null;

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
              ? [{ id: String(Date.now()), title: ((first && first.text) || 'Ескі чат').slice(0, 40), messages: old, updatedAt: Date.now() }]
              : [];
          }
          AsyncStorage.removeItem(CHATS).catch(() => {});
          AsyncStorage.removeItem(OLD_HISTORY).catch(() => {});
        }
        chatsOwner.current = uid;
        setChats(saved);
      } catch (e) {
        Alert.alert('Қате', e.message);
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
      const title = (first && (first.text || (first.file && first.file.name))) || 'Жаңа чат';
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
    Alert.alert('Чатты өшіру?', 'Бұл чат жойылады', [
      { text: 'Бас тарту', style: 'cancel' },
      {
        text: 'Өшіру',
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
      Alert.alert('Код дұрыс емес', 'Код қате немесе бұрын қолданылған');
      return;
    }
    setStatus(data);
    setCodeInput('');
    Alert.alert('Premium қосылды', 'Рақмет! Енді күніне ' + PREMIUM_DAILY + ' сұрақ және ең күшті модель.');
  };

  const clearAll = () =>
    Alert.alert('Барлық чатты өшіру?', 'Бұл әрекетті қайтару мүмкін емес', [
      { text: 'Бас тарту', style: 'cancel' },
      {
        text: 'Өшіру',
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
      Alert.alert('Қате', 'Email және кемінде 6 таңбалы құпиясөз енгізіңіз');
      return;
    }
    if (mode === 'up' && !nameInput.trim()) {
      Alert.alert('Қате', 'Атыңызды жазыңыз');
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
        if (!data.session) Alert.alert('Email растаңыз', 'Поштаңызға хат жіберілді. Сілтемені басып, содан кейін кіріңіз.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email, password: passInput });
        if (error) throw error;
      }
      setPassInput('');
    } catch (e) {
      Alert.alert('Қате', e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    Alert.alert('Аккаунттан шығу?', 'Чаттар құрылғыда қалады, қайта кіргенде көресіз', [
      { text: 'Бас тарту', style: 'cancel' },
      {
        text: 'Шығу',
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
      Alert.alert('Файл тым үлкен', 'Кішірек файл таңдаңыз (шамамен 12 МБ дейін)');
      return;
    }
    setFile(picked);
  };

  const pickMedia = async (camera) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Камераға рұқсат керек');
      }
      const open = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await open({
        mediaTypes: ['images', 'videos'],
        base64: true,
        quality: 0.6,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      if (a.fileSize && a.fileSize > MAX_FILE_BYTES) {
        Alert.alert('Файл тым үлкен', 'Кішірек файл немесе қысқа видео таңдаңыз (шамамен 12 МБ дейін)');
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
      Alert.alert('Қате', e.message);
    } finally {
      setPicking(false);
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
        Alert.alert('Файл тым үлкен', 'Кішірек файл таңдаңыз (шамамен 12 МБ дейін)');
        return;
      }
      setPicking(true);
      const data = await readBase64(a.uri);
      attach({ name: a.name, uri: a.uri, mimeType: a.mimeType || 'application/pdf', data: data });
    } catch (e) {
      Alert.alert('Қате', e.message);
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
      Alert.alert('Қате', e.message);
      return;
    }
    setStatus((p) => ({ ...p, used: q.used, limit: q.limit, premium: q.premium }));
    if (!q.ok) {
      setLoading(false);
      Alert.alert(
        'Күндік лимит таусылды',
        q.premium ? 'Лимит ертең жаңарады' : 'Тегін тарифте күніне ' + FREE_DAILY + ' сұрақ. Premium-ға ауысып, күніне ' + PREMIUM_DAILY + ' сұрақ қойыңыз.',
        q.premium
          ? [{ text: 'OK' }]
          : [{ text: 'Жабу', style: 'cancel' }, { text: 'Premium', onPress: () => setSettings(true) }]
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
      const answer = await askGemini(API_KEY, await withData(next), profile ? profile.name : '', q.premium);
      upsert(id, (m) => m.concat([{ role: 'model', text: answer }]));
    } catch (e) {
      upsert(id, () => base);
      setInput(text);
      setFile(sentFile);
      Alert.alert('Қате', /Network request failed/i.test(e.message) ? 'Интернет байланысы жоқ. Тексеріп, қайта көріңіз' : e.message);
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
          <RichText text={item.text} />
          <TouchableOpacity onPress={() => copyText(item.text)} hitSlop={10} style={s.copyBtn}>
            <Ionicons name={copied === item.text ? 'checkmark' : 'copy-outline'} size={17} color={C.muted} />
          </TouchableOpacity>
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
        <Text style={s.hint}>{mode === 'up' ? 'Жаңа аккаунт жасау' : 'Аккаунтқа кіру'}</Text>
        {!configured && (
          <Text style={[s.hint, { color: C.danger }]}>
            Supabase бапталмаған: config.js ішіне SUPABASE_URL және SUPABASE_ANON_KEY қойыңыз
          </Text>
        )}
        {mode === 'up' && (
          <View style={s.authField}>
            <TextInput
              style={s.loginInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Атыңыз"
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
            placeholder="Құпиясөз (кемінде 6 таңба)"
            placeholderTextColor={C.muted}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submitAuth}
          />
        </View>
        <TouchableOpacity style={[s.newBtn, s.loginBtn, busy && s.sendOff]} onPress={submitAuth} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.newBtnText}>{mode === 'up' ? 'Тіркелу' : 'Кіру'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'up' ? 'in' : 'up')} hitSlop={10}>
          <Text style={s.authSwitch}>{mode === 'up' ? 'Аккаунт бар ма? Кіру' : 'Аккаунт жоқ па? Тіркелу'}</Text>
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
              <Text style={s.hello}>Сәлем, {profile ? profile.name : ''}!</Text>
              <Text style={s.hint}>Сұрақ қойыңыз, фото, видео немесе файл жіберіңіз</Text>
              <View style={s.chips}>
                {SUGGESTIONS.map((t) => (
                  <TouchableOpacity key={t} style={s.chip} onPress={() => setInput(t)}>
                    <Text style={s.chipText}>{t}</Text>
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
                <ActivityIndicator color={C.accent} />
                <Text style={s.thinking}>Ойланып жатыр...</Text>
              </View>
            ) : null
          }
        />

        {(file || picking) && (
          <View style={s.preview}>
            {picking ? (
              <>
                <ActivityIndicator color={C.accent} />
                <Text style={s.previewName}>Файл дайындалуда...</Text>
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

        <View style={s.bar}>
          <TouchableOpacity style={s.plusBtn} onPress={() => setSheet(true)} disabled={loading}>
            <Ionicons name="add" size={26} color={C.text} />
          </TouchableOpacity>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              multiline
              placeholder="Хабарлама жазыңыз..."
              placeholderTextColor={C.muted}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, !canSend && s.sendOff]}
            onPress={send}
            disabled={!canSend}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </TouchableOpacity>
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
              <Text style={s.newBtnText}>Жаңа чат</Text>
            </TouchableOpacity>

            <Text style={s.section}>Соңғы чаттар</Text>
            <FlatList
              data={chats}
              keyExtractor={(c) => c.id}
              style={s.flex}
              ListEmptyComponent={<Text style={s.noChats}>Әзірше чат жоқ</Text>}
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
              <Text style={[s.badge, premium && s.badgePro]}>{premium ? 'PRO' : left + '/' + limit}</Text>
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
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(() => pickMedia(true))}>
              <Ionicons name="camera-outline" size={24} color={C.text} />
              <Text style={s.sheetText}>Камера</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(() => pickMedia(false))}>
              <Ionicons name="images-outline" size={24} color={C.text} />
              <Text style={s.sheetText}>Галерея (фото, видео)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => choose(pickDocument)}>
              <Ionicons name="document-outline" size={24} color={C.text} />
              <Text style={s.sheetText}>Файл (PDF, TXT)</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={s.screen}>
            <View style={s.header}>
              <View style={s.iconBtn} />
              <Text style={s.headerTitle}>Баптаулар</Text>
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
                  <Text style={[s.badge, premium && s.badgePro]}>{premium ? 'PREMIUM' : 'FREE'}</Text>
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Бүгінгі қолдану</Text>
                <Text style={s.usageNum}>{used} / {limit}</Text>
                <View style={s.bar2}>
                  <View style={[s.bar2Fill, { width: Math.min(100, (used / limit) * 100) + '%' }]} />
                </View>
                <Text style={s.cardHint}>Лимит әр күні түнгі 00:00-де жаңарады</Text>
              </View>

              {!premium ? (
                <View style={[s.card, s.cardPro]}>
                  <Text style={s.cardTitle}>Dux Premium</Text>
                  <Text style={s.perk}>• Күніне {PREMIUM_DAILY} сұрақ (тегін: {FREE_DAILY})</Text>
                  <Text style={s.perk}>• Ең күшті модель: дәл жауап, күрделі код</Text>
                  <Text style={s.perk}>• Ұзын, толық жауаптар</Text>
                  <Text style={s.perk}>• Фото мен файлдарды терең талдау</Text>
                  {!!BUY_URL && (
                    <TouchableOpacity style={s.newBtn} onPress={() => Linking.openURL(BUY_URL)}>
                      <Text style={s.newBtnText}>Premium сатып алу</Text>
                    </TouchableOpacity>
                  )}
                  <View style={s.codeRow}>
                    <TextInput
                      style={s.codeInput}
                      value={codeInput}
                      onChangeText={setCodeInput}
                      placeholder="Белсендіру коды"
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
                  <Text style={s.cardTitle}>Premium белсенді</Text>
                  <Text style={s.perk}>Күніне {PREMIUM_DAILY} сұрақ және ең күшті модель қосулы.</Text>
                  {!!status.until && (
                    <Text style={s.cardHint}>Мерзімі: {new Date(status.until).toLocaleDateString()}</Text>
                  )}
                </View>
              )}

              <TouchableOpacity style={s.ghostBtn} onPress={clearAll}>
                <Text style={[s.ghostText, { color: C.danger }]}>Барлық чатты өшіру</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={() => {
                  setSettings(false);
                  setTimeout(logout, 300);
                }}
              >
                <Text style={s.ghostText}>Аккаунттан шығу</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  list: { padding: 16, paddingBottom: 8, gap: 18, flexGrow: 1 },

  userBubble: {
    alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.surface2,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 20, borderBottomRightRadius: 6, gap: 8,
  },
  userText: { color: C.text, fontSize: 16, lineHeight: 23 },
  msgImage: { width: 220, height: 220, borderRadius: 14 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileName: { color: C.text, flexShrink: 1 },
  thumbIcon: { backgroundColor: C.surface, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  botRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingRight: 12 },
  botAvatar: { width: 28, height: 28, borderRadius: 8, marginTop: 2 },
  botBody: { flex: 1, gap: 6 },
  rich: { gap: 10 },
  heading: { fontWeight: '700', fontSize: 17 },
  copyBtn: { alignSelf: 'flex-start', padding: 2 },
  botText: { color: C.text, fontSize: 16, lineHeight: 24 },
  bold: { fontWeight: '700' },
  inlineCode: { fontFamily: MONO, backgroundColor: C.surface2, color: '#ffb86c' },
  codeBox: { backgroundColor: '#0a0b0d', borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  codeLang: { color: C.muted, fontSize: 12 },
  codeText: { color: '#d6e2ff', fontFamily: MONO, fontSize: 13.5, lineHeight: 20 },
  thinking: { color: C.muted, fontSize: 15 },

  empty: { alignItems: 'center', paddingTop: 70, gap: 10, paddingHorizontal: 10 },
  logo: { width: 84, height: 84, borderRadius: 22, marginBottom: 6 },
  hello: { color: C.text, fontSize: 24, fontWeight: '700' },
  hint: { color: C.muted, textAlign: 'center', fontSize: 15 },
  chips: { marginTop: 22, gap: 10, alignSelf: 'stretch' },
  chip: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16 },
  chipText: { color: C.text, fontSize: 15 },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6,
    padding: 8, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
  },
  previewName: { flex: 1, color: C.text },

  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10, gap: 8 },
  plusBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  input: { color: C.text, fontSize: 16, maxHeight: 130, minHeight: 42, paddingVertical: 10 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: C.surface2, opacity: 0.6 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.surface, paddingHorizontal: 14, paddingTop: 14, borderRightWidth: 1, borderRightColor: C.border },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, paddingHorizontal: 4 },
  drawerLogo: { width: 34, height: 34, borderRadius: 10 },
  drawerTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 13 },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { color: C.muted, fontSize: 13, marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  noChats: { color: C.muted, paddingHorizontal: 4, paddingTop: 6 },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14 },
  chatItemActive: { backgroundColor: C.surface2 },
  chatTitle: { flex: 1, color: C.text, fontSize: 15 },

  loginWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  loginInputWrap: { alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, marginTop: 18 },
  loginInput: { color: C.text, fontSize: 17, minHeight: 50 },
  loginBtn: { alignSelf: 'stretch' },
  authField: { alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  authSwitch: { color: C.accent, fontSize: 15, marginTop: 6 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  profileName: { flex: 1, color: C.text, fontSize: 16 },

  badge: { color: C.muted, fontSize: 12, fontWeight: '700', backgroundColor: C.surface2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  badgePro: { color: '#fff', backgroundColor: C.accent },
  setList: { padding: 16, gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  cardPro: { borderColor: C.accent },
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

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 28, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 8 },
  sheetText: { color: C.text, fontSize: 17 },
});
