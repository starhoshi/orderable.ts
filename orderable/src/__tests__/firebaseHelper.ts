import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'

export interface SampleModel {
  user: Model.SampleUser,
  shops: Model.SampleShop[],
  products: Model.SampleProduct[],
  skus: Model.SampleSKU[],
  order: Model.SampleOrder,
  orderShops: Model.SampleOrderShop[],
  orderSKUs: Model.SampleOrderSKU[]
}

export interface DataSet {
  shops?: {
    name?: string,
    skus: {
      name?: string,
      price?: number,
      stockType?: Orderable.Model.StockType,
      stock?: number,
      quantity?: number
    }[]
  }[]

  order?: {
    amount?: number,
    currency?: string,
    paymentStatus?: Orderable.Model.OrderPaymentStatus,
    stripe?: {
      cardID: string,
      customerID: string
    }
  }
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
      skus: [
        {
          name: 'sku1',
          price: 1000,
          stockType: Orderable.Model.StockType.Finite,
          stock: 100,
          quantity: 1
        },
        {
          name: 'sku2',
          price: 2000,
          stockType: Orderable.Model.StockType.Finite,
          stock: 150,
          quantity: 2
        }
      ]
    }]
  }

  get defaultOrder() {
    return {
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

    const user = new Model.SampleUser()
    await user.save()

    // let shops: Model.SampleShop[] = []
    // let products: { product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number }[] = []
    let productsForReturn: Model.SampleProduct[] = []
    let skusForReturn: Model.SampleSKU[] = []
    let shops: { shop: Model.SampleShop, products: { product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number }[] }[] = []
    for (const shop of dataSet.shops) {
      const sh = new Model.SampleShop()
      sh.name = shop.name || 'shop'
      await sh.save()
      // shops.push(sh)

      let products: {product: Model.SampleProduct, sku: Model.SampleSKU, quantity: number}[] = []
      for (const sku of shop.skus) {
        const p = new Model.SampleProduct()
        p.name = sku.name || 'product'
        await p.save()

        const sk = new Model.SampleSKU()
        sk.price = sku.price || 1000
        sk.stockType = sku.stockType || Orderable.Model.StockType.Infinite
        sk.stock = sku.stock || 100
        await sk.save()
        products.push({ product: p, sku: sk, quantity: sku.quantity || 1 })
        productsForReturn.push(p)
        skusForReturn.push(sk)
      }
      shops.push({shop: sh, products: products})
    }

    // const shop = new Model.SampleShop()
    // shop.name = 'shop'
    // await shop.save()

    // const product1 = new Model.SampleProduct()
    // product1.name = 'pro1'
    // await product1.save()

    // const product2 = new Model.SampleProduct()
    // product2.name = 'pro2'
    // await product2.save()

    // const sku1 = new Model.SampleSKU()
    // sku1.price = 100
    // sku1.stockType = Orderable.Model.StockType.Finite
    // sku1.stock = 1000
    // await sku1.save()
    // const sku2 = new Model.SampleSKU()
    // sku2.price = 400
    // sku2.stockType = Orderable.Model.StockType.Finite
    // sku2.stock = 5000
    // await sku2.save()

    const stripeCharge = new Model.SampleStripeCharge()
    if (dataSet.order.stripe) {
      stripeCharge.cardID = dataSet.order.stripe.cardID
      stripeCharge.customerID = dataSet.order.stripe.cardID
    }

    const order = new Model.SampleOrder()
    order.user = user.reference
    order.amount = dataSet.order.amount || 10000
    order.currency = dataSet.order.currency || 'jpy'
    order.paymentStatus = dataSet.order.paymentStatus || Orderable.Model.OrderPaymentStatus.Created
    order.stripe = stripeCharge.rawValue()

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
        orderSKU.quantity = 1
        orderSKU.sku = product.sku.reference
        orderSKU.shop = shop.shop.reference

        orderShop.orderSKUs.insert(orderSKU)
        order.orderSKUs.insert(orderSKU)
        orderSKUsForReturn.push(orderSKU)
      }

      await orderShop.save()
      orderShopsForReturn.push(orderShop)
    }
    await order.save()

    // const orderSKU1 = new Model.SampleOrderSKU()
    // orderSKU1.snapshotSKU = sku1.rawValue()
    // orderSKU1.snapshotProduct = product1.rawValue()
    // orderSKU1.quantity = 1
    // orderSKU1.sku = sku1.reference
    // orderSKU1.shop = shop.reference

    // const orderSKU2 = new Model.SampleOrderSKU()
    // orderSKU2.snapshotSKU = sku2.rawValue()
    // orderSKU2.snapshotProduct = product2.rawValue()
    // orderSKU2.quantity = 2
    // orderSKU2.sku = sku2.reference
    // orderSKU2.shop = shop.reference

    // const orderShop = new Model.SampleOrderShop()
    // orderShop.orderSKUs.insert(orderSKU1)
    // orderShop.orderSKUs.insert(orderSKU2)
    // orderShop.paymentStatus = Orderable.Model.OrderShopPaymentStatus.Created
    // orderShop.user = user.reference
    // orderShop.order = order.reference

    // order.orderSKUs.insert(orderSKU1)
    // order.orderSKUs.insert(orderSKU2)

    // await orderShop.save()

    // await order.save()

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

  makeModel = async () => {
    const user = new Model.SampleUser()
    // user.stripeCustomerID = 'cus_CC65RZ8Gf6zi7V'
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
    stripeCharge.customerID = 'cus_CC65RZ8Gf6zi7V'

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

    await orderShop.save()

    await order.save()

    return <SampleModel>{
      user: user, shops: [shop], products: [product1, product2], skus: [sku1, sku2],
      order: order, orderShops: [orderShop], orderSKUs: [orderSKU1, orderSKU2]
    }
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
