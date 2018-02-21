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
import { PringUtil } from './util'
import { BadRequestError, BaseError, ErrorType, OrderableError, RetryFailedError, StripeError, StripeErrorType, ValidationErrorType } from './error'
import { OrderPaymentStatus, OrderProtocol, OrderShopPaymentStatus, OrderShopProtocol, OrderSKUProtocol, ProductProtocol, ShopProtocol, SKUProtocol, StockType, StripeProtocol, UserProtocol } from './protocol'
import { firestore, stripe } from './index'

export namespace Functions {
  export class OrderSKUObject<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol> {
    orderSKU: OrderSKU
    sku: SKU

    static async fetchFrom<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol>(order: OrderProtocol, orderSKUType: { new(): OrderSKU }, skuType: { new(): SKU }) {
      const orderSKURefs = await order.orderSKUs.get(orderSKUType)
      const orderSKUObjects = await Promise.all(orderSKURefs.map(orderSKURef => {
        return PringUtil.get(orderSKUType, orderSKURef.id).then(s => {
          const orderSKU = s as OrderSKU
          const orderSKUObject = new OrderSKUObject()
          orderSKUObject.orderSKU = orderSKU
          return orderSKUObject
        })
      }))

      await Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
        return orderSKUObject.orderSKU.sku.get().then(skuSnapshop => {
          const s = new skuType()
          s.init(skuSnapshop)
          orderSKUObjects[index].sku = s
        })
      }))
      return orderSKUObjects
    }
  }

  export interface InitializableClass<
    Order extends OrderProtocol,
    Shop extends ShopProtocol,
    User extends UserProtocol,
    SKU extends SKUProtocol,
    Product extends ProductProtocol,
    OrderShop extends OrderShopProtocol,
    OrderSKU extends OrderSKUProtocol<SKU, Product>
    > {
    order: { new(): Order }
    shop: { new(): Shop }
    user: { new(): User }
    sku: { new(): SKU }
    product: { new(): Product }
    orderShop: { new(): OrderShop }
    orderSKU: { new(): OrderSKU }
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

    initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>

    event: functions.Event<DeltaDocumentSnapshot>
    orderID: string
    order: Order
    previousOrder: Order
    shops?: Shop[]
    user?: User
    orderSKUObjects?: OrderSKUObject<OrderSKU, SKU>[]
    stripeCharge?: Stripe.charges.ICharge
    stripeCard?: Stripe.cards.ICard

    async getShops() {
      this.shops = await Promise.all(this.orderSKUObjects!.map(orderSKUObject => {
        return orderSKUObject.orderSKU.shop
      }).filter((shopRef, index, self) => { // deduplication
        return self.indexOf(shopRef) === index
      }).map(shopRef => {
        return shopRef.get().then(shopSnapshot => {
          const shop = new this.initializableClass.shop()
          shop.init(shopSnapshot)
          return shop
        })
      }))
    }

    constructor(event: functions.Event<DeltaDocumentSnapshot>, initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>) {
      this.event = event
      this.orderID = event.params!.orderID!
      this.initializableClass = initializableClass
      this.order = new initializableClass.order()
      this.order.init(event.data)
      this.previousOrder = new initializableClass.order()
      this.previousOrder.init(event.data.previous)
    }

    get isCharged(): boolean {
      if (this.order && this.order.stripe && this.order.stripe.chargeID) {
        return true
      }
      return false
    }

    get paymentAgencyType() {
      if (!this.order) {
        return PaymentAgencyType.Unknown
      }

      if (this.order.stripe) {
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
          const skuRef = firestore.collection(PringUtil.collectionPath(new this.initializableClass.sku())).doc(orderSKUObject.sku.id)
          const t = transaction.get(skuRef).then(tsku => {
            const quantity = orderSKUObject.orderSKU.quantity * operator
            const newStock = tsku.data()!.stock + quantity

            if (newStock >= 0) {
              transaction.update(skuRef, { stock: newStock })
            } else {
              throw new BadRequestError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.snapshotProduct!.name} is out of stock. \nquantity: ${orderSKUObject.orderSKU.quantity}, stock: ${orderSKUObject.sku.stock}`)
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

        if (new Date(order.expirationDate as string) > new Date()) {
          throw new BadRequestError(ValidationErrorType.OrderExpired, 'The order has expired.')
        }

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
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

        const completed = await Mission.markCompleted(orderObject.order.reference, preventStepName)
        orderObject.order.completed = completed

        return orderObject
      } catch (error) {
        if (error.constructor === Mission.CompletedError) {
          throw new OrderableError(preventStepName, ErrorType.Completed, error)
        }

        // if not CompletedError, it maybe firebase internal error, because retry.
        orderObject.order.retry = await Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error)
        throw new OrderableError(preventStepName, ErrorType.Retry, error)
      }
    })

  const prepareRequiredData: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        const user = await PringUtil.get(orderObject.initializableClass.user, order.user.id)
        orderObject.user = user

        const orderSKUObjects = await OrderSKUObject.fetchFrom(order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
        orderObject.orderSKUObjects = orderSKUObjects

        await orderObject.getShops()

        if (orderObject.paymentAgencyType === PaymentAgencyType.Stripe) {
          const stripeCard = await stripe.customers.retrieveCard(order.stripe!.customerID!, order.stripe!.cardID!)
          orderObject.stripeCard = stripeCard
        }

        return orderObject
      } catch (error) {
        // This error may be a data preparetion error. In that case, it will be solved by retrying.
        orderObject.order.retry = await Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error)
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
          if (!shop.isActive) {
            throw new BadRequestError(ValidationErrorType.ShopIsNotActive, `Shop: ${shop.name} is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateShopIsActive', ErrorType.BadRequest, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
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
          if (!orderSKUObject.sku.isActive) {
            throw new BadRequestError(ValidationErrorType.SKUIsNotActive,
              `Product: ${orderSKUObject.orderSKU.snapshotProduct!.name}」 is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateSKUIsActive', ErrorType.BadRequest, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
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
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validatePaymentMethod', ErrorType.BadRequest, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
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
        orderObject.order.completed = await Mission.remove(orderObject.order.reference, preventStepName)

        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateAndDecreaseStock', ErrorType.BadRequest, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validateAndDecreaseStock', ErrorType.Internal, error)
      }
    })

  const stripeCharge = async (order: OrderProtocol) => {
    return await stripe.charges.create(
      {
        amount: order.amount,
        currency: order.currency!,
        customer: order.stripe!.customerID,
        source: order.stripe!.cardID,
        transfer_group: order.id,
        metadata: {
          orderID: order.id
        }
      },
      {
        idempotency_key: order.id
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
        orderObject.order.completed = await Mission.remove(orderObject.order.reference, preventStepName)

        if (error.constructor === StripeError) {
          const stripeError = error as StripeError
          const errorType = await stripeError.setError(orderObject.order, 'payment')
          throw new OrderableError('payment', errorType, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('payment', ErrorType.Internal, error)
      }
    })

  /**
   * Save peyment succeeded information.
   * Set fatal error if this step failed.
   */
  const updateOrder: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        if (orderObject.isCharged) { // skip if payment completed
          return orderObject
        }

        switch (orderObject.paymentAgencyType) {
          case PaymentAgencyType.Stripe:
            const charge = orderObject.stripeCharge!

            order.paymentStatus = OrderPaymentStatus.Paid
            order.stripe!.chargeID = charge.id
            order.paidDate = FirebaseFirestore.FieldValue.serverTimestamp()
            // FIXME: Error: Cannot encode type ([object Object]) to a Firestore Value
            // await order.update()
            await order.reference.update({
              paymentStatus: OrderPaymentStatus.Paid,
              stripe: orderObject.order.rawValue().stripe ,
              paidDate: FirebaseFirestore.FieldValue.serverTimestamp(),
              updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
            })
            break
          default:
          // nothing to do
        }

        console.log('charge completed')

        return orderObject
      } catch (error) {
        // If this step failed, we can not remember chargeID. Because set fatal error.
        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('updateOrder', ErrorType.Internal, error)
      }
    })

  const updateOrderShops: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const orderShopColRef = PringUtil.collectionPath(new orderObject.initializableClass.orderShop())
        const orderColRef = PringUtil.collectionPath(new orderObject.initializableClass.order())
        await firestore.collection(orderShopColRef)
          .where('order', '==', firestore.collection(orderColRef).doc(orderObject.orderID))
          .get()
          .then(snapshot => {
            const batch = firestore.batch()

            // Only when paymentStatus is OrderShopPaymentStatus.Created, updates to OrderShopPaymentStatus.Paid.
            snapshot.docs.filter(doc => {
              const orderShop = new orderObject.initializableClass.orderShop()
              orderShop.init(doc)
              return orderShop.paymentStatus === OrderShopPaymentStatus.Created
            }).forEach(doc => {
              batch.update(doc.ref, {
                paymentStatus: OrderShopPaymentStatus.Paid,
                updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
              })
            })
            return batch.commit()
          })

        return orderObject
      } catch (error) {
        // This step fails only when a batch error occurs. Because set retry.
        orderObject.order.retry = await Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error)
        throw new OrderableError('updateOrderShops', ErrorType.Retry, error)
      }
    })

  const setOrderTask: Flow.Step<OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>>
    = new Flow.Step(async (orderObject) => {
      try {
        // orderObject.order = await NeoTask.setSuccess(orderObject.order)
        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setOK()

        return orderObject
      } catch (error) {
        // This step fails only when update error occurs. Because set retry.
        orderObject.order.retry = await Retrycf.setRetry(orderObject.order.reference, orderObject.order.rawValue(), error)
        throw new OrderableError('setOrderTask', ErrorType.Retry, error)
      }
    })

  /**
   * Start order processing.
   * @param orderObject
   */
  export const orderPaymentRequested = async (orderObject: OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>) => {
    try {
      const retryStatus = Retrycf.retryStatus(orderObject.order.rawValue(), orderObject.previousOrder.rawValue())
      if (retryStatus === Retrycf.Status.RetryFailed) {
        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('orderPaymentRequested', 'Retry Failed')
        throw new OrderableError('orderPaymentRequested', ErrorType.Internal, new RetryFailedError('orderPaymentRequested', orderObject.order.retry!.errors.toString()))
      }

      // If order.paymentStatus update to PaymentRequested or should retry is true, continue processing.
      if (orderObject.previousOrder.paymentStatus !== orderObject.order.paymentStatus && orderObject.order.paymentStatus === OrderPaymentStatus.PaymentRequested) {
        // continue
      } else {
        if (retryStatus !== Retrycf.Status.ShouldRetry) {
          return undefined // not continue
        }
      }

      const flow = new Flow.Line([
        prepareRequiredData,
        validateShopIsActive,
        validateSKUIsActive,
        validatePaymentMethod,
        preventMultipleProcessing,
        validateAndDecreaseStock,
        payment,
        updateOrder,
        updateOrderShops,
        setOrderTask
      ])

      await flow.run(orderObject)

      return Promise.resolve()
    } catch (error) {
      if (error.constructor !== OrderableError) {
        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('orderPaymentRequested', ErrorType.Internal, error)
      }

      return Promise.reject(error)
    }
  }
}
