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
