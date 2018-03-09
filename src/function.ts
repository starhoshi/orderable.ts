// import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
// import { Event, TriggerAnnotated } from 'firebase-functions'
import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
// import { Pring, property } from 'pring'
import * as Retrycf from 'retrycf'
import * as Flow from '@1amageek/flow'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
// import * as request from 'request'
// import * as Slack from 'slack-node'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'
// import { PringUtil } from './util'
import { BadRequestError, BaseError, ErrorType, OrderableError, RetryFailedError, StripeError, StripeErrorType, ValidationErrorType } from './error'
import { OrderPaymentStatus, OrderProtocol, OrderShopPaymentStatus, OrderShopProtocol, OrderSKUProtocol, ProductProtocol, ShopProtocol, SKUProtocol, StockType, StripeProtocol, UserProtocol } from './protocol'
import { firestore, stripe } from './index'
import * as Tart from './tart'

export namespace Functions {
  export class OrderSKUObject<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol> {
    orderSKU: Tart.Snapshot<OrderSKU>
    sku: Tart.Snapshot<SKU>

    static async fetchFrom<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol>(order: Tart.Snapshot<OrderProtocol>) {
      const orderSKUQuerySnapshot = await order.ref.collection('orderSKUs').get()
      const orderSKUObjects = await Promise.all(orderSKUQuerySnapshot.docs.map(qds => {
        return Tart.data<OrderSKU>('version/1/ordersku', qds.ref.id).then(snapshot => {
          const orderSKUObject = new OrderSKUObject()
          orderSKUObject.orderSKU = snapshot
          return orderSKUObject
        })
      }))

      await Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
        return orderSKUObject.orderSKU.data.sku.get().then(snapshot => {
          orderSKUObjects[index].sku = new Tart.Snapshot<SKU>(snapshot)
        })
      }))
      return orderSKUObjects
    }
  }

  export enum PaymentAgencyType {
    Unknown,
    Stripe
  }

  export class OrderObject<
    Order extends OrderProtocol,
    Shop extends ShopProtocol,
    User extends UserProtocol,
    SKU extends SKUProtocol,
    Product extends ProductProtocol,
    OrderShop extends OrderShopProtocol,
    OrderSKU extends OrderSKUProtocol<SKU, Product>
    > implements Flow.Dependency {

    event: functions.Event<DeltaDocumentSnapshot>
    orderID: string
    order: Tart.Snapshot<Order>
    previousOrder: Tart.Snapshot<Order>
    shops?: Tart.Snapshot<Shop>[]
    user?: Tart.Snapshot<User>
    orderSKUObjects?: OrderSKUObject<OrderSKU, SKU>[]
    stripeCharge?: Stripe.charges.ICharge
    stripeCard?: Stripe.cards.ICard

    async getShops() {
      this.shops = await Promise.all(this.orderSKUObjects!.map(orderSKUObject => {
        return orderSKUObject.orderSKU.data.shop
      }).filter((shopRef, index, self) => { // deduplication
        return self.indexOf(shopRef) === index
      }).map(shopRef => {
        return shopRef.get().then(s => { return new Tart.Snapshot<Shop>(s) })
      }))
    }

    constructor(event: functions.Event<DeltaDocumentSnapshot>) {
      this.event = event
      this.orderID = event.params!.orderID!
      this.order = new Tart.Snapshot<Order>(event.data)
      this.previousOrder = new Tart.Snapshot<Order>(event.data.previous)
    }

    get isCharged(): boolean {
      if (this.order && this.order.data.stripe && this.order.data.stripe.chargeID) {
        return true
      }
      return false
    }

    get paymentAgencyType() {
      if (!this.order) {
        return PaymentAgencyType.Unknown
      }

      if (this.order.data.stripe) {
        return PaymentAgencyType.Stripe
      }

      return PaymentAgencyType.Unknown
    }

    updateStock(operator: Operator, step?: string) {
      const orderSKUObjects = this.orderSKUObjects
      if (!orderSKUObjects) { throw Error('orderSKUObjects must be non-null') }

      return firestore.runTransaction(async (transaction) => {
        const promises: Promise<any>[] = []
        for (const orderSKUObject of orderSKUObjects) {
          const t = transaction.get(orderSKUObject.sku.ref).then(tsku => {
            const sku = new Tart.Snapshot<SKUProtocol>(tsku)
            const quantity = orderSKUObject.orderSKU.data.quantity * operator
            const newStock = sku.data.stock + quantity

            if (sku.data.stockType === StockType.Finite) {
              if (newStock >= 0) {
                transaction.update(orderSKUObject.sku.ref, { stock: newStock })
              } else {
                throw new BadRequestError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.data.snapshotProduct!.name} is out of stock. \nquantity: ${orderSKUObject.orderSKU.data.quantity}, stock: ${orderSKUObject.sku.data.stock}`)
              }
            }
          })
          promises.push(t)
        }

        return Promise.all(promises)
      })
    }
  }

  export enum Operator {
    plus = +1,
    minus = -1
  }

  const validateOrderExpired: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }
        if (!order.data.expirationDate) {
          return orderObject
        }

        if (order.data.expirationDate.getTime() < new Date().getTime()) {
          throw new BadRequestError(ValidationErrorType.OrderExpired, 'The order has expired.')
        }

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateOrderExpired', ErrorType.BadRequest, error)
        }

        throw new OrderableError('validateOrderExpired', ErrorType.Internal, error)
      }
    })

  const preventStepName = 'preventMultipleProcessing'
  const preventMultipleProcessing: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        const completed = await Mission.markCompleted(orderObject.order.ref, preventStepName)
        orderObject.order.data.completed = completed

        return orderObject
      } catch (error) {
        if (error.constructor === Mission.CompletedError) {
          throw new OrderableError(preventStepName, ErrorType.Completed, error)
        }

        // if not CompletedError, it maybe firebase internal error, because retry.
        orderObject.order.data.retry = await Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error)
        throw new OrderableError(preventStepName, ErrorType.Retry, error)
      }
    })

  const prepareRequiredData: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        orderObject.user = await order.data.user.get().then(s => { return new Tart.Snapshot<UserProtocol>(s) })

        const orderSKUObjects = await OrderSKUObject.fetchFrom(order)
        orderObject.orderSKUObjects = orderSKUObjects

        await orderObject.getShops()

        if (orderObject.paymentAgencyType === PaymentAgencyType.Stripe) {
          const stripeCard = await stripe.customers.retrieveCard(order.data.stripe!.customerID!, order.data.stripe!.cardID!)
          orderObject.stripeCard = stripeCard
        }

        return orderObject
      } catch (error) {
        // This error may be a data preparetion error. In that case, it will be solved by retrying.
        orderObject.order.data.retry = await Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error)
        throw new OrderableError(preventStepName, ErrorType.Retry, error)
      }
    })

  const validateShopIsActive: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const shops = orderObject.shops!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        shops.forEach((shop, index) => {
          if (!shop.data.isActive) {
            throw new BadRequestError(ValidationErrorType.ShopIsNotActive, `Shop: ${shop.data.name} is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateShopIsActive', ErrorType.BadRequest, error)
        }

        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validateShopIsActive', ErrorType.Internal, error)
      }
    })

  const validateSKUIsActive: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const orderSKUObjects = orderObject.orderSKUObjects!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        orderSKUObjects.forEach((orderSKUObject, index) => {
          if (!orderSKUObject.sku.data.isActive) {
            throw new BadRequestError(ValidationErrorType.SKUIsNotActive,
              `Product: ${orderSKUObject.orderSKU.data.snapshotProduct!.name}」 is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateSKUIsActive', ErrorType.BadRequest, error)
        }

        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validateSKUIsActive', ErrorType.Internal, error)
      }
    })

  const validatePaymentMethod: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        switch (orderObject.paymentAgencyType) {
          case PaymentAgencyType.Stripe:
            const stripeCard = orderObject.stripeCard!
            const now = new Date(new Date().getFullYear(), new Date().getMonth())
            const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1)

            if (expiredDate < now) {
              throw new BadRequestError(ValidationErrorType.StripeCardExpired,
                'This card is expired.')
            }
            break
          default:
            throw new BadRequestError(ValidationErrorType.PaymentInfoNotFound,
              'Payment information is not registered.')
        }

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validatePaymentMethod', ErrorType.BadRequest, error)
        }

        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validatePaymentMethod', ErrorType.Internal, error)
      }
    })

  const validateAndDecreaseStock: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        await orderObject.updateStock(Operator.minus, 'validateAndDecreaseStock')

        return orderObject
      } catch (error) {
        // clear completed mark for retry.
        orderObject.order.data.completed = await Mission.remove(orderObject.order.ref, preventStepName)

        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateAndDecreaseStock', ErrorType.BadRequest, error)
        }

        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validateAndDecreaseStock', ErrorType.Internal, error)
      }
    })

  const stripeCharge = async (order: Tart.Snapshot<OrderProtocol>) => {
    return await stripe.charges.create(
      {
        amount: order.data.amount,
        currency: order.data.currency!,
        customer: order.data.stripe!.customerID,
        source: order.data.stripe!.cardID,
        transfer_group: order.ref.id,
        metadata: {
          orderID: order.ref.id
        }
      },
      {
        idempotency_key: order.ref.id
      }
    ).catch(e => {
      throw new StripeError(e)
    })
  }

  const payment: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const user = orderObject.user!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        switch (orderObject.paymentAgencyType) {
          case PaymentAgencyType.Stripe:
            orderObject.stripeCharge = await stripeCharge(order)
            break
          default:
          // nothing to do
        }

        return orderObject
      } catch (error) {
        // Since stripe.charge failed after reducing stock count, restore stock quantity.
        await orderObject.updateStock(Operator.plus)
        orderObject.order.data.completed = await Mission.remove(orderObject.order.ref, preventStepName)

        if (error.constructor === StripeError) {
          const stripeError = error as StripeError
          const errorType = await stripeError.setError(orderObject.order, 'payment')
          throw new OrderableError('payment', errorType, error)
        }

        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('payment', ErrorType.Internal, error)
      }
    })

  /**
   * Save peyment succeeded information.
   * Set fatal error if this step failed.
   */
  const savePaymentCompleted: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const batch = firestore.batch()

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        switch (orderObject.paymentAgencyType) {
          case PaymentAgencyType.Stripe:
            const charge = orderObject.stripeCharge!

            order.data.paymentStatus = OrderPaymentStatus.Paid
            order.data.stripe!.chargeID = charge.id
            order.data.paidDate = new Date()
            batch.update(order.ref, {
              paymentStatus: OrderPaymentStatus.Paid,
              stripe: orderObject.order.data.stripe,
              paidDate: new Date(),
              updatedAt: new Date()
            })

            break
          default:
          // nothing to do
        }

        // const orderShopColRef = PringUtil.collectionPath(new orderObject.initializableClass.orderShop())
        // const orderColRef = PringUtil.collectionPath(new orderObject.initializableClass.order())
        await firestore.collection('version/1/ordershop')
          .where('order', '==', order.ref)
          .get()
          .then(snapshot => {
            // Only when paymentStatus is OrderShopPaymentStatus.Created, updates to OrderShopPaymentStatus.Paid.
            snapshot.docs.filter(s => {
              const orderShop = new Tart.Snapshot<OrderShopProtocol>(s)
              return orderShop.data.paymentStatus === OrderShopPaymentStatus.Created
            }).forEach(doc => {
              batch.update(doc.ref, {
                paymentStatus: OrderShopPaymentStatus.Paid,
                updatedAt: new Date()
              })
            })
          })

        await batch.commit()

        console.log('charge completed')

        return orderObject
      } catch (error) {
        // If this step failed, we can not remember chargeID. Because set fatal error.
        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('updateOrder', ErrorType.Internal, error)
      }
    })

  const setOrderTask: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setOK()

        return orderObject
      } catch (error) {
        // This step fails only when update error occurs. Because set retry.
        orderObject.order.data.retry = await Retrycf.setRetry(orderObject.order.ref, orderObject.order.data, error)
        throw new OrderableError('setOrderTask', ErrorType.Retry, error)
      }
    })

  /**
   * Start order processing.
   * @param orderObject
   */
  // export const orderPaymentRequested = async (orderObject: OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>) => {
  export const orderPaymentRequested = async (orderObject: OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>) => {
    try {
      const retryStatus = Retrycf.retryStatus(orderObject.order.data, orderObject.previousOrder.data)
      if (retryStatus === Retrycf.Status.RetryFailed) {
        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('orderPaymentRequested', 'Retry Failed')
        throw new OrderableError('orderPaymentRequested', ErrorType.Internal, new RetryFailedError('orderPaymentRequested', orderObject.order.data.retry!.errors.toString()))
      }

      // If order.paymentStatus update to PaymentRequested or should retry is true, continue processing.
      if (orderObject.previousOrder.data.paymentStatus !== orderObject.order.data.paymentStatus && orderObject.order.data.paymentStatus === OrderPaymentStatus.PaymentRequested) {
        // continue
      } else {
        if (retryStatus !== Retrycf.Status.ShouldRetry) {
          return undefined // not continue
        }
      }

      const flow = new Flow.Line([
        validateOrderExpired,
        prepareRequiredData,
        validateShopIsActive,
        validateSKUIsActive,
        validatePaymentMethod,
        preventMultipleProcessing,
        validateAndDecreaseStock,
        payment,
        savePaymentCompleted,
        setOrderTask
      ])

      await flow.run(orderObject)

      return Promise.resolve()
    } catch (error) {
      if (error.constructor !== OrderableError) {
        orderObject.order.data.result = await new EventResponse.Result(orderObject.order.ref).setInternalError('Unknown Error', error.message)
        throw new OrderableError('orderPaymentRequested', ErrorType.Internal, error)
      }

      return Promise.reject(error)
    }
  }
}
