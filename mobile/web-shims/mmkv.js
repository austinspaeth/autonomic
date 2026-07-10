/**
 * Web shim for react-native-mmkv. MMKV is a native (JSI) module with no web
 * build, so on web we back the same synchronous key/value API with
 * localStorage. Only the methods the app actually uses are guaranteed real;
 * the rest are provided for API completeness. Instances are namespaced by
 * their `id` so multiple stores don't collide.
 */
function prefixFor(config) {
  const id = (config && config.id) || 'mmkv.default';
  return 'mmkv.' + id + '.';
}

function safeLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* access can throw in sandboxed contexts */
  }
  return null;
}

export class MMKV {
  constructor(config) {
    this._prefix = prefixFor(config);
    this._ls = safeLocalStorage();
    this._mem = {}; // fallback when localStorage is unavailable
  }

  _key(k) {
    return this._prefix + k;
  }

  set(key, value) {
    const v = String(value);
    if (this._ls) this._ls.setItem(this._key(key), v);
    else this._mem[key] = v;
  }

  getString(key) {
    if (this._ls) {
      const v = this._ls.getItem(this._key(key));
      return v === null ? undefined : v;
    }
    return key in this._mem ? this._mem[key] : undefined;
  }

  getNumber(key) {
    const v = this.getString(key);
    return v === undefined ? undefined : Number(v);
  }

  getBoolean(key) {
    const v = this.getString(key);
    return v === undefined ? undefined : v === 'true';
  }

  contains(key) {
    return this.getString(key) !== undefined;
  }

  delete(key) {
    if (this._ls) this._ls.removeItem(this._key(key));
    else delete this._mem[key];
  }

  getAllKeys() {
    if (this._ls) {
      const out = [];
      for (let i = 0; i < this._ls.length; i++) {
        const k = this._ls.key(i);
        if (k && k.startsWith(this._prefix)) out.push(k.slice(this._prefix.length));
      }
      return out;
    }
    return Object.keys(this._mem);
  }

  clearAll() {
    this.getAllKeys().forEach((k) => this.delete(k));
  }

  // Reactive helpers exist on the native class; harmless no-ops on web.
  addOnValueChangedListener() {
    return { remove() {} };
  }
  recrypt() {}
}

export default { MMKV };
