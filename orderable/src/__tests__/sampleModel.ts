import { Pring, property } from 'pring'
import * as Orderable from '../orderable'
import * as Retrycf from 'retrycf'
// import * as Orderable from '@star__hoshi/orderable'

export class SampleUser extends Pring.Base implements Orderable.Model.User {
  @property stripeCustomerID?: string
}

export class SampleShop extends Pring.Base implements Orderable.Model.Shop {
  @property name?: string
  @property isActive: boolean = true
  @property freePostageMinimumPrice: number = -1
}

export class SampleProduct extends Pring.Base implements Orderable.Model.Product {
  @property name?: string

  static async default() {
    const p = new SampleProduct()
    p.name = 'sample product'
    await p.save()
    return p
  }
}

export class SampleSKU extends Pring.Base implements Orderable.Model.SKU {
  @property price: number = 0
  @property stockType: Orderable.Model.StockType = Orderable.Model.StockType.Unknown
  @property stock: number = 0
  @property isPublished: boolean = true
  @property isActive: boolean = true

  static async default() {
    const sku = new SampleSKU()
    sku.price = 1000
    sku.stockType = Orderable.Model.StockType.Finite
    sku.stock = 100
    await sku.save()
    return sku
  }
}

export class SampleStripeCharge extends Pring.Base implements Orderable.Model.StripeCharge {
  @property cardID?: string
  @property customerID?: string
  @property chargeID?: string
  static default() {
    const stripeCharge = new SampleStripeCharge()
    stripeCharge.cardID = 'card_1BnhthKZcOra3JxsKaxABsRj'
    stripeCharge.customerID = 'cus_CC65RZ8Gf6zi7V'
    return stripeCharge
  }
}

export class SampleOrder extends Pring.Base implements Orderable.Model.Order, Retrycf.HasNeoTask {
  @property testParameter: string = 'hoge'

  @property user: FirebaseFirestore.DocumentReference
  @property amount: number = 0
  @property paidDate: FirebaseFirestore.FieldValue
  @property expirationDate: FirebaseFirestore.FieldValue = new Date().setHours(new Date().getHours() + 1)
  @property currency?: string
  @property orderSKUs: Pring.ReferenceCollection<SampleOrderSKU> = new Pring.ReferenceCollection(this)

  @property paymentStatus: Orderable.Model.OrderPaymentStatus = Orderable.Model.OrderPaymentStatus.Created
  @property stripe?: SampleStripeCharge
  @property neoTask?: Retrycf.NeoTask

  static async default(user: SampleUser, orderSKUs: SampleOrderSKU[]) {
    const o = new SampleOrder()
    o.user = user.reference
    o.amount = 1000
    o.currency = 'jpy'
    o.paymentStatus = Orderable.Model.OrderPaymentStatus.Created
    o.stripe = SampleStripeCharge.default()
    orderSKUs.forEach(s => {
      o.orderSKUs.insert(s)
    })
    await o.save()
    return o
  }
}

export class SampleOrderShop extends Pring.Base implements Orderable.Model.OrderShop {
  @property orderSKUs: Pring.ReferenceCollection<SampleOrderSKU> = new Pring.ReferenceCollection(this)
  @property paymentStatus: Orderable.Model.OrderShopPaymentStatus = Orderable.Model.OrderShopPaymentStatus.Unknown

  @property order: FirebaseFirestore.DocumentReference
  @property user: FirebaseFirestore.DocumentReference
}

export class SampleOrderSKU extends Pring.Base implements Orderable.Model.OrderSKU<SampleSKU, SampleProduct> {
  // @property orderShop: FirebaseFirestore.DocumentReference
  @property snapshotSKU?: SampleSKU
  @property snapshotProduct?: SampleProduct
  @property quantity: number = 0

  // @property order: FirebaseFirestore.DocumentReference
  // @property user: FirebaseFirestore.DocumentReference
  @property sku: FirebaseFirestore.DocumentReference
  // @property product: FirebaseFirestore.DocumentReference
  @property shop: FirebaseFirestore.DocumentReference

  static async default(sku: SampleSKU, product: SampleProduct, shop: SampleShop) {
    const oSKU = new SampleOrderSKU()
    oSKU.snapshotSKU = sku.rawValue()
    oSKU.snapshotProduct = product.rawValue()
    oSKU.quantity = 1
    oSKU.sku = sku.reference
    oSKU.shop = shop.reference
    await oSKU.save()
    return oSKU
  }
}
