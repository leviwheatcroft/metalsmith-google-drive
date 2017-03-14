import persist from 'node-persist'
import debug from 'debug'
import { join } from 'path'
import {
  existsSync as exists,
  mkdirSync as mkdir,
  readFileSync as readFile
} from 'fs'

const dbg = debug('metalsmith-google-drive')
const rootDir = '.store'

// if (!exists(rootDir)) mkdir(rootDir)
if (!new RegExp(rootDir).exec(readFile('.gitignore').toString())) {
  dbg(`WARN: you probably want to .gitignore the ${rootDir} folder`)
}

class Store {
  constructor (id) {
    if (!id) throw new Error('Store constructor: id required')
    this.id = id
    this.name = this.id.slice(-8)
    this.persist = persist.create({dir: join(rootDir, this.name)})
    this.persist.initSync({
      continuous: true,
      interval: false,
      expiredInterval: false
    })
  }
  getResources (dest = '') {
    const items = {}
    this.persist.forEach((key, value) => { items[dest + value.name] = value })
    dbg(`got ${Object.keys(items).length} files from ${this.name}`)
    return items
  }
  getResource (key) {
    return this.persist.getItemSync(key)
  }
  setResources (items) {
    for (let k in items) this.persist.setItemSync(k, items[k])
  }
  setResource (key, item) {
    this.persist.setItemSync(key, item)
  }
  removeResource (key) {
    this.persist.removeItemSync(key)
  }
  invalidate () {
    this.persist.clearSync()
  }
}

/*
 * ### params
 *
 * I thought about using ES6 style getters and setters here but that would only
 * be possible for the `token` resource, and I decided against it because it's
 * more consistent with the other properties just to use the old style.
 *
 */
class Params {
  constructor () {
    this.persist = persist.create({
      dir: join(rootDir, 'params'),
      continuous: false,
      interval: false,
      expiredInterval: false
    })
    this.persist.initSync()
  }
  getLastRun (store) {
    return this.persist.getItemSync(`lastRun${store.name}`)
  }
  setLastRun (store, value) {
    const key = `lastRun${store.name}`
    if (value === false) this.persist.removeItemSync(key)
    else this.persist.setItemSync(key, value || new Date().toISOString())
  }
  getToken () {
    return this.persist.getItemSync('token')
  }
  setToken (token) {
    this.persist.setItemSync('token', token)
  }
  invalidate (keepToken = true) {
    const token = this.persist.getItemSync('token')
    this.persist.clearSync()
    if (keepToken) this.persist.setItemSync('token', token)
  }
}

// export singleton
const params = new Params()

export {
  Store,
  params
}
