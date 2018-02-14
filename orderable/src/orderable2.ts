import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Event, TriggerAnnotated } from 'firebase-functions'
import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import { Pring, property } from 'pring'
// import * as Retrycf from 'retrycf'
import * as Retrycf from './retrycf'
import * as Flow from '@1amageek/flow'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as request from 'request'
import * as Slack from 'slack-node'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'

let stripe: Stripe
let firestore: FirebaseFirestore.Firestore
let adminOptions: any

export const initialize = (options: { adminOptions: any, stripeToken: string}) => {
  Pring.initialize(options.adminOptions)
  Retrycf.initialize(options.adminOptions)
  Mission.initialize(options.adminOptions)
  EventResponse.initialize(options.adminOptions)
  EventResponse.configure({ collectionPath: 'version/1/failure' })
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  stripe = new Stripe(options.stripeToken)
  adminOptions = options.adminOptions
}

export enum ValidationErrorType {
  ShopIsNotActive = 'ShopIsNotActive',
  SKUIsNotActive = 'SKUIsNotActive',
  OutOfStock = 'OutOfStock',
  StripeCardError = 'StripeCardError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  StripeCardExpired = 'StripeCardExpired',
  PaymentInfoNotFound = 'PaymentInfoNotFound'
}

export class PringUtil {
  static collectionPath<T extends Pring.Base>(model: T): string {
    return `version/${model.getVersion()}/${model.getModelName()}`
  }

  static async get<T extends Pring.Base>(klass: { new(): T }, id: string) {
    const model = new klass()
    return firestore.collection(PringUtil.collectionPath(model)).doc(id).get().then(s => {
      model.init(s)
      return model
    })
  }
}

export interface UserProtocol extends Pring.Base {
  stripeCustomerID?: string
}

export interface ShopProtocol extends Pring.Base {
  name?: string
  isActive: boolean
  freePostageMinimumPrice: number
}

export interface ProductProtocol extends Pring.Base {
  name?: string
}

export enum StockType {
  Unknown = 'unknown',
  Finite = 'finite',
  Infinite = 'infinite'
}

export interface SKUProtocol extends Pring.Base {
  price: number
  stockType: StockType
  stock: number
  isPublished: boolean
  isActive: boolean
}

export enum OrderPaymentStatus {
  Unknown = 0,
  Created = 1,
  PaymentRequested = 2,
  WaitingForPayment = 3,
  Paid = 4
}

export interface StripeProtocol extends Pring.Base {
  cardID?: string
  customerID?: string
  chargeID?: string
}

export interface OrderProtocol extends Pring.Base {
  user: FirebaseFirestore.DocumentReference
  amount: number
  paidDate: FirebaseFirestore.FieldValue
  expirationDate: FirebaseFirestore.FieldValue
  currency?: string
  orderSKUs: Pring.ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>
  paymentStatus: OrderPaymentStatus
  stripe?: StripeProtocol

  // Mission
  completed?: { [id: string]: boolean }
  // EventResponse
  result?: EventResponse.IResult
  // Retrycf
  retry?: Retrycf.IRetry
}

export enum OrderShopPaymentStatus {
  Unknown = 0,
  Created = 1,
  Paid = 2
}
export interface OrderShopProtocol extends Pring.Base {
  orderSKUs: Pring.ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>
  paymentStatus: OrderShopPaymentStatus
  user: FirebaseFirestore.DocumentReference
}

export interface OrderSKUProtocol<T extends SKUProtocol, P extends ProductProtocol> extends Pring.Base {
  snapshotSKU?: T
  snapshotProduct?: P
  quantity: number
  sku: FirebaseFirestore.DocumentReference
  shop: FirebaseFirestore.DocumentReference
}

export class BaseError extends Error {
  id: string
  name: string
  message: string
  stack?: string

  constructor(id: string, message: string) {
    super(message)

    Object.defineProperty(this, 'id', {
      get: () => id
    })

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error()).stack
    }
  }

  toString() {
    return this.name + ': ' + this.id + ': ' + this.message
  }
}

export class BadRequestError extends BaseError {
  name: 'BadRequestError'

  constructor(id: string, message: string) {
    super(id, message)
  }
}

