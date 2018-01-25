import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Event, TriggerAnnotated } from 'firebase-functions'
import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import { Pring, property } from 'pring'
import { Retrycf } from 'retrycf'
import * as Flow from '@1amageek/flow'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as request from 'request'

let stripe: Stripe
let firestore: FirebaseFirestore.Firestore
let slackURL: string
let slackChannel: string

export const initialize = (options: { adminOptions: any, stripeToken: string, slack: { url: string, channel: string } }) => {
  Pring.initialize(options.adminOptions)
  Retrycf.initialize(options.adminOptions)
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  stripe = new Stripe(options.stripeToken)
  slackURL = options.slack.url
  slackChannel = options.slack.channel
}

interface SlackParams {
  url?: string
  channel?: string
  username?: string
  iconEmoji?: string
}

class Slack {
  url: string
  channel: string
  username: string
  iconEmoji: string

  constructor(params: SlackParams) {
    this.url = params.url || slackURL
    this.channel = params.channel || slackChannel
    this.username = params.username || 'cloud-functions-police'
    this.iconEmoji = params.iconEmoji || ':warning:'
  }

  async post(text: string) {
    const options = {
      json: {
        channel: this.channel,
        username: this.username,
        text: text,
        icon_emoji: this.iconEmoji
      }
    }

    await request.post(this.url, options, (error, response, body) => {
      if (error || response.statusCode !== 200) {
        throw `slack error: ${error}, response.statusCode: ${response.statusCode}, body: ${body}`
      }
    })
  }
}

export enum ValidationErrorType {
  ShopIsNotActive = 'ShopIsNotActive',
  SKUIsNotActive = 'SKUIsNotActive',
  OutOfStock = 'OutOfStock',
  StripeCardError = 'StripeCardError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  StripeCardExpired = 'StripeCardExpired'
}

export class FlowError extends Error {
  task: Retrycf.INeoTask
  error: any

  constructor(task: Retrycf.INeoTask, error: any) {
    super()
    this.task = task
    this.error = error
  }
}

export class NeoTask extends Retrycf.NeoTask {
  static async  setFatalAndPostToSlackIfRetryCountIsMax(event: functions.Event<DeltaDocumentSnapshot>) {
    const neoTask = await NeoTask.setFatalIfRetryCountIsMax(event)
    if (neoTask) {
      await new Slack({}).post(`fatal error! step: retry_failed, error: ${JSON.stringify(neoTask.rawValue())}`)
    }
  }

  static async setFatalAndPostToSlack(event: functions.Event<DeltaDocumentSnapshot>, step: string, error: any) {
    await new Slack({}).post(`fatal error! step: ${step}, error: ${error}`)
    return NeoTask.setFatal(event, step, error)
  }
}

export namespace Model {
  export class HasNeoTask extends Pring.Base {
    @property neoTask?: HasNeoTask
  }

  export class User extends Pring.Base {
    @property stripeCustomerID?: string
  }

  export class Shop extends Pring.Base {
    @property name?: string
    @property isActive: boolean = true
    @property freePostageMinimunPrice: number = -1
  }

  export class Product extends Pring.Base {
    @property name?: string
  }

  export enum StockType {
    Unknown = 'unknown',
    Finite = 'finite',
    Infinite = 'infinite'
  }

  export class SKU extends Pring.Base {
    @property price: number = 0
    @property stockType: StockType = StockType.Unknown
    @property stock: number = 0
    @property isPublished: boolean = true
    @property isActive: boolean = true

    // 在庫チェック
    isInStock(quantity: number): boolean {
      return this.stock - quantity >= 0
    }
  }

  export enum OrderStatus {
    Unknown = 0,
    Created = 1,
    PaymentRequested = 2,
    WaitingForPayment = 3,
    Paid = 4
  }
  export class Order extends HasNeoTask {
    @property user: FirebaseFirestore.DocumentReference
    @property stripeCardID?: string
    @property amount: number = 0
    @property skuPriceSum: number = 0
    @property postage: number = 0
    @property paidDate: FirebaseFirestore.FieldValue
    @property expirationDate: FirebaseFirestore.FieldValue = new Date().setHours(new Date().getHours() + 1)
    @property status: OrderStatus = OrderStatus.Created
    @property stripeChargeID?: string
    @property currency?: string

    // @property orderShops: Pring.ReferenceCollection<OrderShop> = new Pring.ReferenceCollection(this)

    @property orderSKUs: Pring.ReferenceCollection<OrderSKU> = new Pring.ReferenceCollection(this)
  }

