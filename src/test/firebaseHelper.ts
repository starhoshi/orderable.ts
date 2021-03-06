import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as Orderable from '../index'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Retrycf from 'retrycf'
import * as Stripe from 'stripe'
import * as EventResponse from 'event-response'
import * as Tart from '@star__hoshi/tart'

const stripe = new Stripe(process.env.STRIPE as string)

export const createOrder = () => {
  const ref = admin.firestore().collection('version/1/order').doc()
  const data = <Orderable.OrderProtocol>{
    user: '' as any,
    amount: 1000,
    paymentStatus: 1
  }
  return new Tart.Snapshot<Orderable.OrderProtocol>(ref, data)
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
        firestore: admin.firestore(),
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

    const batch = Orderable.firestore.batch()
    const user = Tart.makeNotSavedSnapshot<Orderable.UserProtocol>(Orderable.Path.User, {})
    user.saveWithBatch(batch)

    let productsForReturn: Tart.Snapshot<Orderable.ProductProtocol>[] = []
    let skusForReturn: Tart.Snapshot<Orderable.SKUProtocol>[] = []
    let shops: { shop: Tart.Snapshot<Orderable.ShopProtocol>, products: { product: Tart.Snapshot<Orderable.ProductProtocol>, sku: Tart.Snapshot<Orderable.SKUProtocol>, quantity: number }[] }[] = []
    for (const shop of dataSet.shops) {
      const sh = Tart.makeNotSavedSnapshot<Orderable.ShopProtocol>(Orderable.Path.Shop, { isActive: true, freePostageMinimumPrice: -1 })
      sh.data.name = shop.name || 'shop'
      sh.data.isActive = !!shop.isActive
      sh.saveWithBatch(batch)

      let products: { product: Tart.Snapshot<Orderable.ProductProtocol>, sku: Tart.Snapshot<Orderable.SKUProtocol>, quantity: number }[] = []
      for (const sku of shop.skus) {
        const pData: Orderable.ProductProtocol = { name: sku.name || 'product' }
        const p = Tart.makeNotSavedSnapshot<Orderable.ProductProtocol>(Orderable.Path.Product, pData)
        p.saveWithBatch(batch)

        const skData: Orderable.SKUProtocol = {
          price: sku.price === 0 ? sku.price : 1000,
          stockType: sku.stockType || Orderable.StockType.Infinite,
          stock: sku.stock === 0 ? sku.stock : 100,
          isPublished: true,
          isActive: !!sku.isActive
        }
        const sk = Tart.makeNotSavedSnapshot<Orderable.SKUProtocol>(Orderable.Path.SKU, skData)
        sk.saveWithBatch(batch)
        products.push({ product: p, sku: sk, quantity: sku.quantity || 1 })
        productsForReturn.push(p)
        skusForReturn.push(sk)
      }
      shops.push({ shop: sh, products: products })
    }

    const orderData: Orderable.OrderProtocol = {
      user: user.ref,
      amount: dataSet.order.amount || 10000,
      currency: dataSet.order.currency || 'jpy',
      paymentStatus: dataSet.order.paymentStatus || Orderable.OrderPaymentStatus.PaymentRequested
    }
    if (dataSet.order.expirationDate) {
      orderData.expirationDate = dataSet.order.expirationDate
    }
    if (dataSet.order.stripe) {
      const stripeCharge: Orderable.StripeProtocol = {}
      stripeCharge.cardID = dataSet.order.stripe.cardID
      stripeCharge.customerID = dataSet.order.stripe.customerID
      if (dataSet.order.stripe.chargeID) {
        stripeCharge.chargeID = dataSet.order.stripe.chargeID
      }
      orderData.stripe = stripeCharge
    }
    if (dataSet.order.retry) {
      orderData.retry = dataSet.order.retry
    }
    const order = Tart.makeNotSavedSnapshot<Orderable.OrderProtocol>(Orderable.Path.Order, orderData)

    const orderSKUsForReturn: Tart.Snapshot<Orderable.OrderSKUProtocol>[] = []
    const orderShopsForReturn: Tart.Snapshot<Orderable.OrderShopProtocol>[] = []
    for (const shop of shops) {
      const orderShopData: Orderable.OrderShopProtocol = {
        paymentStatus: Orderable.OrderShopPaymentStatus.Created,
        user: user.ref,
        order: order.ref
      }
      const orderShop = Tart.makeNotSavedSnapshot<Orderable.OrderShopProtocol>(Orderable.Path.OrderShop, orderShopData)

      for (const product of shop.products) {
        const orderSKUData: Orderable.OrderSKUProtocol = {
          snapshotSKU: product.sku.data,
          snapshotProduct: product.product.data,
          quantity: product.quantity,
          sku: product.sku.ref,
          shop: shop.shop.ref
        }
        const orderSKU = Tart.makeNotSavedSnapshot<Orderable.OrderSKUProtocol>(Orderable.Path.OrderSKU, orderSKUData)
        orderSKU.saveWithBatch(batch)

        orderShop.saveReferenceCollectionWithBatch(batch, 'orderSKUs', orderSKU)
        order.saveReferenceCollectionWithBatch(batch, 'orderSKUs', orderSKU)
        orderSKUsForReturn.push(orderSKU)
      }

      orderShop.saveWithBatch(batch)
      orderShopsForReturn.push(orderShop)
    }
    order.saveWithBatch(batch)
    await batch.commit()

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
    const order = await Tart.fetch<Orderable.OrderProtocol>(model.order.ref)
    expect(order.data.completed).toEqual({ [this.step]: true })
    expect(order.data.orderPaymentRequestedResult).toEqual({ status: EventResponse.Status.OK })
    expect(order.data.stripe!.cardID).toBeDefined()
    expect(order.data.stripe!.customerID).toBeDefined()
    expect(order.data.stripe!.chargeID).toBeDefined()
    expect(order.data.paidDate).toBeInstanceOf(Date)
    expect(order.data.paymentStatus).toEqual(Orderable.OrderPaymentStatus.Paid)
  }

  async expectStock(model: SampleModel) {
    let index = 0
    for (const sku of model.skus) {
      const fetchedSKU = await Tart.fetch<Orderable.SKUProtocol>(sku.ref)
      expect(fetchedSKU.data.stock).toEqual(sku.data.stock - model.orderSKUs[index].data.quantity)
      index += 1
    }
  }

  async expectStockNotDecrementAndNotCompleted(model: SampleModel) {
    let index = 0
    for (const sku of model.skus) {
      const fetchedSKU = await Tart.fetch<Orderable.SKUProtocol>(sku.ref)
      expect(fetchedSKU.data.stock).toEqual(sku.data.stock)
      index += 1
    }

    const order = await Tart.fetch<Orderable.OrderProtocol>(model.order.ref)
    expect((order.data.completed || {})[this.step]).toBeUndefined()
    expect(order.data.paymentStatus).toEqual(Orderable.OrderPaymentStatus.PaymentRequested)
  }

  async expectRetry(model: SampleModel, retryCount: number = 1) {
    const order = await Tart.fetch<Orderable.OrderProtocol>(model.order.ref)
    expect(order.data.retry!.count).toBe(retryCount)
    expect(order.data.retry!.errors.length).toEqual(retryCount)
    expect(order.data.retry!.errors.length).toEqual(retryCount)
  }

  async expectFatal(model: SampleModel, step: string) {
    const order = await Tart.fetch<Orderable.OrderProtocol>(model.order.ref)
    expect(order.data.orderPaymentRequestedResult!.status).toEqual(EventResponse.Status.InternalError)
    expect(order.data.orderPaymentRequestedResult!.id!).toBe(step)
    expect(order.data.orderPaymentRequestedResult!.message).toBeDefined()
  }

  async expectOrderShop(model: SampleModel) {
    for (const orderShop of model.orderShops) {
      const fetchedOrderShop = await Tart.fetch<Orderable.OrderShopProtocol>(orderShop.ref)
      expect(fetchedOrderShop.data.paymentStatus).toEqual(Orderable.OrderShopPaymentStatus.Paid)
    }
  }

  async expectStripe(model: SampleModel) {
    const order = await Tart.fetch<Orderable.OrderProtocol>(model.order.ref)
    const charge = await stripe.charges.retrieve(order.data.stripe!.chargeID!)
    expect(charge.amount).toEqual(model.order.data.amount)
    expect(charge.metadata.orderID).toEqual(model.order.ref.id)
    expect(charge.customer).toEqual(model.order.data.stripe!.customerID)
  }
}
