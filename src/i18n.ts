import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ja from './locales/ja.json';

const resources = {
  en: {
    translation: en
  },
  ja: {
    translation: ja
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: undefined, // Let detection determine the language
    fallbackLng: 'ja',
    defaultNS: 'translation',

    interpolation: {
      escapeValue: false
    },

    detection: {
      order: ['localStorage', 'querystring', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      lookupQuerystring: 'locale',
      caches: ['localStorage']
    }
  });

export default i18n;
