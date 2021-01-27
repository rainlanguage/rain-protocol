import { writable } from "svelte/store"

const v = 2

export const createWritableLocalStore = (key, startValue) => {
  const { subscribe, set, update } = writable(startValue);

	return {
    subscribe,
    set,
    update,
    useLocalStorage: () => {
      const json = localStorage.getItem(key + v);
      if (json) {
        set(JSON.parse(json));
      }

      subscribe(current => {
        localStorage.setItem(key + v, JSON.stringify(current));
      });
    }
  };
}
