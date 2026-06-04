// Platform store factory. Metro resolves platformStore.web.ts on web and
// platformStore.native.ts on iOS/Android; this file is the TypeScript-visible
// fallback (both impls share the same signature). Importing from here keeps
// expo-sqlite out of the web bundle and IndexedDB out of native.
export { createStore } from './platformStore.web';
