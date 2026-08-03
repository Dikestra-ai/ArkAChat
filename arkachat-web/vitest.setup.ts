// Test setup file for vitest
import { vi, beforeEach } from 'vitest';

// Mock localStorage with proper methods
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
  get length() {
    return Object.keys(localStorageMock.store).length;
  },
  key: vi.fn((index: number) => {
    const keys = Object.keys(localStorageMock.store);
    return keys[index] ?? null;
  }),
};

// Set up global localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock indexedDB for Shield tests
const indexedDBMock = {
  open: vi.fn(() => {
    const request = {
      result: null as IDBDatabase | null,
      error: null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
    };

    // Simulate async open
    setTimeout(() => {
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => ({}),
        transaction: () => ({
          objectStore: () => ({
            get: () => ({ onsuccess: null, onerror: null }),
            put: () => ({ onsuccess: null, onerror: null }),
            delete: () => ({ onsuccess: null, onerror: null }),
          }),
          oncomplete: null,
          onerror: null,
        }),
      } as unknown as IDBDatabase;

      request.result = db;
      if (request.onupgradeneeded) {
        request.onupgradeneeded({ target: request } as unknown as IDBVersionChangeEvent);
      }
      if (request.onsuccess) {
        request.onsuccess({ target: request } as unknown as Event);
      }
    }, 0);

    return request;
  }),
};

Object.defineProperty(globalThis, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
});

// Clear localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
});
