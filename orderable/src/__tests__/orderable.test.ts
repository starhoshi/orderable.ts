import 'jest'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { FirebaseHelper } from './firebaseHelper'

beforeAll(() => {
  const _ = FirebaseHelper.shared
})

describe('OrderObject', () => {
  describe('isCharged', () => {
    let orderObject: Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>
    beforeEach(() => {
      const event = FirebaseHelper.makeEvent({} as any, {}, {})
      event.params = { orderID: '' }
      orderObject = FirebaseHelper.orderObject(event)
      const order = new Model.SampleOrder()
      orderObject.order = order
      orderObject.order.stripe = undefined
    })

    test('return true when charge completed', () => {
      orderObject.order!.stripe = new Model.SampleStripeCharge()
      orderObject.order!.stripe!.chargeID = 'test'

      expect(orderObject.isCharged).toBeTruthy()
    })

    test('return false when stripe is undefined', () => {
      orderObject.order!.stripe = undefined

      expect(orderObject.isCharged).toBeFalsy()
    })

    test('return false when stripe.chargeID is undefined', () => {
      orderObject.order!.stripe = new Model.SampleStripeCharge()
      orderObject.order!.stripe!.chargeID = undefined

      expect(orderObject.isCharged).toBeFalsy()
    })
  })
})

test('pay order', async () => {
  jest.setTimeout(20000)

  const oldOrder = await FirebaseHelper.makeOrder()
  const newOrder = oldOrder.rawValue()
  newOrder.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested

  const event = FirebaseHelper.makeEvent(oldOrder.reference, oldOrder.rawValue(), newOrder)
  event.params = { orderID: oldOrder.id }
  const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
    order: Model.SampleOrder,
    shop: Model.SampleShop,
    user: Model.SampleUser,
    sku: Model.SampleSKU,
    product: Model.SampleProduct,
    orderShop: Model.SampleOrderShop,
    orderSKU: Model.SampleOrderSKU
  })

  await Orderable.Functions.orderPaymentRequested(orderObject)
  expect(true)
})

// TODO
describe('OrderSKUObject', async () => {
  test('fetchFrom', async () => {
    expect(true)
  })
})

// TODO
describe('StripeError', async () => {
  test('StripeCardError', async () => {
    expect(true)
  })
})
