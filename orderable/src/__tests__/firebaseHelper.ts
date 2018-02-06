import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'

export class FirebaseHelper {
  private static _shared?: FirebaseHelper
  private constructor() { }
  static get shared(): FirebaseHelper {
    if (!this._shared) {
      this._shared = new FirebaseHelper()

      const serviceAccount = require('../../../sandbox-329fc-firebase-adminsdk.json')
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      })

      Pring.initialize({
        projectId: 'sandbox-329fc',
        keyFilename: '../sandbox-329fc-firebase-adminsdk.json'
      })

      Orderable.initialize({
        adminOptions: {
          projectId: 'sandbox-329fc',
          keyFilename: '../sandbox-329fc-firebase-adminsdk.json'
        },
        stripeToken: process.env.stripe as string,
        slack: undefined
      })
    }

    return this._shared
  }

  static makeEvent(ref: FirebaseFirestore.DocumentReference, data: any, previousData: any) {
    return <functions.Event<DeltaDocumentSnapshot>>{
      data: {
        exists: true,
        ref: ref,
        id: '',
        createTime: '',
        updateTime: '',
        readTime: '',
        previous: { data: () => { return previousData } },
        data: () => { return data },
        get: (key: string) => { return undefined }
      }
    }
  }

  static orderObject(event: functions.Event<DeltaDocumentSnapshot>) {
    return new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
      order: Model.SampleOrder,
      shop: Model.SampleShop,
      user: Model.SampleUser,
      sku: Model.SampleSKU,
      product: Model.SampleProduct,
      orderShop: Model.SampleOrderShop,
      orderSKU: Model.SampleOrderSKU
    })
  }

  static makeOrder = async () => {
    const user = new Model.SampleUser()
    user.stripeCustomerID = 'cus_CC65RZ8Gf6zi7V'
    await user.save()

    const shop = new Model.SampleShop()
    shop.name = 'shop'
    await shop.save()

    const product1 = new Model.SampleProduct()
    product1.name = 'pro1'
    await product1.save()

    const product2 = new Model.SampleProduct()
    product2.name = 'pro2'
    await product2.save()

    const sku1 = new Model.SampleSKU()
    sku1.price = 100
    sku1.stockType = Orderable.Model.StockType.Finite
    sku1.stock = 1000
    await sku1.save()
    const sku2 = new Model.SampleSKU()
    sku2.price = 400
    sku2.stockType = Orderable.Model.StockType.Finite
    sku2.stock = 5000
    await sku2.save()

    const stripeCharge = new Model.SampleStripeCharge()
    stripeCharge.cardID = 'card_1BnhthKZcOra3JxsKaxABsRj'
    stripeCharge.customerID = user.stripeCustomerID

    const order = new Model.SampleOrder()
    order.user = user.reference
    order.amount = 1000
    order.currency = 'jpy'
    order.paymentStatus = Orderable.Model.OrderPaymentStatus.Created
    order.stripe = stripeCharge.rawValue()

    const orderSKU1 = new Model.SampleOrderSKU()
    orderSKU1.snapshotSKU = sku1.rawValue()
    orderSKU1.snapshotProduct = product1.rawValue()
    orderSKU1.quantity = 1
    orderSKU1.sku = sku1.reference
    orderSKU1.shop = shop.reference

    const orderSKU2 = new Model.SampleOrderSKU()
    orderSKU2.snapshotSKU = sku2.rawValue()
    orderSKU2.snapshotProduct = product2.rawValue()
    orderSKU2.quantity = 2
    orderSKU2.sku = sku2.reference
    orderSKU2.shop = shop.reference

    const orderShop = new Model.SampleOrderShop()
    orderShop.orderSKUs.insert(orderSKU1)
    orderShop.orderSKUs.insert(orderSKU2)
    orderShop.paymentStatus = Orderable.Model.OrderShopPaymentStatus.Created
    orderShop.user = user.reference
    orderShop.order = order.reference

    order.orderSKUs.insert(orderSKU1)
    order.orderSKUs.insert(orderSKU2)

    console.log('orderSKU1', orderSKU1.id)
    await orderShop.save()

    await order.save()

    return order
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
