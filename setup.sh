#!/usr/bin/env bash
# Dux AI жобасын бір командамен дайындайды: bash setup.sh
set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npx create-expo-app@latest dux-ai --template blank --no-install
cd dux-ai
cp "$REPO"/App.js "$REPO"/gemini.js "$REPO"/app.json "$REPO"/eas.json "$REPO"/.gitignore .
rm -rf assets && cp -r "$REPO"/assets ./assets
npm install
npx expo install expo-image-picker expo-document-picker @react-native-async-storage/async-storage react-native-safe-area-context react-native-screens @expo/vector-icons
[ -f "$REPO/.env" ] && cp "$REPO/.env" .env || cp "$REPO/.env.example" .env
echo
echo "Дайын: $(pwd)"
echo "1) .env файлына Gemini кілтін қойыңыз"
echo "2) cd $(pwd) && npx expo start"
