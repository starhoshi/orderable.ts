import 'jest'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Helper from './firebaseHelper'
import * as Retrycf from 'retrycf'

beforeAll(() => {
  const _ = Helper.Firebase.shared
})

jest.setTimeout(20000)

describe('OrderObject', () => {
  let orderObject: Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>
  beforeEach(() => {
    const order = new Model.SampleOrder()
    const event = Helper.Firebase.shared.makeOrderEvent(order.reference, order.rawValue(), {})
    orderObject = Helper.Firebase.shared.orderObject(event)
    orderObject.order = order
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
      expect(orderObject.paymentAgencyType).toEqual(Orderable.Functions.PaymentAgencyType.Unknown)
    })
  })

  describe('updateStock', () => {
    let model: Helper.SampleModel

    beforeEach(async () => {
      model = await Helper.Firebase.shared.makeValidateModel()
      orderObject.order = model.order
    })

    describe('finite', async () => {
      describe('when update succeeded', () => {
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
          orderObject.orderSKUObjects = await Orderable.Functions.OrderSKUObject.fetchFrom(model.order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
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

        describe('when completed but step is undefined', () => {
          test('stock decremented', async () => {
            const step = 'step'

            model.order.neoTask = await Retrycf.NeoTask.makeNeoTask(model.order)
            const completed = { [step]: true }
            model.order.neoTask.completed = completed
            await model.order.reference.update({ neoTask: { completed: completed } })

            const event = Helper.Firebase.shared.makeOrderEvent(model.order.reference, { neoTask: { completed: { [step]: true } } }, {})
            orderObject = Helper.Firebase.shared.orderObject(event)
            orderObject.order = model.order
            orderObject.orderSKUObjects = await Orderable.Functions.OrderSKUObject.fetchFrom(model.order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)

            await orderObject.updateStock(Orderable.Functions.Operator.plus, undefined)

            let quantity = 0
            for (const orderSKU of model.orderSKUs) {
              quantity += 1
              const sku = await Model.SampleSKU.get(orderSKU.sku.id) as Model.SampleSKU
              const newOrderSKU = await Model.SampleOrderSKU.get(orderSKU.id) as Model.SampleOrderSKU
              expect(sku.stock).toEqual(stock + quantity)
            }
          })
        })

        describe('when not completed and step is undefined', () => {
          test('stock decremented', async () => {
            await orderObject.updateStock(Orderable.Functions.Operator.plus, undefined)

            let quantity = 0
            for (const orderSKU of model.orderSKUs) {
              quantity += 1
              const sku = await Model.SampleSKU.get(orderSKU.sku.id) as Model.SampleSKU
              const newOrderSKU = await Model.SampleOrderSKU.get(orderSKU.id) as Model.SampleOrderSKU
              expect(sku.stock).toEqual(stock + quantity)
            }
          })
        })
      })

      describe('when sku is out of stock', () => {
        test('ValidationError.OutOfStock', async () => {
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
      })

      describe('when already this stap completed', () => {
        test('CompletedError', async () => {
          const step = 'step'

          model.order.neoTask = await Retrycf.NeoTask.makeNeoTask(model.order)
          const completed = { [step]: true }
          model.order.neoTask.completed = completed
          await model.order.reference.update({ neoTask: { completed: completed } })

          const event = Helper.Firebase.shared.makeOrderEvent(model.order.reference, { neoTask: { completed: { [step]: true } } }, {})
          orderObject = Helper.Firebase.shared.orderObject(event)
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

describe.only('orderPaymentRequested', () => {
  describe('when one shop (Normal Scenario)', () => {
    test('neoTask === 1', async () => {
      const defaultModel = {shops: Helper.Firebase.shared.defaultShops, order: Helper.Firebase.shared.defaultOrder}

      const model = await Helper.Firebase.shared.makeValidateModel(defaultModel)
      const preOrder = model.order.rawValue()
      model.order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
      await model.order.update()

      const event = Helper.Firebase.shared.makeOrderEvent(model.order.reference, model.order.rawValue(), preOrder)
      const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
        order: Model.SampleOrder, shop: Model.SampleShop, user: Model.SampleUser, sku: Model.SampleSKU, product: Model.SampleProduct, orderShop: Model.SampleOrderShop, orderSKU: Model.SampleOrderSKU
      })

      // run functions
      await Orderable.Functions.orderPaymentRequested(orderObject)

      // expect
      await Promise.all([
        Helper.Firebase.shared.expectOrder(model),
        Helper.Firebase.shared.expectStock(model),
        Helper.Firebase.shared.expectOrderShop(model),
        Helper.Firebase.shared.expectStripe(model)
      ])
    })
  })

  describe('when multiple shops (Normal Scenario)', () => {
    test('neoTask === 1', async () => {
      const shops = Helper.Firebase.shared.defaultShops.concat(Helper.Firebase.shared.defaultShops)
      const defaultModel = {shops: shops, order: Helper.Firebase.shared.defaultOrder}

      const model = await Helper.Firebase.shared.makeValidateModel(defaultModel)
      const preOrder = model.order.rawValue()
      model.order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
      await model.order.update()

      const event = Helper.Firebase.shared.makeOrderEvent(model.order.reference, model.order.rawValue(), preOrder)
      const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
        order: Model.SampleOrder, shop: Model.SampleShop, user: Model.SampleUser, sku: Model.SampleSKU, product: Model.SampleProduct, orderShop: Model.SampleOrderShop, orderSKU: Model.SampleOrderSKU
      })

      // run functions
      await Orderable.Functions.orderPaymentRequested(orderObject)

      // expect
      await Promise.all([
        Helper.Firebase.shared.expectOrder(model),
        Helper.Firebase.shared.expectStock(model),
        Helper.Firebase.shared.expectOrderShop(model),
        Helper.Firebase.shared.expectStripe(model)
      ])
    })
  })
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