export enum ErrorType {
  Retry = 'Retry',
  Completed = 'Completed',
  BadRequest = 'BadRequest',
  Internal = 'Internal'
}

export class OrderableError extends Error {
  step: string
  type: ErrorType

  constructor(step: string, errorType: ErrorType, error: Error) {
    super(`An error occurred in step: ${step}`)

    Object.defineProperty(this, 'step', {
      get: () => step
    })

    Object.defineProperty(this, 'type', {
      get: () => step
    })

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error()).stack
    }
  }
}

export enum StripeErrorType {
  StripeCardError = 'StripeCardError',
  RateLimitError = 'RateLimitError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  // An error occurred internally with Stripe's API
  StripeAPIError = 'StripeAPIError',
  StripeConnectionError = 'StripeConnectionError',
  StripeAuthenticationError = 'StripeAuthenticationError',
  UnexpectedError = 'UnexpectedError'
}

export class StripeError extends Error {
  type: StripeErrorType
  message: string
  statusCode: number
  requestId: string
  error: any

  constructor(error: any) {
    super()

    if (!error.type) {
      console.error(error)
      throw 'unexpected stripe error'
    }

    this.error = error
    this.message = error.message
    this.statusCode = error.statusCode
    this.requestId = error.requestId

    switch (error.type) {
      case 'StripeCardError':
        this.type = StripeErrorType.StripeCardError
        break
      case 'RateLimitError':
        this.type = StripeErrorType.RateLimitError
        break
      case 'StripeInvalidRequestError':
        this.type = StripeErrorType.StripeInvalidRequestError
        break
      case 'StripeAPIError':
        this.type = StripeErrorType.StripeAPIError
        break
      case 'StripeConnectionError':
        this.type = StripeErrorType.StripeConnectionError
        break
      case 'StripeAuthenticationError':
        this.type = StripeErrorType.StripeAuthenticationError
        break
      default:
        this.type = StripeErrorType.UnexpectedError
        break
    }
  }

  async setError<T extends OrderProtocol>(model: T, step: string) {
    let errorType: ErrorType = ErrorType.Internal
    switch (this.type) {
      // validate
      case StripeErrorType.StripeCardError: {
        errorType = ErrorType.BadRequest
        model.result = await new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeCardError, `${this.type}: ${this.message}`)
        break
      }
      case StripeErrorType.StripeInvalidRequestError: {
        errorType = ErrorType.BadRequest
        model.result = await new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeInvalidRequestError, `${this.type}: ${this.message}`)
        break
      }

      // retry
      case StripeErrorType.StripeAPIError:
      case StripeErrorType.StripeConnectionError:
        errorType = ErrorType.Retry
        model.retry = await Retrycf.setRetry(model.reference, model.rawValue(), `${this.type}: ${this.message}`)
        break

