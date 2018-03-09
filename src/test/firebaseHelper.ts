import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
// import { Pring, property } from 'pring'
import * as Orderable from '../index'
// import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Retrycf from 'retrycf'
import * as Stripe from 'stripe'
import * as EventResponse from 'event-response'
import * as Tart from '../tart'

const stripe = new Stripe(process.env.STRIPE as string)

export const createOrder = () => {
  const ref = admin.firestore().collection('version/1/order').doc()
  const snapshot = {
    ref: ref,
    data: () => {
      return <Orderable.OrderProtocol>{
        user: '' as any,
        amount: 1000,
        paymentStatus: 1
      }
    }
  }
  return new Tart.Snapshot<Orderable.OrderProtocol>(snapshot as any)
}

export interface SampleModel {
  user: Tart.Snapshot<Orderable.UserProtocol>,
  shops: Tart.Snapshot<Orderable.ShopProtocol>[],
  products: Tart.Snapshot<Orderable.ProductProtocol>[],
  skus: Tart.Snapshot<Orderable.SKUProtocol>[],
  order: Tart.Snapshot<Orderable.OrderProtocol>,
  orderShops: Tart.Snapshot<Orderable.OrderShopProtocol>[],
  orderSKUs: Tart.Snapshot<Orderable.OrderSKUProtocol>[]
}

export interface DataSetOrder {
  amount?: number
  currency?: string
  paymentStatus?: Orderable.OrderPaymentStatus
  expirationDate?: Date
  stripe?: {
    cardID: string,
    customerID: string,
    chargeID?: string
  }
  retry?: {
    count: number,
    errors: Array<any>
  }
}

export interface DataSet {
  shops?: {
    name?: string,
    isActive?: boolean,
    skus: {
      name?: string,
      price?: number,
      stockType?: Orderable.StockType,
      stock?: number,
      isActive?: boolean,
      quantity?: number
    }[]
  }[]

  order?: DataSetOrder
}

export class Firebase {
  private static _shared?: Firebase
  private constructor() { }
  static get shared(): Firebase {
    if (!this._shared) {
      this._shared = new Firebase()

      const serviceAccount = require('../../sandbox-329fc-firebase-adminsdk.json')
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      })

