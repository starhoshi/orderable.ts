import * as admin from 'firebase-admin'
import 'jest'
// import * as Orderable from '@star__hoshi/orderable'
import * as Orderable from '../orderable'
import { Pring } from 'pring'
import { FirebaseHelper } from './helper/firebase';

beforeAll(() => {
  const serviceAccount = require('../../sandbox-329fc-firebase-adminsdk.json')
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })

  Pring.initialize({
    projectId: 'sandbox-329fc',
    keyFilename: './sandbox-329fc-firebase-adminsdk.json'
  })

  Orderable.initialize({
    adminOptions: {
      projectId: 'sandbox-329fc',
      keyFilename: './sandbox-329fc-firebase-adminsdk.json'
    },
    stripeToken: '',
    slack: undefined
  })
})

it('order pay', async () => {
  jest.setTimeout(600000)

  const user = new Orderable.Model.User()
  user.stripeCustomerID = 'cus_CC65RZ8Gf6zi7V'
  await user.save()

  const shop = new Orderable.Model.Shop()
  shop.name = 'shop'
  await shop.save()

  const product1 = new Orderable.Model.Product()
  product1.name = 'pro1'
  await product1.save()

  const product2 = new Orderable.Model.Product()
  product2.name = 'pro2'
  await product2.save()

  const sku1 = new Orderable.Model.SKU()
  sku1.price = 100
  sku1.stockType = Orderable.Model.StockType.Finite
  sku1.stock = 1000
  await sku1.save()
  const sku2 = new Orderable.Model.SKU()
  sku2.price = 400
  sku2.stockType = Orderable.Model.StockType.Finite
  sku2.stock = 5000
  await sku2.save()

  const stripeCharge = new Orderable.Model.StripeCharge()
  stripeCharge.cardID = 'card_1BnhthKZcOra3JxsKaxABsRj'
  stripeCharge.customerID = user.stripeCustomerID

  const order = new Orderable.Model.Order()
  order.user = user.reference
  order.amount = 1000
  order.currency = 'jpy'
  order.paymentStatus = Orderable.Model.OrderPaymentStatus.Created
  order.stripe = stripeCharge.rawValue()

  const orderSKU1 = new Orderable.Model.OrderSKU()
  orderSKU1.snapshotSKU = sku1.rawValue()
  orderSKU1.snapshotProduct = product1.rawValue()
  orderSKU1.quantity = 1
  orderSKU1.sku = sku1.reference
  orderSKU1.shop = shop.reference

  const orderSKU2 = new Orderable.Model.OrderSKU()
  orderSKU2.snapshotSKU = sku2.rawValue()
  orderSKU2.snapshotProduct = product2.rawValue()
  orderSKU2.quantity = 2
  orderSKU2.sku = sku2.reference
  orderSKU2.shop = shop.reference

  const orderShop = new Orderable.Model.OrderShop()
  orderShop.orderSKUs.insert(orderSKU1)
  orderShop.orderSKUs.insert(orderSKU2)
  orderShop.paymentStatus = Orderable.Model.OrderShopPaymentStatus.Created
  orderShop.user = user.reference

  order.orderSKUs.insert(orderSKU1)
  order.orderSKUs.insert(orderSKU2)

  await order.save()
  console.log('order created', order.id)

  order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
  await order.update()

  await FirebaseHelper.observe(order.reference, (data, resolve, reject) => {
    if (data.neoTask && data.neoTask.status === 1) {
      return resolve()
    }
  })

  expect(true)
})
