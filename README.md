<div align="center">
  <img src="./assets/icon.png" width="120" height="120" alt="WordFlip logo" />

  # WordFlip

  ### Learn vocabulary the smart way — flashcards, spaced repetition, writing & voice practice 🧠

  [![Expo SDK 55](https://img.shields.io/badge/Expo-55-000020?style=for-the-badge&logo=expo&logoColor=white)](https://docs.expo.dev/versions/v55.0.0/)
  [![React Native](https://img.shields.io/badge/React%20Native-0.83-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-cloud%20sync-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
  [![FSRS-5](https://img.shields.io/badge/Algorithm-FSRS--5-A78BFA?style=for-the-badge)](https://github.com/open-spaced-repetition/ts-fsrs)
  [![Tests](https://img.shields.io/badge/tests-47%20passing-22c55e?style=for-the-badge&logo=jest&logoColor=white)](#-testing)
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge)](LICENSE)

  [![Download APK](https://img.shields.io/badge/Download-Android%20APK-a78bfa?style=for-the-badge&logo=android&logoColor=white)](https://github.com/0zkan95/WordFlip/releases/latest/download/WordFlip-v1.0.1.apk)

</div>

---

## ✨ Overview

**WordFlip** is a cross-platform (iOS, Android & Web) language-learning flashcard app built with **Expo + React Native**. It combines classic flashcards with the **FSRS-5 spaced-repetition algorithm**, optional **writing** and **voice pronunciation** drills, and a full **gamification layer** (XP, levels, streaks, notifications) to keep you coming back every day — all backed by a local-first SQLite database with optional Supabase cloud sync.

---

## 🚀 Features

| | |
|---|---|
| 📚 **Custom decks** | Create decks for any of 16 languages, pick a source → target language pair, and tag each deck with an emoji icon |
| 🧠 **FSRS-5 scheduling** | Every review (Again / Hard / Good / Easy) feeds the FSRS algorithm to compute the optimal next review date |
| 🔄 **Two-way cards** | Optionally study cards in both directions (front → back *and* back → front) |
| ✍️ **Writing exercises** | Practice spelling/translation by typing the answer, with correct / close / wrong scoring |
| 🎙️ **Voice exercises** | Speak the translation out loud — powered by on-device speech recognition & text-to-speech |
| 🔥 **Daily streaks** | Track your study streak, with streak-freeze tokens to protect it on busy days |
| ⭐ **XP & leveling** | Earn XP per review, level up, and unlock milestone notifications |
| 📊 **Statistics dashboard** | 5-week activity heatmap, per-deck retention %, average stability, and lifetime totals |
| 🔔 **Smart notifications** | Streak reminders plus in-app alerts for level-ups, streak milestones, and XP milestones |
| ☁️ **Cloud sync** | Sign in with Supabase to back up and sync your progress across devices |
| 🌙 **Polished dark UI** | A clean, modern, single-accent dark theme throughout |

---

## 🛠 Tech Stack

- **[Expo SDK 55](https://docs.expo.dev/versions/v55.0.0/)** + **Expo Router** (file-based navigation)
- **React Native 0.83** / **React 19**
- **TypeScript**
- **expo-sqlite** — local-first persistent storage
- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)** — FSRS-5 spaced-repetition scheduler
- **expo-speech-recognition** + **expo-speech** — voice exercises
- **expo-notifications** — streak reminders & milestone alerts
- **Supabase** — authentication & cloud sync
- **Zustand** — state management
- **Jest** + **@testing-library/react-native** — unit/component/hook/screen tests

---

## 📋 Prerequisites

- **[Node.js](https://nodejs.org/)** 20 or newer + npm
- **Git**
- A phone with the **[Expo Go](https://expo.dev/go)** app *(easiest way to try the app)*
- For native builds:
  - **Android**: [Android Studio](https://developer.android.com/studio) with an Android SDK + NDK installed
  - **iOS**: a Mac with **Xcode** (iOS builds cannot be built on Windows/Linux)

---

## ⚙️ Installation

```bash
# 1. Clone the repository
git clone https://github.com/0zkan95/WordFlip.git
cd WordFlip

# 2. Install dependencies (also applies node_modules patches via patch-package)
npm install
```

### Environment variables (optional — only needed for cloud sync)

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> WordFlip works fully offline without this — all decks, cards, and progress are stored locally in SQLite. Supabase is only needed if you want to sign in and sync across devices.

---

## ▶️ Running the App

### 📱 Android

**Option A — Download the prebuilt APK (easiest)**

Grab the latest signed APK from the [**Releases page**](https://github.com/0zkan95/WordFlip/releases/latest), or download it directly:

[![Download APK](https://img.shields.io/badge/Download-WordFlip--v1.0.1.apk-a78bfa?style=for-the-badge&logo=android&logoColor=white)](https://github.com/0zkan95/WordFlip/releases/latest/download/WordFlip-v1.0.1.apk)

Transfer the `.apk` to your Android device and open it (enable **"Install unknown apps"** for your file manager/browser first), or install via ADB:

```bash
adb install WordFlip-v1.0.1.apk
```

**Option B — Expo Go (fastest for development)**

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app from the Play Store.

**Option C — Native development build**

```bash
npx expo run:android
```

Requires Android Studio with the SDK/NDK configured.

**Option D — Build a release APK yourself**

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The signed APK will be generated at:

```
android/app/build/outputs/apk/release/app-release.apk
```

Install it on a connected device via:

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

...or transfer the `.apk` file to your phone and open it (enable **"Install unknown apps"** for your file manager first).

### 🍎 iOS

**Option A — Expo Go (fastest)**

```bash
npx expo start
```

Scan the QR code using your iPhone's **Camera** app — it will open in Expo Go.

> ⚠️ Voice exercises rely on native speech recognition and require a **development build** rather than Expo Go.

**Option B — Native development build (macOS only)**

```bash
npx expo run:ios
```

Requires Xcode and a Mac.

### 🌐 Web

```bash
npx expo start --web
```

---

## 🧪 Testing

WordFlip ships with a full test suite covering database queries, the FSRS scheduler, hooks, components, and screens.

```bash
npm test          # run all tests
npm run test:watch  # watch mode
```

---

## 🗂 Project Structure

```
WordFlip/
├── app/                      # Expo Router screens (file-based routing)
│   ├── (tabs)/               # Home, Study, Stats, Profile tabs
│   ├── auth/                 # Sign in / sign up
│   ├── deck/[id]/             # Deck detail, add/edit card, deck settings
│   ├── notifications/        # In-app notification center
│   ├── streak/                # Streak detail screen
│   └── xp/                    # XP & level detail screen
├── src/
│   ├── components/           # FlashCard, RatingButtons, Writing/Voice exercise cards
│   ├── context/               # Auth & Database React contexts
│   ├── db/                    # SQLite schema & queries
│   ├── fsrs/                  # FSRS-5 scheduler wrapper
│   ├── hooks/                 # useStudySession
│   ├── lib/                   # Storage & Supabase client
│   ├── notifications/         # Push & streak reminder logic
│   ├── sync/                  # Supabase sync service
│   ├── theme/                 # Color palette
│   └── utils/                 # Speech helpers (native + web)
└── assets/                    # App icons & splash screens
```

---

## 🧠 How the Spaced Repetition Works

Every flashcard you review is rated on a 4-point scale, which feeds the **FSRS-5** algorithm to schedule the next review at the optimal moment for long-term retention:

| Rating | Meaning | XP earned |
|---|---|---|
| 1 — Again | You forgot it | +5 |
| 2 — Hard | Recalled with difficulty | +10 |
| 3 — Good | Recalled correctly | +15 |
| 4 — Easy | Recalled instantly | +20 |

- 🔥 **Streak multipliers** boost rewards: 2× at a 7-day streak, 3× at 30 days.
- 🎯 Reviewing **at least 10 cards** in a day counts toward your streak.
- 🏆 Leveling uses an exponential XP curve, with in-app + push notifications for level-ups, streak milestones, and XP milestones.

---

## 🤝 Contributing

Issues and pull requests are welcome! If you find a bug or have a feature idea, feel free to open an issue.

---

## 📄 License

This project is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Made with ❤️ and a lot of ✨ spaced repetition ✨
</div>
