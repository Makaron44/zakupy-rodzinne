# Rodzinne Zakupy 🛒👨‍👩‍👧‍👦

Nowoczesna, bezpieczna i niezwykle szybka aplikacja do wspólnego zarządzania listą zakupów i kartami lojalnościowymi.

## Funkcje
- 🛡️ **Prywatność**: Logowanie i autoryzacja za pomocą Supabase. Każda rodzina ma swoją bezpieczną przestrzeń.
- 👨‍👩‍👧‍👦 **Grupy Rodzinne**: Twórz grupy i zapraszaj bliskich za pomocą unikalnych kodów.
- ⚡ **Real-time**: Synchronizacja w czasie rzeczywistym między wszystkimi urządzeniami.
- 🧺 **Inteligentny Koszyk**: Kupione produkty lądują w osobnej sekcji z opcją masowego czyszczenia.
- 🧠 **Szybkie Dodawanie**: Aplikacja uczy się Twoich nawyków i oferuje pigułki historii dla najczęstszych zakupów.
- 💳 **Karty Lojalnościowe**: Przechowuj kody kart w jednym miejscu (z generatorami kodów kreskowych).
- 📲 **PWA**: Możliwość zainstalowania na ekranie głównym telefonu.

## Technologie
- **Frontend**: Vanilla JS, Vite, CSS (Glassmorphism design)
- **Backend**: Supabase (Auth, DB, Realtime, RLS)
- **Biblioteki**: JsBarcode, Toastify-js

## Instalacja Lokalna
1. Sklonuj repozytorium.
2. Wykonaj `npm install`.
3. Stwórz plik `.env` i dodaj swoje klucze `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY`.
4. Uruchom `npm run dev`.
