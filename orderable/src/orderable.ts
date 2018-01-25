import { Retrycf } from 'retrycf'
import { Pring, property } from 'pring'

// export class HasNeoTask extends Pring.Base {
//   @property neoTask?: HasNeoTask
// }

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
    // @property sku: FirebaseFirestore.DocumentReference
    // @property product: FirebaseFirestore.DocumentReference
    // @property shop: FirebaseFirestore.DocumentReference
  }

}