      // fatal
      case StripeErrorType.RateLimitError:
      case StripeErrorType.StripeAuthenticationError:
      case StripeErrorType.UnexpectedError:
        errorType = ErrorType.Internal
        model.result = await new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`)
        break

      default:
        errorType = ErrorType.Internal
        model.result = await new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`)
        break
    }
    return errorType
  }
}

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
              // throw new Retrycf.ValidationError(ValidationErrorType.OutOfStock,
              //   `${orderSKUObject.orderSKU.snapshotProduct!.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`)
              throw new BadRequestError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.snapshotProduct!.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`)
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
        // orderObject.order = await NeoTask.setRetry(orderObject.order, 'prepareRequiredData', error)
        // TODO: Retry
        // throw new FlowError(error, orderObject.order.neoTask)

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
            // throw new Retrycf.ValidationError(ValidationErrorType.ShopIsNotActive,
            // `Shop: ${shop.name} is not active.`)
            throw new BadRequestError(ValidationErrorType.ShopIsNotActive, `Shop: ${shop.name} is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        // if (error.constructor === Retrycf.ValidationError) {
        //   const validationError = error as Retrycf.ValidationError
        //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
        //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(ValidationErrorType.ShopIsNotActive, validationError.reason)
        //   throw new FlowError(error, orderObject.order.neoTask)
        // }
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
            // throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive,
              `Product: ${orderSKUObject.orderSKU.snapshotProduct!.name}」 is not active.`)
          }
        })

        return orderObject
      } catch (error) {
        // if (error.constructor === Retrycf.ValidationError) {
        //   const validationError = error as Retrycf.ValidationError
        //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
        //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
        //   throw new FlowError(error, orderObject.order.neoTask)
        // }

        // throw (error)
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
              // throw new Retrycf.ValidationError(ValidationErrorType.StripeCardExpired,
            }
            break
          default:
            // throw new Retrycf.ValidationError(ValidationErrorType.PaymentInfoNotFound,
            throw new BadRequestError(ValidationErrorType.PaymentInfoNotFound,
              'Payment information is not registered.')
        }

        return orderObject
      } catch (error) {
        // if (error.constructor === Retrycf.ValidationError) {
        //   const validationError = error as Retrycf.ValidationError
        //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
        //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
        //   throw new FlowError(error, orderObject.order.neoTask)
        // }

        // throw (error)
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

        // TODO: Delete the extra processing
        // orderObject.order = await PringUtil.get(orderObject.initializableClass.order, orderObject.orderID)

        return orderObject
      } catch (error) {
        // // clear function started flag for retry.
        // orderObject.order.completed = await Mission.remove(orderObject.order.reference, preventStepName)

        // if (error.constructor === Retrycf.ValidationError) {
        //   const validationError = error as Retrycf.ValidationError
        //   // orderObject.order = await NeoTask.setInvalid(orderObject.order, validationError)
        //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(validationError.validationErrorType, validationError.reason)
        //   throw new FlowError(error, orderObject.order.neoTask)
        // }
        if (error.constructor === BadRequestError) {
          const brError = error as BadRequestError
          orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest(brError.id, brError.message)
          throw new OrderableError('validateAndDecreaseStock', ErrorType.BadRequest, error)
        }

        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('validateAndDecreaseStock', ErrorType.Internal, error)

        // throw (error)
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
        // await orderObject.updateStock(Operator.plus)
        // // Restored stock count, so clean up `completed` for retry.
        // orderObject.order.completed = await Mission.remove(orderObject.order.reference, preventStepName)

        if (error.constructor === StripeError) {
          const stripeError = error as StripeError
          // orderObject.order = await stripeError.setNeoTask(orderObject.order, 'payment')
          // TODO: striperror handling
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
              stripe: { chargeID: charge.id },
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
        // orderObject.order = await NeoTask.setFatalAndPostToSlack(orderObject.order, 'updateOrder', error)
        // orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest('updateOrder', error)
        // throw new FlowError(error, orderObject.order.neoTask)

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
        // orderObject.order = await NeoTask.setRetry(orderObject.order, 'updateOrderShops', error)
        // TODO: set retry
        // throw new FlowError(error, orderObject.order)

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
        // orderObject.order = await NeoTask.setRetry(orderObject.order, 'setOrderTask', error)
        // TODO: Retry
        // throw new FlowError(error, orderObject.order)
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
      const shouldRetry = false
      // TODO: Retry
      // const shouldRetry = NeoTask.shouldRetry(orderObject.order, orderObject.previousOrder)
      // orderObject.order = await NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(orderObject.order, orderObject.previousOrder)

      // If order.paymentStatus update to PaymentRequested or should retry is true, continue processing.
      if (orderObject.previousOrder.paymentStatus !== orderObject.order.paymentStatus && orderObject.order.paymentStatus === OrderPaymentStatus.PaymentRequested) {
        // continue
      } else {
        if (!shouldRetry) {
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
      // if (error.constructor === Mission.CompletedError) {
      //   // If CompletedError was thrown, finish functions without set result.
      //   return undefined
      // }

      // // If not thrown as FlowError, set FlowError.
      // if (error.constructor !== FlowError) {
      //   // await NeoTask.setFatalAndPostToSlack(orderObject.order, 'orderPaymentRequested', error.toString())
      //   orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setBadRequest('orderPaymentRequested', error.toString())
      // }

      if (error.constructor !== OrderableError) {
        orderObject.order.result = await new EventResponse.Result(orderObject.order.reference).setInternalError('Unknown Error', error.message)
        throw new OrderableError('orderPaymentRequested', ErrorType.Internal, error)
      }

      return Promise.reject(error)
    }
  }
}
