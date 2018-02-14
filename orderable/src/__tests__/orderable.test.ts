import 'jest'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring, property } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as Helper from './firebaseHelper'
import * as Retrycf from 'retrycf'
import * as Rescue from 'rescue-fire'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'

beforeAll(() => {
  const _ = Helper.Firebase.shared
})

jest.setTimeout(20000)

describe('OrderObject', () => {
  let orderObject: Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>
  beforeEach(() => {
    const order = new Model.SampleOrder()
    const event = Rescue.event(order.reference, order.rawValue(), { params: { orderID: order.id } })
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
            sku.stockType = Orderable.StockType.Finite
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
            expect(e).toBeInstanceOf(Orderable.BadRequestError)
            const badRequestError = e as Orderable.BadRequestError
            expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.OutOfStock)

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

describe('orderPaymentRequested', () => {
  const makeTestData = async (dataSet: Helper.DataSet = {}, preOrder: any = undefined) => {
    const model = await Helper.Firebase.shared.makeValidateModel(dataSet)
    preOrder = preOrder || model.order.rawValue()
    model.order.paymentStatus = Orderable.OrderPaymentStatus.PaymentRequested
    await model.order.update()

    const event = Rescue.event(model.order.reference, model.order.rawValue(), { params: { orderID: model.order.id }, previousData: preOrder })
    const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
      order: Model.SampleOrder, shop: Model.SampleShop, user: Model.SampleUser, sku: Model.SampleSKU, product: Model.SampleProduct, orderShop: Model.SampleOrderShop, orderSKU: Model.SampleOrderSKU
    })

    return { model: model, orderObject: orderObject }
  }

  describe('one shop, two items (Normal Scenario)', () => {
    test('success', async () => {
      const data = await makeTestData()

      // run functions
      await Orderable.Functions.orderPaymentRequested(data.orderObject)

      // expect
      await Promise.all([
        Helper.Firebase.shared.expectOrder(data.model),
        Helper.Firebase.shared.expectStock(data.model),
        Helper.Firebase.shared.expectOrderShop(data.model),
        Helper.Firebase.shared.expectStripe(data.model)
      ])
    })
  })

  describe('when multiple shops, multiple items (Normal Scenario)', () => {
    test('success', async () => {
      const shops = Helper.Firebase.shared.defaultShops.concat(Helper.Firebase.shared.defaultShops)
      const customModel = { shops: shops, order: Helper.Firebase.shared.defaultOrder }

      const data = await makeTestData(customModel)

      // run functions
      await Orderable.Functions.orderPaymentRequested(data.orderObject)

      // expect
      await Promise.all([
        Helper.Firebase.shared.expectOrder(data.model),
        Helper.Firebase.shared.expectStock(data.model),
        Helper.Firebase.shared.expectOrderShop(data.model),
        Helper.Firebase.shared.expectStripe(data.model)
      ])
    })
  })

  describe('shop is not active', () => {
    test('Retrycf.ValidationError ShopIsNotActive', async () => {
      const shops = Helper.Firebase.shared.defaultShops
      shops[0].isActive = false
      const customModel = { shops: shops, order: Helper.Firebase.shared.defaultOrder }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('validateShopIsActive')
        const badRequestError = orderableError.error as Orderable.BadRequestError
        expect(badRequestError).toBeInstanceOf(Orderable.BadRequestError)
        expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.ShopIsNotActive)
      }
    })
  })

  describe('sku is not active', () => {
    test('Retrycf.ValidationError SKUIsNotActive', async () => {
      const shops = Helper.Firebase.shared.defaultShops
      shops[0].skus[0].isActive = false
      const customModel = { shops: shops, order: Helper.Firebase.shared.defaultOrder }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('validateSKUIsActive')
        const badRequestError = orderableError.error as Orderable.BadRequestError
        expect(badRequestError).toBeInstanceOf(Orderable.BadRequestError)
        expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.SKUIsNotActive)
      }
    })
  })

  describe('stripe error', () => {
    test('Retrycf.ValidationError SKUIsNotActive', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.stripe!.customerID = 'cus_C1vUA7cpCejmHN'
      order.stripe!.cardID = 'card_1Bdre0KZcOra3Jxs6IOjm4WO' // 12/2017
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('validatePaymentMethod')
        const badRequestError = orderableError.error as Orderable.BadRequestError
        expect(badRequestError).toBeInstanceOf(Orderable.BadRequestError)
        expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.StripeCardExpired)
      }
    })

    test('Retrycf.ValidationError PaymentInfoNotFount', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.stripe = undefined
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('validatePaymentMethod')
        const badRequestError = orderableError.error as Orderable.BadRequestError
        expect(badRequestError).toBeInstanceOf(Orderable.BadRequestError)
        expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.PaymentInfoNotFound)
      }
    })
  })

  describe('out of stock', () => {
    test('Retrycf.ValidationError OutOfStock', async () => {
      const shops = Helper.Firebase.shared.defaultShops
      shops[0].skus[0].quantity = 100000000000
      const customModel = { shops: shops, order: Helper.Firebase.shared.defaultOrder }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('validateAndDecreaseStock')
        const badRequestError = orderableError.error as Orderable.BadRequestError
        expect(badRequestError).toBeInstanceOf(Orderable.BadRequestError)
        expect(badRequestError.id).toEqual(Orderable.ValidationErrorType.OutOfStock)

        await Helper.Firebase.shared.expectStockNotDecrementAndNotCompleted(data.model)
      }
    })
  })

  describe('cloud functions fired multiple times', () => {
    jest.setTimeout(40000)
    test('successflly only once', async () => {
      const data = await makeTestData()

      try {
        await Promise.all([
          Orderable.Functions.orderPaymentRequested(data.orderObject),
          Orderable.Functions.orderPaymentRequested(data.orderObject)
        ])
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.Completed)
        expect(orderableError.step).toBe('preventMultipleProcessing')
        const completedError = orderableError.error as Mission.CompletedError
        expect(completedError).toBeInstanceOf(Mission.CompletedError)
        expect(completedError.id).toEqual('preventMultipleProcessing')
      }

      // Wait until the process is completed
      await Helper.Firebase.shared.observe(data.orderObject.order.reference, (d, r) => {
        if (d.result && d.result.status === EventResponse.Status.OK) { return r() }
      })

      await Promise.all([
        Helper.Firebase.shared.expectOrder(data.model),
        Helper.Firebase.shared.expectStock(data.model),
        Helper.Firebase.shared.expectOrderShop(data.model),
        Helper.Firebase.shared.expectStripe(data.model)
      ])
    })
  })

  // TODO: test Amount must be at least 50 JPY
  describe('over limit of stripe', () => {
    test('Retrycf.ValidationError StripeInvalidRequestError', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.amount = 1000000000000000
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }

      const data = await makeTestData(customModel)

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.BadRequest)
        expect(orderableError.step).toBe('payment')
        const stripeError = orderableError.error as Orderable.StripeError
        expect(stripeError).toBeInstanceOf(Orderable.StripeError)
        expect(stripeError.type).toEqual(Orderable.StripeErrorType.StripeInvalidRequestError)

        await Helper.Firebase.shared.expectStockNotDecrementAndNotCompleted(data.model)
      }
    })
  })

  // Stripe's Idempotent Requests do not return an error...
  describe.skip('stripe multiple charged', () => {
    jest.setTimeout(300000)
    test('?', async () => {
      const data = await makeTestData()

      expect.hasAssertions()
      // run functions
      await Orderable.Functions.orderPaymentRequested(data.orderObject)

      // prepare for restart
      data.model.order.paymentStatus = Orderable.OrderPaymentStatus.Created
      data.model.order.stripe = new Model.SampleStripeCharge()
      const stripeCharge = new Model.SampleStripeCharge()
      stripeCharge.cardID = Helper.Firebase.shared.defaultOrder.stripe!.cardID
      stripeCharge.customerID = Helper.Firebase.shared.defaultOrder.stripe!.customerID
      data.model.order.stripe = stripeCharge.rawValue()
      // data.model.order.neoTask = {} as any
      await data.model.order.update()

      const preOrder = data.model.order.rawValue()
      data.model.order.paymentStatus = Orderable.OrderPaymentStatus.PaymentRequested
      await data.model.order.update()

      const event = Rescue.event(data.model.order.reference, data.model.order.rawValue(), { params: { orderID: data.model.order.id }, previousData: preOrder })
      const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
        order: Model.SampleOrder, shop: Model.SampleShop, user: Model.SampleUser, sku: Model.SampleSKU, product: Model.SampleProduct, orderShop: Model.SampleOrderShop, orderSKU: Model.SampleOrderSKU
      })

      // restart
      await Orderable.Functions.orderPaymentRequested(orderObject)
    })
  })

  describe('data reference is broken', () => {
    test('retry error', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }

      const data = await makeTestData(customModel)
      data.orderObject.order.user = 'username' as any
      await data.orderObject.order.update()

      expect.hasAssertions()
      try {
        // run functions
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        await Helper.Firebase.shared.expectRetry(data.model)
        await Helper.Firebase.shared.expectStockNotDecrementAndNotCompleted(data.model)
      }
    })
  })

  describe('charge completed before fire functions', () => {
    test('skip steps', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.stripe!.chargeID = 'charged'
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }
      const data = await makeTestData(customModel)

      await Orderable.Functions.orderPaymentRequested(data.orderObject)

      await Promise.all([
        Helper.Firebase.shared.expectStockNotDecrementAndNotCompleted(data.model),
        Helper.Firebase.shared.expectOrderShop(data.model)
      ])
    })
  })

  describe('when retry 2 times', () => {
    test('success', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.retry = { count: 2, errors: ['', ''] }
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }
      const data = await makeTestData(customModel, { retry: { count: 1 } })
      await data.model.order.update()
      data.orderObject.order.paymentStatus = Orderable.OrderPaymentStatus.Paid

      await Orderable.Functions.orderPaymentRequested(data.orderObject)

      await Promise.all([
        Helper.Firebase.shared.expectOrder(data.model),
        Helper.Firebase.shared.expectStock(data.model),
        Helper.Firebase.shared.expectOrderShop(data.model),
        Helper.Firebase.shared.expectStripe(data.model)
      ])
    })
  })

  describe('when retry 3 times', () => {
    test('fatal error', async () => {
      const order = Helper.Firebase.shared.defaultOrder
      order.retry = { count: 3, errors: ['', '', ''] }
      const customModel = { shops: Helper.Firebase.shared.defaultShops, order: order }
      const data = await makeTestData(customModel, { retry: { count: 2 } })
      await data.model.order.update()
      data.orderObject.order.paymentStatus = Orderable.OrderPaymentStatus.Paid

      try {
        await Orderable.Functions.orderPaymentRequested(data.orderObject)
      } catch (e) {
        expect(e).toBeInstanceOf(Orderable.OrderableError)
        const orderableError = e as Orderable.OrderableError
        expect(orderableError.type).toBe(Orderable.ErrorType.Internal)
        expect(orderableError.step).toBe('orderPaymentRequested')
        const retryError = orderableError.error as Orderable.RetryFailedError
        expect(retryError).toBeInstanceOf(Orderable.RetryFailedError)
        expect(retryError.id).toEqual('orderPaymentRequested')
        expect(retryError.message).toBeDefined()
        expect(retryError.stack).toBeDefined()
        expect(retryError.name).toBeDefined()

        await Promise.all([
          Helper.Firebase.shared.expectStockNotDecrementAndNotCompleted(data.model),
          Helper.Firebase.shared.expectFatal(data.model, 'orderPaymentRequested')
        ])
      }
    })
  })

  //   // TODO
  //   // stripe charge error type cover
  //   // retry 2 times
  //   // order timelimit
})

describe('OrderSKUObject', async () => {
  test('fetchFrom', async () => {
    expect('TODO')
  })
})

describe('StripeError', async () => {
  test('StripeCardError', async () => {
    expect('TODO')
  })
})