  export enum OrderShopStatus {
    Unknown = 0,
    Created = 1,
    Paid = 2,
    Delivered = 3,
    Recieved = 4
  }
  export class OrderShop extends Pring.Base {
    @property orderSKUs: Pring.ReferenceCollection<OrderSKU> = new Pring.ReferenceCollection(this)
    @property status: OrderShopStatus = OrderShopStatus.Unknown

    @property order: FirebaseFirestore.DocumentReference
    @property user: FirebaseFirestore.DocumentReference
  }

  export class OrderSKU extends Pring.Base {
    @property orderShop: FirebaseFirestore.DocumentReference
    @property snapshotSKU: SKU
    @property snapshotProduct: Product
    @property quantity: number = 0

    // @property order: FirebaseFirestore.DocumentReference
    // @property user: FirebaseFirestore.DocumentReference
    @property sku: FirebaseFirestore.DocumentReference
    // @property product: FirebaseFirestore.DocumentReference
    @property shop: FirebaseFirestore.DocumentReference
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

  async setNeoTask(event: functions.Event<DeltaDocumentSnapshot>, step: string): Promise<NeoTask> {
    switch (this.type) {
      // validate
      case StripeErrorType.StripeCardError: {
        const validationError = new Retrycf.ValidationError(ValidationErrorType.StripeCardError, this.message)
        return await NeoTask.setInvalid(event, validationError)
      }
      case StripeErrorType.StripeInvalidRequestError: {
        const validationError = new Retrycf.ValidationError(ValidationErrorType.StripeInvalidRequestError, this.message)
        return await NeoTask.setInvalid(event, validationError)
      }

      // retry
      case StripeErrorType.StripeAPIError:
      case StripeErrorType.StripeConnectionError:
        return await NeoTask.setRetry(event, step, this.message)

      // fatal
      case StripeErrorType.RateLimitError:
      case StripeErrorType.StripeAuthenticationError:
      case StripeErrorType.UnexpectedError:
        return await NeoTask.setFatalAndPostToSlack(event, step, this.type)

      default:
        return await NeoTask.setFatalAndPostToSlack(event, step, this.type)
    }
  }
}

export namespace Functions {
  class OrderSKUObject {
    orderSKU: Model.OrderSKU
    sku: Model.SKU

