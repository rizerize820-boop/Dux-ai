# Dux AI

Фото, видео, PDF түсінетін, көп тілді, код жазатын чат-қолданба (Expo + Gemini).

## Іске қосу (iPhone)
1. Компьютерге Node.js орнатыңыз, iPhone-ға **Expo Go** қолданбасын App Store-дан жүктеңіз.
2. Репозиторийді жүктеп алыңыз және `bash setup.sh` іске қосыңыз.
3. Шыққан папкада `.env` файлына кілтті жазыңыз: `EXPO_PUBLIC_GEMINI_API_KEY=...`
4. `npx expo start` — шыққан QR-кодты iPhone камерасымен сканерлеңіз.

## Өз қолданбасы ретінде (App Store / TestFlight)
Apple Developer аккаунты керек ($99/жыл).
```
npm i -g eas-cli
eas login
eas build -p ios --profile production
eas submit -p ios
```
Кілтті EAS-қа қосу: `eas secret:create --name EXPO_PUBLIC_GEMINI_API_KEY --value ...`

## Қауіпсіздік
Қолданбаға салынған кілтті сынап алуға болады. Жария шығарудан бұрын сұрауларды өз серверіңіз (прокси) арқылы жіберіңіз.

## Аккаунттар базасы (Supabase, тегін)
1. supabase.com → New project (карта қажет емес). Жоба дайын болғанша 1–2 минут күтіңіз.
2. **SQL Editor → New query**: `supabase/schema.sql` мазмұнын қойып, **Run** басыңыз.
3. **Authentication → Providers → Email**: қарапайымдық үшін *Confirm email* өшіріңіз.
4. **Project Settings → API**: `Project URL` мен `anon public` кілтін `config.js` ішіндегі `SUPABASE_URL` және `SUPABASE_ANON_KEY` жолдарына қойыңыз.
5. Premium кодтары: SQL Editor-де `insert into public.codes (code, days) values ('DUX-XXXX-1111', 30);`
   (код бір рет қана жұмыс істейді, күндік лимит пен тариф серверде тексеріледі).

## APK (Android)
GitHub → Actions → **Build Android APK** → Run workflow. 15–25 минуттан кейін аяқталған іске қосудан **DuxAI-apk** артефактын жүктеңіз (ішінде `DuxAI.apk`).
Телефонда APK ашыңыз да, «Белгісіз көздерден орнатуға» рұқсат беріңіз. APK arm64 телефондарға арналған (қазіргі телефондардың басым көпшілігі).

## Тілдер
Интерфейс қазақша, орысша және ағылшынша. Тілді Баптаулар → Тіл бөлімінен ауыстыруға болады; бастапқыда құрылғы тілі алынады.
