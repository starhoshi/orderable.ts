// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'
import * as Orderable from './orderable'
import { Pring, property } from 'pring'
// import * as Orderable from '@star__hoshi/orderable'

export class SampleUser extends Orderable.Model.User {
  @property stripeCustomerID?: string
}

export class SampleShop extends Orderable.Model.Shop {
  @property name?: string
  @property isActive: boolean = true
  @property freePostageMinimumPrice: number = -1
}

export class SampleProduct extends Orderable.Model.Product {
  @property name?: string
}

export class SampleSKU extends Orderable.Model.SKU {
  @property price: number = 0
  @property stockType: Orderable.Model.StockType = Orderable.Model.StockType.Unknown
  @property stock: number = 0
  @property isPublished: boolean = true
  @property isActive: boolean = true
}

export class SampleStripeCharge extends Orderable.Model.StripeCharge {
  @property cardID?: string
  @property customerID?: string
  @property chargeID?: string
}

export class SampleOrder extends Orderable.Model.Order {
  @property testParameter: string = 'hoge'

  @property user: FirebaseFirestore.DocumentReference
  @property amount: number = 0
  @property paidDate: FirebaseFirestore.FieldValue
  @property expirationDate: FirebaseFirestore.FieldValue = new Date().setHours(new Date().getHours() + 1)
  @property currency?: string
  @property orderSKUs: Pring.ReferenceCollection<SampleOrderSKU> = new Pring.ReferenceCollection(this)

  @property paymentStatus: Orderable.Model.OrderPaymentStatus = Orderable.Model.OrderPaymentStatus.Created
  @property stripe?: SampleStripeCharge
}

export class SampleOrderShop extends Orderable.Model.OrderShop<SampleOrderSKU> {
  @property orderSKUs: Pring.ReferenceCollection<SampleOrderSKU> = new Pring.ReferenceCollection(this)
  @property paymentStatus: Orderable.Model.OrderShopPaymentStatus = Orderable.Model.OrderShopPaymentStatus.Unknown

  // @property order: FirebaseFirestore.DocumentReference
  @property user: FirebaseFirestore.DocumentReference
}

export class SampleOrderSKU extends Orderable.Model.OrderSKU {
  // @property orderShop: FirebaseFirestore.DocumentReference
  @property snapshotSKU?: SampleSKU
  @property snapshotProduct?: SampleProduct
  @property quantity: number = 0

  // @property order: FirebaseFirestore.DocumentReference
  // @property user: FirebaseFirestore.DocumentReference
  @property sku: FirebaseFirestore.DocumentReference
  // @property product: FirebaseFirestore.DocumentReference
  @property shop: FirebaseFirestore.DocumentReference
}