    static async fetchFrom(order: Model.Order): Promise<OrderSKUObject[]> {
      const orderSKUDocs = await order.orderSKUs.get()
      const orderSKUObjects = await Promise.all(orderSKUDocs.map(orderSKUDoc => {
        return Model.OrderSKU.get(orderSKUDoc.id).then(s => {
          const orderSKU = s as Model.OrderSKU
          const orderSKUObject = new OrderSKUObject()
          orderSKUObject.orderSKU = orderSKU
          return orderSKUObject
        })
      }))

      await Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
        return orderSKUObject.orderSKU.sku.get().then(skuSnapshop => {
          const s = new Model.SKU()
          s.init(skuSnapshop)
          orderSKUObjects[index].sku = s
        })
      }))
      return orderSKUObjects
    }
  }

  class OrderObject implements Flow.Dependency {
    orderID: string
    event: functions.Event<DeltaDocumentSnapshot>
    order?: Model.Order
    shops?: Model.Shop[]
    user?: Model.User
    orderSKUObjects?: OrderSKUObject[]
    stripeCharge?: Stripe.charges.ICharge
    stripeCard?: Stripe.cards.ICard

    static async fetchShopsFrom(orderSKUObjects: OrderSKUObject[]) {
      return await Promise.all(orderSKUObjects.map(orderSKUObject => {
        return orderSKUObject.orderSKU.shop
      }).filter((shopRef, index, self) => { // 重複排除
        return self.indexOf(shopRef) === index
      }).map(shopRef => {
        return shopRef.get().then(shopSnapshot => {
          const shop = new Model.Shop()
          shop.init(shopSnapshot)
          return shop
        })
      })
      )
    }

    constructor(orderID: string, event: functions.Event<DeltaDocumentSnapshot>) {
      this.orderID = orderID
      this.event = event
    }

    updateStock(operator: Operator) {
      const orderSKUObjects = this.orderSKUObjects
      if (!orderSKUObjects) {
        throw Error('orderSKUObjects must be non-null')
      }

      return firestore.runTransaction(async (transaction) => {
        const promises: Promise<any>[] = []
        for (const orderSKUObject of orderSKUObjects) {
          const skuRef = firestore.collection(`version/1/sku`).doc(orderSKUObject.sku.id)
          const t = transaction.get(skuRef).then(tsku => {
            const quantity = orderSKUObject.orderSKU.quantity * operator
            const newStock = tsku.data()!.stock + quantity

            if (newStock >= 0) {
              transaction.update(skuRef, { stock: newStock })
            } else {
              throw new Retrycf.ValidationError(ValidationErrorType.OutOfStock,
                `${orderSKUObject.orderSKU.snapshotProduct.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`)
            }
          })
          promises.push(t)
        }

        // 重複実行された時に、2回目の実行を弾く
        promises.push(NeoTask.markComplete(this.event, transaction, 'validateAndDecreaseStock'))

        return Promise.all(promises)
      })
    }
  }

  enum Operator {
    plus = +1,
    minus = -1
  }

  const prepareRequiredData: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = <Model.Order>await Model.Order.get(orderObject.orderID)
      const user = await order.user.get().then(s => {
        const u = new Model.User()
        u.init(s)
        return u
      })
      const orderSKUObjects = await OrderSKUObject.fetchFrom(order)
      const shops = await OrderObject.fetchShopsFrom(orderSKUObjects)
      const stripeCard = await stripe.customers.retrieveCard(user.stripeCustomerID!, order.stripeCardID!)

      console.log('amount', order.amount)
      console.log('stripeCardID', order.stripeCardID)
      console.log('stripeCustomerID', user.stripeCustomerID)

      orderObject.order = order
      orderObject.user = user
      orderObject.orderSKUObjects = orderSKUObjects
      orderObject.shops = shops
      orderObject.stripeCard = stripeCard

      return orderObject
    } catch (error) {
      // ここで起きるエラーは取得エラーのみのはずなので retry
      const neoTask = await NeoTask.setRetry(orderObject.event, 'prepareRequiredData', error)
      throw new FlowError(neoTask, error)
    }
  })

  const validateShopIsActive: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!
      const shops = orderObject.shops!

      // 決済済みだったらスキップして良い
      if (order.stripeChargeID) {
        return orderObject
      }

      shops.forEach((shop, index) => {
        if (!shop.isActive) {
          throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive,
            `ショップ「${shop.name}」は現在ご利用いただけません。`)
        }
      })

      return orderObject
    } catch (error) {
      if (error.constructor === Retrycf.ValidationError) {
        const validationError = error as Retrycf.ValidationError
        const neoTask = await NeoTask.setInvalid(orderObject.event, validationError)
        throw new FlowError(neoTask, error)
      }

      throw (error)
    }
  })

  const validateSKUIsActive: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!
      const orderSKUObjects = orderObject.orderSKUObjects!

      // 決済済みだったらスキップして良い
      if (order.stripeChargeID) {
        return orderObject
      }

      orderSKUObjects.forEach((orderSKUObject, index) => {
        if (!orderSKUObject.sku.isActive) {
          throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive,
            `商品「${orderSKUObject.orderSKU.snapshotProduct.name}」は現在ご利用いただけません。`)
        }
      })

      return orderObject
    } catch (error) {
      if (error.constructor === Retrycf.ValidationError) {
        const validationError = error as Retrycf.ValidationError
        const neoTask = await NeoTask.setInvalid(orderObject.event, validationError)
        throw new FlowError(neoTask, error)
      }

      throw (error)
    }
  })

  const validateCardExpired: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!
      const stripeCard = orderObject.stripeCard!

      // 決済済みだったらスキップ
      if (order.stripeChargeID) {
        return orderObject
      }

      const now = new Date(new Date().getFullYear(), new Date().getMonth())
      const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1)

      if (expiredDate < now) {
        throw new Retrycf.ValidationError(ValidationErrorType.StripeCardExpired, 'カードの有効期限が切れています。')
      }

      return orderObject
    } catch (error) {
      if (error.constructor === Retrycf.ValidationError) {
        const validationError = error as Retrycf.ValidationError
        const neoTask = await NeoTask.setInvalid(orderObject.event, validationError)
        throw new FlowError(neoTask, error)
      }

      throw (error)
    }
  })

  const validateAndDecreaseStock: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!

      // 決済済みだったらスキップして良い
      if (order.stripeChargeID) {
        return orderObject
      }

      await orderObject.updateStock(Operator.minus)

      return orderObject
    } catch (error) {
      if (error.constructor === Retrycf.ValidationError) {
        const validationError = error as Retrycf.ValidationError
        const neoTask = await NeoTask.setInvalid(orderObject.event, validationError)
        throw new FlowError(neoTask, error)
      }

      throw (error)
    }
  })

  const stripeCharge: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!
      const user = orderObject.user!
      const currency = order.currency!

      // 決済済み
      if (order.stripeChargeID) {
        return orderObject
      }

      const charge = await stripe.charges.create(
        {
          amount: order.amount,
          currency: currency,
          customer: user.stripeCustomerID,
          source: order.stripeCardID,
          transfer_group: order.id,
          metadata: {
            orderID: order.id,
            skuPriceSum: order.skuPriceSum,
            postage: order.postage,
            userID: user.id
          }
        },
        {
          idempotency_key: order.id
        }
      ).catch(e => {
        throw new StripeError(e)
      })

      orderObject.stripeCharge = charge

      return orderObject
    } catch (error) {
      // 在庫数を減らした後に stripe.charge が失敗したので、在庫数を元に戻す
      await orderObject.updateStock(Operator.plus)
      await NeoTask.clearComplete(orderObject.event)

      if (error.constructor === StripeError) {
        const stripeError = new StripeError(error)
        const neoTask = await stripeError.setNeoTask(orderObject.event, 'stripeCharge')
        throw new FlowError(neoTask, error)
      }

      throw (error)
    }
  })

  /// ここでこけたらおわり、 charge が浮いている状態になる。
  const updateOrder: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!

      // 決済済み
      if (order.stripeChargeID) {
        return orderObject
      }

      const charge = orderObject.stripeCharge!

      order.status = Model.OrderStatus.Paid
      order.stripeChargeID = charge.id
      await order.update()
      console.log('charge completed')

      return orderObject
    } catch (error) {
      // ここでコケたら stripeChargeID すらわからなくなってしまうので retry もできないので fatal
      const neoTask = await NeoTask.setFatalAndPostToSlack(orderObject.event, 'updateOrder', error)
      throw new FlowError(neoTask, error)
    }
  })

  const updateOrderShops: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!

      await firestore.collection('version/1/ordershop')
        .where('order', '==', firestore.collection(`version/1/order`).doc(order.id))
        .get()
        .then(snapshot => {
          const batch = firestore.batch()

          // OrderShopStatus が Create のだけ Paid に更新する。
          snapshot.docs.filter(doc => {
            const orderShop = new Model.OrderShop()
            orderShop.init(doc)
            return orderShop.status === Model.OrderShopStatus.Created
          }).forEach(doc => {
            batch.update(doc.ref, { status: Model.OrderShopStatus.Paid })
          })
          return batch.commit()
        })

      return orderObject
    } catch (error) {
      // 失敗する可能性があるのは batch の失敗だけなので retry
      const neoTask = await NeoTask.setRetry(orderObject.event, 'updateOrderShops', error)
      throw new FlowError(neoTask, error)
    }
  })

  const setOrderTask: Flow.Step<OrderObject> = new Flow.Step(async (orderObject) => {
    try {
      const order = orderObject.order!

      // await Task.success(order.reference, order.rawValue())

      await NeoTask.success(orderObject.event)

      return orderObject
    } catch (error) {
      // 失敗する可能性があるのは update の失敗だけなので retry
      const neoTask = await NeoTask.setRetry(orderObject.event, 'setOrderTask', error)
      throw new FlowError(neoTask, error)
    }
  })

  export const orderPaymentRequested = async (event: Event<DeltaDocumentSnapshot>) => {
  // functions.firestore.document(`version/1/order/{orderID}`).onUpdate(async event => {
    try {
      const shouldRetry = NeoTask.shouldRetry(event.data)
      await NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(event)

      // status が payment requested に変更された時
      // もしくは should retry が true だった時にこの functions は実行される
      // if (ValueChanges.for('status', event.data) !== ValueChangesResult.updated && !shouldRetry) {
      //   return undefined
      // }
      if (event.data.data().status !== Model.OrderStatus.PaymentRequested && !shouldRetry) {
        return undefined
      }

      if (!event.params || !event.params.orderID) {
        throw Error('orderID must be non-null')
      }

      const orderObject = new OrderObject(event.params.orderID, event)
      const flow = new Flow.Line([
        prepareRequiredData,
        validateShopIsActive,
        validateSKUIsActive,
        validateCardExpired,
        validateAndDecreaseStock,
        stripeCharge,
        updateOrder,
        updateOrderShops,
        setOrderTask
      ])

      try {
        await flow.run(orderObject)
      } catch (e) {
        throw e
      }

      return Promise.resolve()
    } catch (error) {
      console.error(error)
      if (error.constructor === Retrycf.CompletedError) {
        // 関数の重複実行エラーだった場合は task にエラーを書かずに undefined を返して処理を抜ける
        return undefined
      } else {
        // await Task.failure(event.data.ref, TaskAction.resume, event.data.data(), new TaskError(error.toString()))
      }

      if (error.constructor !== FlowError) {
        await NeoTask.setFatalAndPostToSlack(event, 'orderPaymentRequested', error.toString())
      }

      return Promise.reject(error)
    }
  }
}
