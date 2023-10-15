import {debounce} from 'throttle-debounce';
import * as fs from 'fs';

export async function makePersistent(storageFilePath, obj, opts = {}) {
  const persist = debounce(opts.ttl || 1, valObj => {
    fs.writeFile(
      storageFilePath,
      JSON.stringify(Object.entries(valObj), null, 2),
      err => {
        err && console.error(err);
      },
    );
  });
  const data = await restore(storageFilePath, obj);
  const proxify = obj => {
    return new Proxy(obj, {
      get(target, prop, receiver) {
        if (typeof target[prop] === 'object' && !Array.isArray(target[prop])) {
          return proxify(target[prop]);
        }
        return target[prop];
      },
      set(target, prop, newValue, receiver) {
        target[prop] = newValue;
        persist(data);
        return true;
      },
    });
  };

  return proxify(data);
}

async function restore(storageFilePath, obj) {
  return new Promise((resolve, reject) => {
    fs.stat(storageFilePath, err => {
      if (err) {
        return resolve(obj);
      }
      fs.readFile(storageFilePath, (err, data) => {
        if (err) {
          return reject(err);
        }
        if (data && data.length) {
          const restored = JSON.parse(data.toString('utf-8'));
          for (const [k, v] of restored) {
            obj[k] = v;
          }
        }
        resolve(obj);
      });
    });
  });
}
