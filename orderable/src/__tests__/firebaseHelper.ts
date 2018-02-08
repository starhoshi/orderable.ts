import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring, property } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Retrycf from 'retrycf'
import * as Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE as string)

export interface SampleModel {
  user: Model.SampleUser,
  shops: Model.SampleShop[],
  products: Model.SampleProduct[],
  skus: Model.SampleSKU[],
  order: Model.SampleOrder,
  orderShops: Model.SampleOrderShop[],
  orderSKUs: Model.SampleOrderSKU[]
}

export interface DataSetOrder {
  amount?: number,
  currency?: string,
  paymentStatus?: Orderable.Model.OrderPaymentStatus,
  stripe?: {
    cardID: string,
    customerID: string
  }
}

export interface DataSet {
  shops?: {
    name?: string,
    isActive?: boolean,
    skus: {
      name?: string,
      price?: number,
      stockType?: Orderable.Model.StockType,
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
        stripeToken: process.env.STRIPE as string,
        slack: undefined
      })
    }

    return this._shared
  }

  makeOrderEvent(ref: FirebaseFirestore.DocumentReference, data: any, previousData: any) {
    return <functions.Event<DeltaDocumentSnapshot>>{
      params: { orderID: ref.id },
      data: {
        exists: true,
        ref: ref,
        id: ref.id,
        createTime: '',
        updateTime: '',
        readTime: '',
        previous: { data: () => { return previousData } },
        data: () => { return data },
        get: (key: string) => { return undefined }
      }
    }
  }

  orderObject(event: functions.Event<DeltaDocumentSnapshot>) {
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

  get defaultShops() {
    return [{
      name: 'shop',
      isActive: true,
      skus: [
        {
          name: 'sku1',
          price: 1000,
          stockType: Orderable.Model.StockType.Finite,
          stock: 100,
          isActive: true,
          quantity: 1
        },
        {
          name: 'sku2',
          price: 2000,
          stockType: Orderable.Model.StockType.Finite,
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
      paymentStatus: Orderable.Model.OrderPaymentStatus.Created,
      stripe: {
        cardID: 'card_1BnhthKZcOra3JxsKaxABsRj',
        customerID: 'cus_CC65RZ8Gf6zi7V'
      }
    }
  }

  makeValidateModel = async (dataSet: DataSet = {}) => {
    dataSet.shops = dataSet.shops || Firebase.shared.defaultShops
    dataSet.order = dataSet.order || Firebase.shared.defaultOrder

    const promises1: Promise<any>[] = []

    const user = new Model.SampleUser()
    promises1.push(user.save())

    let productsForReturn: Model.SampleProduct[] = []
    let skusForReturn: Model.SampleSKU[] = []
    let shops: { shop: Model.SampleShop, products: { product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number }[] }[] = []
    for (const shop of dataSet.shops) {
      const sh = new Model.SampleShop()
      sh.name = shop.name || 'shop'
      sh.isActive = !!shop.isActive
      promises1.push(sh.save())

      let products: {product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number}[] = []
      for (const sku of shop.skus) {
        const p = new Model.SampleProduct()
        p.name = sku.name || 'product'
        promises1.push(p.save())

        const sk = new Model.SampleSKU()
        sk.price = sku.price || 1000
        sk.stockType = sku.stockType || Orderable.Model.StockType.Infinite
        sk.stock = sku.stock || 100
        sk.isActive = !!sku.isActive
        promises1.push(sk.save())
        products.push({ product: p, sku: sk, quantity: sku.quantity || 1 })
        productsForReturn.push(p)
        skusForReturn.push(sk)
      }
      shops.push({shop: sh, products: products})
    }

    await Promise.all(promises1)

    const promises2: Promise<any>[] = []

    const order = new Model.SampleOrder()
    order.user = user.reference
    order.amount = dataSet.order.amount || 10000
    order.currency = dataSet.order.currency || 'jpy'
    order.paymentStatus = dataSet.order.paymentStatus || Orderable.Model.OrderPaymentStatus.Created
    if (dataSet.order.stripe) {
      const stripeCharge = new Model.SampleStripeCharge()
      stripeCharge.cardID = dataSet.order.stripe.cardID
      stripeCharge.customerID = dataSet.order.stripe.customerID
      order.stripe = stripeCharge.rawValue()
    }

    const orderSKUsForReturn: Model.SampleOrderSKU[] = []
    const orderShopsForReturn: Model.SampleOrderShop[] = []
    for (const shop of shops) {
      const orderShop = new Model.SampleOrderShop()
      orderShop.paymentStatus = Orderable.Model.OrderShopPaymentStatus.Created
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

    const preOrder = order.rawValue()
    preOrder.paymentStatus = Orderable.Model.OrderPaymentStatus.Created

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

  step = 'validateAndDecreaseStock'

  async expectOrder(model: SampleModel) {
      const order = await Model.SampleOrder.get(model.order.id) as Model.SampleOrder
      expect(order.neoTask!.status).toEqual(Retrycf.NeoTaskStatus.success)
      expect(order.neoTask!.completed).toEqual({[this.step]: true})
      expect(order.stripe!.chargeID).toBeDefined()
      expect(order.paidDate).toBeInstanceOf(Date)
      expect(order.paymentStatus).toEqual(Orderable.Model.OrderPaymentStatus.Paid)
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
    // completed not contain step
    expect(order.neoTask!.completed).toBeUndefined()
    expect(order.paymentStatus).toEqual(Orderable.Model.OrderPaymentStatus.PaymentRequested)
  }

  async expectOrderShop(model: SampleModel) {
    for (const orderShop of model.orderShops) {
      const fetchedOrderShop = await Model.SampleOrderShop.get(orderShop.id) as Model.SampleOrderShop
      expect(fetchedOrderShop.paymentStatus).toEqual(Orderable.Model.OrderShopPaymentStatus.Paid)
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