      Orderable.initialize({
        adminOptions: {
          projectId: 'sandbox-329fc',
          keyFilename: './sandbox-329fc-firebase-adminsdk.json'
        },
        stripeToken: process.env.STRIPE as string
      })
    }

    return this._shared
  }

  orderObject(event: functions.Event<DeltaDocumentSnapshot>) {
    return new Orderable.Functions.OrderObject(event)
  }

  get defaultShops() {
    return [{
      name: 'shop',
      isActive: true,
      skus: [
        {
          name: 'sku1',
          price: 1000,
          stockType: Orderable.StockType.Finite,
          stock: 100,
          isActive: true,
          quantity: 1
        },
        {
          name: 'sku2',
          price: 2000,
          stockType: Orderable.StockType.Finite,
          stock: 150,
          isActive: true,
          quantity: 2
        }
      ]
    }]
  }

  get defaultOrder() {
    return <DataSetOrder>{
      amount: 1000,
      currency: 'jpy',
      paymentStatus: Orderable.OrderPaymentStatus.Created,
      stripe: {
        cardID: 'card_1BnhthKZcOra3JxsKaxABsRj',
        customerID: 'cus_CC65RZ8Gf6zi7V'
      },
      retry: {
        count: 0,
        errors: []
      }
    }
  }

  makeValidateModel = async (dataSet: DataSet = {}) => {
    dataSet.shops = dataSet.shops || Firebase.shared.defaultShops
    dataSet.order = dataSet.order || Firebase.shared.defaultOrder

    const batch = admin.firestore().batch()
    // const promises1: Promise<any>[] = []

    // const user = new Model.SampleUser()
    const user = Tart.Snapshot.makeNotSavedSnapshot<Orderable.UserProtocol>(Orderable.Path.User, {})
    // promises1.push(user.save())
    user.saveWithBatch(batch)

    let productsForReturn: Tart.Snapshot<Orderable.ProductProtocol>[] = []
    let skusForReturn: Tart.Snapshot<Orderable.SKUProtocol>[] = []
    let shops: { shop: Tart.Snapshot<Orderable.ShopProtocol>, products: { product: Tart.Snapshot<Orderable.ProductProtocol>, sku: Tart.Snapshot<Orderable.SKUProtocol>, quantity: number }[] }[] = []
    for (const shop of dataSet.shops) {
      const sh = Tart.Snapshot.makeNotSavedSnapshot<Orderable.ShopProtocol>(Orderable.Path.Shop, { isActive: true, freePostageMinimumPrice: -1 })
      sh.data.name = shop.name || 'shop'
      sh.data.isActive = !!shop.isActive
      sh.saveWithBatch(batch)

      // let products: { product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number }[] = []
      let products: { product: Tart.Snapshot<Orderable.ProductProtocol>, sku: Tart.Snapshot<Orderable.SKUProtocol>, quantity: number }[] = []
      for (const sku of shop.skus) {
        const pData: Orderable.ProductProtocol = { name: sku.name || 'product' }
        const p = Tart.Snapshot.makeNotSavedSnapshot<Orderable.ProductProtocol>(Orderable.Path.Product, pData)
        p.saveWithBatch(batch)

        const skData: Orderable.SKUProtocol = {
          price: sku.price === 0 ? sku.price : 1000,
          stockType: sku.stockType || Orderable.StockType.Infinite,
          stock: sku.stock === 0 ? sku.stock : 100,
          isPublished: true,
          isActive: !!sku.isActive
        }
        const sk = Tart.Snapshot.makeNotSavedSnapshot<Orderable.SKUProtocol>(Orderable.Path.SKU, skData)
        sk.saveWithBatch(batch)
        products.push({ product: p, sku: sk, quantity: sku.quantity || 1 })
        productsForReturn.push(p)
        skusForReturn.push(sk)
      }
      shops.push({ shop: sh, products: products })
    }

    await batch.commit()

    const promises2: Promise<any>[] = []

    const order = new Model.SampleOrder()
    order.user = user.reference
    order.amount = dataSet.order.amount || 10000
    order.currency = dataSet.order.currency || 'jpy'
    order.paymentStatus = dataSet.order.paymentStatus || Orderable.OrderPaymentStatus.PaymentRequested
    if (dataSet.order.expirationDate) {
      order.expirationDate = dataSet.order.expirationDate
    }
    if (dataSet.order.stripe) {
      const stripeCharge = new Model.SampleStripeCharge()
      stripeCharge.cardID = dataSet.order.stripe.cardID
      stripeCharge.customerID = dataSet.order.stripe.customerID
      if (dataSet.order.stripe.chargeID) {
        stripeCharge.chargeID = dataSet.order.stripe.chargeID
      }
      order.stripe = stripeCharge.rawValue()
    }
    if (dataSet.order.retry) {
      order.retry = dataSet.order.retry
    }

    const orderSKUsForReturn: Model.SampleOrderSKU[] = []
    const orderShopsForReturn: Model.SampleOrderShop[] = []
    for (const shop of shops) {
      const orderShop = new Model.SampleOrderShop()
      orderShop.paymentStatus = Orderable.OrderShopPaymentStatus.Created
      orderShop.user = user.reference
      orderShop.order = order.reference

      for (const product of shop.products) {
        const orderSKU = new Model.SampleOrderSKU()
        orderSKU.snapshotSKU = product.sku.rawValue()
        orderSKU.snapshotProduct = product.product.rawValue()
        orderSKU.quantity = product.quantity
        orderSKU.sku = product.sku.reference
        orderSKU.shop = shop.shop.reference

        orderShop.orderSKUs.insert(orderSKU)
        order.orderSKUs.insert(orderSKU)
        orderSKUsForReturn.push(orderSKU)
      }

      // await orderShop.save()
      promises2.push(orderShop.save())
      orderShopsForReturn.push(orderShop)
    }
    // await order.save()
    promises2.push(order.save())
    await Promise.all(promises2)

    return <SampleModel>{
      user: user,
      shops: shops.map(shop => { return shop.shop }),
      products: productsForReturn,
      skus: skusForReturn,
      order: order,
      orderShops: orderShopsForReturn,
      orderSKUs: orderSKUsForReturn
    }
  }

  step = 'preventMultipleProcessing'

  async expectOrder(model: SampleModel) {
    const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
    expect(order.completed).toEqual({ [this.step]: true })
    expect(order.result).toEqual({ status: EventResponse.Status.OK })
    expect(order.stripe!.cardID).toBeDefined()
    expect(order.stripe!.customerID).toBeDefined()
    expect(order.stripe!.chargeID).toBeDefined()
    expect(order.paidDate).toBeInstanceOf(Date)
    expect(order.paymentStatus).toEqual(Orderable.OrderPaymentStatus.Paid)
  }

  async expectStock(model: SampleModel) {
    let index = 0
    for (const sku of model.skus) {
      const fetchedSKU = await Model.SampleSKU.get(sku.id) as Model.SampleSKU
      expect(fetchedSKU.stock).toEqual(sku.stock - model.orderSKUs[index].quantity)
      index += 1
    }
  }

  async expectStockNotDecrementAndNotCompleted(model: SampleModel) {
    let index = 0
    for (const sku of model.skus) {
      const fetchedSKU = await Model.SampleSKU.get(sku.id) as Model.SampleSKU
      expect(fetchedSKU.stock).toEqual(sku.stock)
      index += 1
    }

    const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
    expect((order.completed || {})[this.step]).toBeUndefined()
    expect(order.paymentStatus).toEqual(Orderable.OrderPaymentStatus.PaymentRequested)
  }

  async expectRetry(model: SampleModel, retryCount: number = 1) {
    const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
    expect(order.retry!.count).toBe(retryCount)
    expect(order.retry!.errors.length).toEqual(retryCount)
    expect(order.retry!.errors.length).toEqual(retryCount)
  }

  async expectFatal(model: SampleModel, step: string) {
    const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
    expect(order.result!.status).toEqual(EventResponse.Status.InternalError)
    expect(order.result!.id!).toBe(step)
    expect(order.result!.error).toBeDefined()
  }

  async expectOrderShop(model: SampleModel) {
    for (const orderShop of model.orderShops) {
      const fetchedOrderShop = await Model.SampleOrderShop.get(orderShop.id) as Model.SampleOrderShop
      expect(fetchedOrderShop.paymentStatus).toEqual(Orderable.OrderShopPaymentStatus.Paid)
    }
  }

  async expectStripe(model: SampleModel) {
    const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
    const charge = await stripe.charges.retrieve(order.stripe!.chargeID!)
    expect(charge.amount).toEqual(model.order.amount)
    expect(charge.metadata.orderID).toEqual(model.order.id)
    expect(charge.customer).toEqual(model.order.stripe!.customerID)
  }

  /// 指定した DocumentReference を observe する。 `timeout` を超えたらエラーを返す
  observe(documentRef: FirebaseFirestore.DocumentReference, callback: (data: any, resolve: any, reject: any) => void) {
    const timeout = 30000

    var timer: NodeJS.Timer
    var index = 0
    var observer = Function()

    return new Promise((resolve, reject) => {
      documentRef.get().then(s => {
        callback(s.data(), resolve, reject)
      }, error => {
        reject(error)
      })

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
