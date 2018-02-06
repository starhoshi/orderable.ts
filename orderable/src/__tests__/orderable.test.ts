import 'jest'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Helper from './firebaseHelper'
import { Retrycf } from 'retrycf'

beforeAll(() => {
  const _ = Helper.Firebase.shared
})

describe('OrderObject', () => {
  let orderObject: Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>
  beforeEach(() => {
    const event = Helper.Firebase.makeEvent({} as any, {}, {})
    event.params = { orderID: '' }
    orderObject = Helper.Firebase.orderObject(event)
    const order = new Model.SampleOrder()
    orderObject.order = order
    orderObject.order.stripe = undefined
  })

  describe('getShops', () => {
    expect('TODO')
  })

  describe('isCharged', () => {
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

  describe('paymentAgencyType', () => {
    test('return Stripe when exist stripe', () => {
      orderObject.order!.stripe = new Model.SampleStripeCharge()

      expect(orderObject.paymentAgencyType).toEqual(Orderable.Functions.PaymentAgencyType.Stripe)
    })

    test('return Unknown when stripe is undefined', () => {
      orderObject.order!.stripe = undefined

      expect(orderObject.paymentAgencyType).toEqual(Orderable.Functions.PaymentAgencyType.Unknown)
    })

    test('return Unknown when order is undefined', () => {
      orderObject.order = undefined

      expect(orderObject.paymentAgencyType).toEqual(Orderable.Functions.PaymentAgencyType.Unknown)
    })
  })

  describe('updateStock', () => {
    jest.setTimeout(20000)
    let model: Helper.Model

    beforeEach(async () => {
      model = await Helper.Firebase.makeModel()
      orderObject.order = model.order
    })

    describe('finite', async () => {
      describe('Nominal Scenarios', () => {
        const stock = 100
        beforeEach(async () => {
          for (const sku of model.skus) {
            sku.stock = stock
            sku.stockType = Orderable.Model.StockType.Finite
            await sku.update()
          }
          let quantity = 0
          for (const orderSKU of model.orderSKUs) {
            quantity += 1
            orderSKU.quantity = quantity
            await orderSKU.update()
          }
          const orderSKUObjects = await Orderable.Functions.OrderSKUObject.fetchFrom(model.order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
          orderObject.orderSKUObjects = orderSKUObjects
        })

        test('stock decremented', async () => {
          await orderObject.updateStock(Orderable.Functions.Operator.minus, 'step')

          let quantity = 0
          for (const orderSKU of model.orderSKUs) {
            quantity += 1
            const sku = await Model.SampleSKU.get(orderSKU.sku.id) as Model.SampleSKU
            const newOrderSKU = await Model.SampleOrderSKU.get(orderSKU.id) as Model.SampleOrderSKU
            expect(sku.stock).toEqual(stock - quantity)
          }
        })

        test('stock incremented', async () => {
          await orderObject.updateStock(Orderable.Functions.Operator.plus, 'step')

          let quantity = 0
          for (const orderSKU of model.orderSKUs) {
            quantity += 1
            const sku = await Model.SampleSKU.get(orderSKU.sku.id) as Model.SampleSKU
            const newOrderSKU = await Model.SampleOrderSKU.get(orderSKU.id) as Model.SampleOrderSKU
            expect(sku.stock).toEqual(stock + quantity)
          }
        })
      })

      describe('Exception Scenarios', () => {
        test('ValidationError.OutOfStock when sku is out of stock', async () => {
          let quantity = 10000000000000
          for (const orderSKU of model.orderSKUs) {
            orderSKU.quantity = quantity
            await orderSKU.update()
          }
          const orderSKUObjects = await Orderable.Functions.OrderSKUObject.fetchFrom(model.order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
          orderObject.orderSKUObjects = orderSKUObjects

          expect.hasAssertions()
          try {
            await orderObject.updateStock(Orderable.Functions.Operator.minus, 'step')
          } catch (e) {
            expect(e).toBeInstanceOf(Retrycf.ValidationError)
            const validationError = e as Retrycf.ValidationError
            expect(validationError.validationErrorType).toEqual(Orderable.ValidationErrorType.OutOfStock)

            // check stock did not decrement
            for (const sku of model.skus) {
              const updatedSKU = await Model.SampleSKU.get(sku.id) as Model.SampleSKU
              expect(updatedSKU.stock).toEqual(sku.stock)
            }
          }
        })

        test('CompletedError when already this stap completed', async () => {
          const step = 'step'

          const neoTask = new Retrycf.NeoTask(orderObject.event.data)
          await model.order.reference.update({ neoTask: { completed: { [step]: true } } })

          const event = Helper.Firebase.makeEvent({} as any, { neoTask: { completed: { [step]: true } } }, {})
          event.params = { orderID: '' }
          orderObject = Helper.Firebase.orderObject(event)
          orderObject.order = model.order
          const orderSKUObjects = await Orderable.Functions.OrderSKUObject.fetchFrom(model.order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
          orderObject.orderSKUObjects = orderSKUObjects

          expect.hasAssertions()
          try {
            await orderObject.updateStock(Orderable.Functions.Operator.minus, step)
          } catch (e) {
            expect(e).toBeInstanceOf(Retrycf.CompletedError)
            const completedError = e as Retrycf.CompletedError
            expect(completedError.step).toEqual(step)

            // check stock did not decrement
            for (const sku of model.skus) {
              const updatedSKU = await Model.SampleSKU.get(sku.id) as Model.SampleSKU
              expect(updatedSKU.stock).toEqual(sku.stock)
            }
          }
        })
      })
    })
  })
})

test('pay order', async () => {
  jest.setTimeout(20000)

  const model = await Helper.Firebase.makeModel()
  const oldOrder = model.order
  const newOrder = oldOrder.rawValue()
  newOrder.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested

  const event = Helper.Firebase.makeEvent(oldOrder.reference, newOrder, oldOrder.rawValue())
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
