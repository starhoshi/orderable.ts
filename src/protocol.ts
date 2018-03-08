import * as EventResponse from 'event-response'
import * as Retrycf from 'retrycf'

export interface UserProtocol {
  stripeCustomerID?: string
}

export interface ShopProtocol {
  name?: string
  isActive: boolean
  freePostageMinimumPrice: number
}

export interface ProductProtocol {
  name?: string
}

export enum StockType {
  Unknown = 'unknown',
  Finite = 'finite',
  Infinite = 'infinite'
}

export interface SKUProtocol {
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

export interface StripeProtocol {
  cardID?: string
  customerID?: string
  chargeID?: string
}

export interface OrderProtocol {
  user: FirebaseFirestore.DocumentReference
  amount: number
  paidDate?: Date
  expirationDate?: Date
  currency?: string
  paymentStatus: OrderPaymentStatus
  stripe?: StripeProtocol

  // Mission
  completed?: { [id: string]: boolean }
  // EventResponse
  result?: EventResponse.IResult
  // Retrycf
  retry?: Retrycf.IRetry

  // ReferenceCollection
  // orderSKUs: Pring.ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>
}

export enum OrderShopPaymentStatus {
  Unknown = 0,
  Created = 1,
  Paid = 2
}
export interface OrderShopProtocol {
  paymentStatus: OrderShopPaymentStatus
  user: FirebaseFirestore.DocumentReference

  // ReferenceCollection
  // orderSKUs: ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>
}

export interface OrderSKUProtocol<T extends SKUProtocol, P extends ProductProtocol> {
  snapshotSKU?: T
  snapshotProduct?: P
  quantity: number
  sku: FirebaseFirestore.DocumentReference
  shop: FirebaseFirestore.DocumentReference
}
