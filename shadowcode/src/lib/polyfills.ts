/**
 * Old-WebView insurance.
 *
 * Bundled libraries reach for a handful of ES2019+ runtime helpers. Parsing is
 * handled by the build target, but a missing *function* throws at runtime — and
 * that is exactly the kind of thing that looks like "the app crashed". Each
 * shim is a no-op on modern engines.
 */

type Any = any

export function installPolyfills() {
  const g: Any = typeof globalThis !== 'undefined' ? globalThis : (window as Any)

  if (typeof g.globalThis === 'undefined') g.globalThis = g

  if (typeof (Object as Any).fromEntries !== 'function') {
    ;(Object as Any).fromEntries = function fromEntries(entries: Iterable<[string, Any]>) {
      const out: Any = {}
      for (const pair of entries) {
        const arr = pair as Any
        out[arr[0]] = arr[1]
      }
      return out
    }
  }

  if (typeof (Object as Any).hasOwn !== 'function') {
    ;(Object as Any).hasOwn = function hasOwn(obj: Any, key: PropertyKey) {
      return Object.prototype.hasOwnProperty.call(obj, key)
    }
  }

  const ArrayProto: Any = Array.prototype
  if (typeof ArrayProto.flat !== 'function') {
    ArrayProto.flat = function flat(depth?: number) {
      const d = depth === undefined ? 1 : Number(depth)
      const out: Any[] = []
      const walk = (arr: Any[], level: number) => {
        for (const v of arr) {
          if (Array.isArray(v) && level > 0) walk(v, level - 1)
          else out.push(v)
        }
      }
      walk(this as Any[], d > 0 ? d : 0)
      return out
    }
  }
  if (typeof ArrayProto.flatMap !== 'function') {
    ArrayProto.flatMap = function flatMap(fn: Any, thisArg?: Any) {
      const out: Any[] = []
      const src = this as Any[]
      for (let i = 0; i < src.length; i++) {
        const r = fn.call(thisArg, src[i], i, src)
        if (Array.isArray(r)) out.push.apply(out, r)
        else out.push(r)
      }
      return out
    }
  }
  if (typeof ArrayProto.at !== 'function') {
    ArrayProto.at = function at(n: number) {
      const len = this.length >>> 0
      let i = Math.trunc(n) || 0
      if (i < 0) i += len
      return i < 0 || i >= len ? undefined : this[i]
    }
  }
  const StringProto: Any = String.prototype
  if (typeof StringProto.at !== 'function') {
    StringProto.at = function at(n: number) {
      const s = String(this)
      let i = Math.trunc(n) || 0
      if (i < 0) i += s.length
      return i < 0 || i >= s.length ? undefined : s.charAt(i)
    }
  }
  if (typeof StringProto.matchAll !== 'function') {
    StringProto.matchAll = function matchAll(re: Any) {
      const str = String(this)
      const rx = re instanceof RegExp ? re : new RegExp(String(re), 'g')
      const flags = rx.flags.indexOf('g') >= 0 ? rx.flags : rx.flags + 'g'
      const re2 = new RegExp(rx.source, flags)
      const out: Any[] = []
      let m: RegExpExecArray | null
      let guard = 0
      while ((m = re2.exec(str)) !== null && guard++ < 100000) {
        out.push(m)
        if (m[0] === '') re2.lastIndex++
      }
      const iter: Any = {}
      iter[Symbol.iterator] = function () {
        let idx = 0
        return {
          next() {
            return idx < out.length ? { value: out[idx++], done: false } : { value: undefined, done: true }
          },
        }
      }
      return iter
    }
  }
  if (typeof StringProto.replaceAll !== 'function') {
    StringProto.replaceAll = function replaceAll(find: Any, rep: Any) {
      const str = String(this)
      if (find instanceof RegExp) return str.split(find).join(typeof rep === 'string' ? rep : '')
      return str.split(String(find)).join(String(rep))
    }
  }
  if (typeof StringProto.trimStart !== 'function') {
    StringProto.trimStart = function () {
      return String(this).replace(/^\s+/, '')
    }
  }
  if (typeof StringProto.trimEnd !== 'function') {
    StringProto.trimEnd = function () {
      return String(this).replace(/\s+$/, '')
    }
  }

  const PromiseAny: Any = Promise as Any
  if (typeof PromiseAny.allSettled !== 'function') {
    PromiseAny.allSettled = function allSettled(list: Any[]) {
      return Promise.all(
        list.map((p) =>
          Promise.resolve(p).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason }),
          ),
        ),
      )
    }
  }
  if (typeof PromiseAny.any !== 'function') {
    PromiseAny.any = function any(list: Any[]) {
      return new Promise((resolve, reject) => {
        let left = list.length
        let failed = 0
        const errors: Any[] = []
        if (!left) reject(new Error('AggregateError: no promises'))
        list.forEach((p, i) => {
          Promise.resolve(p).then(resolve, (e) => {
            errors[i] = e
            if (++failed === left) reject(errors)
          })
        })
      })
    }
  }

  if (typeof g.queueMicrotask !== 'function') {
    g.queueMicrotask = function queueMicrotask(fn: () => void) {
      Promise.resolve().then(fn)
    }
  }
  if (typeof g.requestIdleCallback !== 'function') {
    g.requestIdleCallback = function requestIdleCallback(fn: Any) {
      const start = Date.now()
      return setTimeout(() => {
        fn({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) })
      }, 1)
    }
    g.cancelIdleCallback = function cancelIdleCallback(id: Any) {
      clearTimeout(id)
    }
  }
  // ResizeObserver is used by the editor libraries; without it, opening Studio throws.
  if (typeof g.ResizeObserver !== 'function') {
    g.ResizeObserver = class ResizeObserverShim {
      private cb: Any
      constructor(cb: Any) {
        this.cb = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

installPolyfills()
