import persist from 'node-persist'
import debug from 'debug'
import { join } from 'path'
import {
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
    dbg(`instantiating store at ${join(rootDir, this.name)}`)
    this.persist = persist.create({
      dir: join(rootDir, this.name),
      continuous: true,
      interval: false,
      expiredInterval: false
    })
    this.persist.initSync()
  }
  getResources (dest = '') {
    const items = {}
    this.persist.forEach((key, value) => {
      items[join(dest, value.name)] = value
    })
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
    dbg(`instantiating store at ${join(rootDir, 'params')}`)
    this.persist = persist.create({
      dir: join(rootDir, 'google-drive-params'),
      continuous: true,
      interval: false,
      expiredInterval: false
    })
    this.persist.initSync()
  }
  getLastRun (folder) {
    const key = `lastRun${folder.store.name}`
    const value = this.persist.getItemSync(key)
    dbg(`${key} was ${value}`)
    return value
  }
  setLastRun (folder, value) {
    const key = `lastRun${folder.store.name}`
    value = value === false ? false : value || new Date().toISOString()
    this.persist.setItemSync(key, value)
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
