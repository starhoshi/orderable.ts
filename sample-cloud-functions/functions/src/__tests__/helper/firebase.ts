import * as admin from 'firebase-admin'
import { Pring } from 'pring'
// import * as Orderable from '@star__hoshi/orderable'
import * as Orderable from '../../orderable.develop'

export class FirebaseHelper {
  private static _shared?: FirebaseHelper
  private constructor() { }
  static get shared(): FirebaseHelper {
    if (!this._shared) {
      this._shared = new FirebaseHelper()

      const serviceAccount = require('../../../../../sandbox-329fc-firebase-adminsdk.json')
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      })

      Pring.initialize({
        projectId: 'sandbox-329fc',
        keyFilename: '../../sandbox-329fc-firebase-adminsdk.json'
      })

      Orderable.initialize({
        adminOptions: {
          projectId: 'sandbox-329fc',
          keyFilename: '../../sandbox-329fc-firebase-adminsdk.json'
        },
        stripeToken: ''
      })
    }

    return this._shared
  }

  /// 指定した DocumentReference を observe する。 `timeout` を超えたらエラーを返す
  static observe(documentRef: FirebaseFirestore.DocumentReference, callback: (data: any, resolve: any, reject: any) => void) {
    const timeout = 30000

    var timer: NodeJS.Timer
    var index = 0
    var observer = Function()

    return new Promise((resolve, reject) => {
      observer = documentRef.onSnapshot(s => {
        callback(s.data(), resolve, reject)
      }, error => {
        reject(error)
      })

      timer = setTimeout(() => {
        reject(`timeout ${timeout}`)
      }, timeout)
    }).then(() => {
      clearTimeout(timer)
      observer() // dispose
      return Promise.resolve()
    }).catch(error => {
      clearInterval(timer)
      observer() // dispose
      return Promise.reject(error)
    })
  }
}
