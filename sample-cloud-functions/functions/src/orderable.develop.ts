import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Event, TriggerAnnotated } from 'firebase-functions'
import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import { Pring, property } from 'pring'
import { Retrycf } from 'retrycf'
import * as Flow from '@1amageek/flow'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as request from 'request'
import * as Slack from 'slack-node'

let stripe: Stripe
let firestore: FirebaseFirestore.Firestore
let slackParams: SlackParams | undefined = undefined
const slack = new Slack()
let adminOptions: any

export const initialize = (options: { adminOptions: any, stripeToken: string, slack?: SlackParams }) => {
  Pring.initialize(options.adminOptions)
  Retrycf.initialize(options.adminOptions)
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  stripe = new Stripe(options.stripeToken)
  adminOptions = options.adminOptions

  if (options.slack) {
    slackParams = options.slack
    slack.setWebhook(options.slack.url)
  }
}

export interface SlackParams {
  url: string
  channel: string
  username?: string
  iconEmoji?: string
}

class Webhook {
  static async postError(step: string, error: any, path: string) {
    if (!slackParams) { return }

    const attachments = {
      color: 'danger',
      ts: new Date().getTime() / 1000,
      fields: [
        { title: 'step', value: step, short: true },
        { title: 'project_id', value: adminOptions.projectId || 'Unknown', short: true },
        { title: 'path', value: path },
        { title: 'error', value: error }
      ]
    }

    slack.webhook({
      channel: slackParams.channel,
      icon_emoji: slackParams.iconEmoji,
      username: slackParams.username || 'cloud-functions',
      text: step,
      attachments: [attachments]
    }, (e, response) => {
      if (response.status === 'fail') {
        console.warn('slack error', e)
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
  StripeCardExpired = 'StripeCardExpired',
  PaymentInfoNotFound = 'PaymentInfoNotFound'
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
  static async setFatalAndPostToSlackIfRetryCountIsMax(event: functions.Event<DeltaDocumentSnapshot>) {
    const neoTask = await NeoTask.setFatalIfRetryCountIsMax(event)
    if (neoTask) {
      Webhook.postError('retry error', JSON.stringify(neoTask.rawValue()), event.data.ref.path)
    }
  }

  static async setFatalAndPostToSlack(event: functions.Event<DeltaDocumentSnapshot>, step: string, error: any) {
    Webhook.postError(step, error.toString(), event.data.ref.path)
    return NeoTask.setFatal(event, step, error)
  }
}

export namespace Model {
  export class Base extends Pring.Base {
    didFetchCompleted(): Boolean {
      return this.isSaved
    }

    getCollectionPath(): string {
      return `version/${this.getVersion()}/${this.getModelName()}`
    }

    async get(id: string) {
      return firestore.collection(this.getCollectionPath()).doc(id).get().then(s => {
        this.init(s)
        return this
      })
    }
  }

  export interface HasNeoTask extends Base {
    neoTask?: HasNeoTask | FirebaseFirestore.FieldValue
  }

  export interface User extends Base {
    stripeCustomerID?: string
  }

  export interface Shop extends Base {
    name?: string
    isActive: boolean
    freePostageMinimumPrice: number
  }

  export interface Product extends Base {
    name?: string
  }

  export enum StockType {
    Unknown = 'unknown',
    Finite = 'finite',
    Infinite = 'infinite'
  }

  export interface SKU extends Base {
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

  export interface StripeCharge extends Pring.Base {
    cardID?: string
    customerID?: string
    chargeID?: string
  }

  export interface Order extends HasNeoTask {
    user: FirebaseFirestore.DocumentReference
    amount: number
    paidDate: FirebaseFirestore.FieldValue
    expirationDate: FirebaseFirestore.FieldValue
    currency?: string
    orderSKUs: Pring.ReferenceCollection<OrderSKU<SKU, Product>>
    paymentStatus: OrderPaymentStatus
    stripe?: StripeCharge
  }

  export enum OrderShopPaymentStatus {
    Unknown = 0,
    Created = 1,
    Paid = 2
  }
  export interface OrderShop extends Base {
    orderSKUs: Pring.ReferenceCollection<OrderSKU<SKU, Product>>
    paymentStatus: OrderShopPaymentStatus
    user: FirebaseFirestore.DocumentReference
  }

  export interface OrderSKU<T extends SKU, P extends Product> extends Base {
    snapshotSKU?: T
    snapshotProduct?: P
    quantity: number
    sku: FirebaseFirestore.DocumentReference
    shop: FirebaseFirestore.DocumentReference
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
  export class OrderSKUObject<OrderSKU extends Model.OrderSKU<Model.SKU, Model.Product>, SKU extends Model.SKU> {
    orderSKU: OrderSKU
    sku: SKU

    static async fetchFrom<OrderSKU extends Model.OrderSKU<Model.SKU, Model.Product>, SKU extends Model.SKU>(order: Model.Order, orderSKUType: { new(): OrderSKU }, skuType: { new(): SKU }) {
      // const orderSKURefs = await order.orderSKUs.get(Model.OrderSKU)
      const orderSKURefs = await order.orderSKUs.get(orderSKUType)
      const orderSKUObjects = await Promise.all(orderSKURefs.map(orderSKURef => {
        return new orderSKUType().get(orderSKURef.id).then(s => {
          // const orderSKU = s as Model.OrderSKU
          const orderSKUObject = new OrderSKUObject()
          orderSKUObject.orderSKU = s
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
    Order extends Model.Order,
    Shop extends Model.Shop,
    User extends Model.User,
    SKU extends Model.SKU,
    Product extends Model.Product,
    OrderShop extends Model.OrderShop,
    OrderSKU extends Model.OrderSKU<SKU, Product>> {
    order: { new(): Order }
    shop: { new(): Shop }
    user: { new(): User }
    sku: { new(): SKU }
    product: { new(): Product }
    orderShop: { new(): OrderShop }
    orderSKU: { new(): OrderSKU }
  }

  enum PaymentAgencyType {
    Unknown,
    Stripe
  }

  export class OrderObject<
    Order extends Model.Order,
    Shop extends Model.Shop,
    User extends Model.User,
    SKU extends Model.SKU,
    Product extends Model.Product,
    OrderShop extends Model.OrderShop,
    OrderSKU extends Model.OrderSKU<SKU, Product>> implements Flow.Dependency {

    initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>

    orderID: string
    event: functions.Event<DeltaDocumentSnapshot>
    order?: Model.Order
    shops?: Model.Shop[]
    user?: Model.User
    orderSKUObjects?: OrderSKUObject<OrderSKU, SKU>[]
    stripeCharge?: Stripe.charges.ICharge
    stripeCard?: Stripe.cards.ICard

    async getShops() {
      this.shops = await Promise.all(this.orderSKUObjects!.map(orderSKUObject => {
        return orderSKUObject.orderSKU.shop
      }).filter((shopRef, index, self) => { // 重複排除
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
    }

    isCharged(): boolean {
      if (this.order && this.order.stripe && this.order.stripe.chargeID) {
        return true
      }
      return false
    }

    paymentAgencyType() {
      if (!this.order) {
        return PaymentAgencyType.Unknown
      }

      if (this.order.stripe) {
        return PaymentAgencyType.Stripe
      }

      return PaymentAgencyType.Unknown
    }

    updateStock(operator: Operator) {
      const orderSKUObjects = this.orderSKUObjects
      const order = this.order
      if (!orderSKUObjects) { throw Error('orderSKUObjects must be non-null') }
      if (!order) { throw Error('orderSKUObjects must be non-null') }

      return firestore.runTransaction(async (transaction) => {
        const promises: Promise<any>[] = []
        for (const orderSKUObject of orderSKUObjects) {
          const skuRef = firestore.collection(new this.initializableClass.sku().getCollectionPath()).doc(orderSKUObject.sku.id)
          const t = transaction.get(skuRef).then(tsku => {
            const quantity = orderSKUObject.orderSKU.quantity * operator
            console.log(tsku.data())
            const newStock = tsku.data()!.stock + quantity

            if (newStock >= 0) {
              transaction.update(skuRef, { stock: newStock })
            } else {
              throw new Retrycf.ValidationError(ValidationErrorType.OutOfStock,
                `${orderSKUObject.orderSKU.snapshotProduct!.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`)
            }
          })
          promises.push(t)
        }

        // // 重複実行された時に、2回目の実行を弾く
        const step = 'validateAndDecreaseStock'
        // promises.push(KomercoNeoTask.markComplete(this.event, transaction, 'validateAndDecreaseStock'))
        const orderRef = firestore.doc(order.getPath())
        const orderPromise = transaction.get(orderRef).then(tref => {
          if (Retrycf.NeoTask.isCompleted(this.event, 'validateAndDecreaseStock')) {
            throw new Retrycf.CompletedError('validateAndDecreaseStock')
          } else {
            const neoTask = new Retrycf.NeoTask(this.event.data)
            neoTask.completed[step] = true
            transaction.update(orderRef, { neoTask: neoTask.rawValue() })
          }
        })
        promises.push(orderPromise)

        return Promise.all(promises)
      })
    }
  }

  export enum Operator {
    plus = +1,
    minus = -1
  }

  const prepareRequiredData: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = await new orderObject.initializableClass.order().get(orderObject.orderID)
        orderObject.order = order

        const user = await new orderObject.initializableClass.user().get(order.user.id)
        orderObject.user = user

        const orderSKUObjects = await OrderSKUObject.fetchFrom(order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku)
        orderObject.orderSKUObjects = orderSKUObjects

        await orderObject.getShops()

        if (orderObject.paymentAgencyType() === PaymentAgencyType.Stripe) {
          const stripeCard = await stripe.customers.retrieveCard(order.stripe!.customerID!, order.stripe!.cardID!)
          orderObject.stripeCard = stripeCard
          console.log('stripe', order.stripe)
        }

        return orderObject
      } catch (error) {
        // ここで起きるエラーは取得エラーのみのはずなので retry
        const neoTask = await NeoTask.setRetry(orderObject.event, 'prepareRequiredData', error)
        throw new FlowError(neoTask, error)
      }
    })

  const validateShopIsActive: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const shops = orderObject.shops!

        // 決済済みだったらスキップして良い
        if (orderObject.isCharged()) {
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

  const validateSKUIsActive: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const orderSKUObjects = orderObject.orderSKUObjects!

        // 決済済みだったらスキップして良い
        if (orderObject.isCharged()) {
          return orderObject
        }

        orderSKUObjects.forEach((orderSKUObject, index) => {
          if (!orderSKUObject.sku.isActive) {
            throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive,
              `商品「${orderSKUObject.orderSKU.snapshotProduct!.name}」は現在ご利用いただけません。`)
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

  const validatePaymentMethod: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        // 決済済みだったらスキップ
        if (orderObject.isCharged()) {
          return orderObject
        }

        switch (orderObject.paymentAgencyType()) {
          case PaymentAgencyType.Stripe:
            const stripeCard = orderObject.stripeCard!
            const now = new Date(new Date().getFullYear(), new Date().getMonth())
            const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1)

            if (expiredDate < now) {
              throw new Retrycf.ValidationError(ValidationErrorType.StripeCardExpired, 'カードの有効期限が切れています。')
            }
            break
          default:
            throw new Retrycf.ValidationError(ValidationErrorType.PaymentInfoNotFound, '決済情報が登録されていません。')
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

  const validateAndDecreaseStock: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        // 決済済みだったらスキップして良い
        if (orderObject.isCharged()) {
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

  const stripeCharge = async (order: Model.Order) => {
    return await stripe.charges.create(
      {
        amount: order.amount,
        currency: order.currency!,
        customer: order.stripe!.customerID, // TODO: if stripe
        source: order.stripe!.cardID, // TODO: if stripe
        transfer_group: order.id,
        metadata: {
          orderID: order.id
          // , rawValue: order.rawValue()
        }
      },
      {
        idempotency_key: order.id
      }
    ).catch(e => {
      throw new StripeError(e)
    })
  }

  const payment: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!
        const user = orderObject.user!

        // 決済済み
        if (orderObject.isCharged()) {
          return orderObject
        }

        switch (orderObject.paymentAgencyType()) {
          case PaymentAgencyType.Stripe:
            orderObject.stripeCharge = await stripeCharge(order)
            break
          default:
          // nothing to do
        }

        return orderObject
      } catch (error) {
        // 在庫数を減らした後に stripe.charge が失敗したので、在庫数を元に戻す
        await orderObject.updateStock(Operator.plus)
        await NeoTask.clearComplete(orderObject.event)

        if (error.constructor === StripeError) {
          const stripeError = new StripeError(error)
          const neoTask = await stripeError.setNeoTask(orderObject.event, 'payment')
          throw new FlowError(neoTask, error)
        }

        throw (error)
      }
    })

  /// ここでこけたらおわり、 charge が浮いている状態になる。
  const updateOrder: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        const order = orderObject.order!

        // 決済済み
        if (orderObject.isCharged()) {
          return orderObject
        }

        switch (orderObject.paymentAgencyType()) {
          case PaymentAgencyType.Stripe:
            const charge = orderObject.stripeCharge!

            order.paymentStatus = Model.OrderPaymentStatus.Paid
            order.stripe!.chargeID = charge.id
            order.paidDate = FirebaseFirestore.FieldValue.serverTimestamp()
            // FIXME: Error: Cannot encode type ([object Object]) to a Firestore Value
            // await order.update()
            await order.reference.update({
              paymentStatus: Model.OrderPaymentStatus.Paid,
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
        // ここでコケたら stripeChargeID すらわからなくなってしまうので retry もできないので fatal
        const neoTask = await NeoTask.setFatalAndPostToSlack(orderObject.event, 'updateOrder', error)
        throw new FlowError(neoTask, error)
      }
    })

  const updateOrderShops: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        await firestore.collection(new orderObject.initializableClass.orderShop().getCollectionPath())
          .where('order', '==', firestore.collection(new orderObject.initializableClass.order().getCollectionPath()).doc(orderObject.orderID))
          .get()
          .then(snapshot => {
            const batch = firestore.batch()

            // OrderShopStatus が Create のだけ Paid に更新する
            snapshot.docs.filter(doc => {
              const orderShop = new orderObject.initializableClass.orderShop()
              orderShop.init(doc)
              return orderShop.paymentStatus === Model.OrderShopPaymentStatus.Created
            }).forEach(doc => {
              batch.update(doc.ref, {
                paymentStatus: Model.OrderShopPaymentStatus.Paid,
                updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
              })
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

  const setOrderTask: Flow.Step<OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>>
    = new Flow.Step(async (orderObject) => {
      try {
        await NeoTask.success(orderObject.event)

        return orderObject
      } catch (error) {
        // 失敗する可能性があるのは update の失敗だけなので retry
        const neoTask = await NeoTask.setRetry(orderObject.event, 'setOrderTask', error)
        throw new FlowError(neoTask, error)
      }
    })

  export const orderPaymentRequested = async (event: Event<DeltaDocumentSnapshot>, orderObject: OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>) => {
    // functions.firestore.document(`version/1/order/{orderID}`).onUpdate(async event => {
    try {
      const shouldRetry = NeoTask.shouldRetry(event.data)
      await NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(event)

      // status が payment requested に変更された時
      // もしくは should retry が true だった時にこの functions は実行される
      // TODO: Retry
      if (event.data.previous.data().paymentStatus === Model.OrderPaymentStatus.Created && event.data.data().paymentStatus === Model.OrderPaymentStatus.PaymentRequested) {
        // 処理実行、リトライは実行されない
      } else {
        return undefined
      }
      if (event.data.data().paymentStatus !== Model.OrderPaymentStatus.PaymentRequested && !shouldRetry) {
        return undefined
      }

      if (!event.params || !event.params.orderID) {
        throw Error('orderID must be non-null')
      }

      const flow = new Flow.Line([
        prepareRequiredData,
        validateShopIsActive,
        validateSKUIsActive,
        validatePaymentMethod,
        validateAndDecreaseStock,
        payment,
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
      }

      if (error.constructor !== FlowError) {
        await NeoTask.setFatalAndPostToSlack(event, 'orderPaymentRequested', error.toString())
      }

      return Promise.reject(error)
    }
  }
}
