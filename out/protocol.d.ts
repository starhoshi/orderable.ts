import * as EventResponse from 'event-response';
import * as Retrycf from 'retrycf';
import * as Tart from '@star__hoshi/tart';
export declare enum Path {
    User = "version/1/user",
    Shop = "version/1/shop",
    Product = "version/1/product",
    SKU = "version/1/sku",
    Order = "version/1/order",
    OrderShop = "version/1/ordershop",
    OrderSKU = "version/1/ordersku",
}
export interface UserProtocol extends Tart.Timestamps {
    stripeCustomerID?: string;
}
export interface ShopProtocol extends Tart.Timestamps {
    name?: string;
    isActive: boolean;
    freePostageMinimumPrice: number;
}
export interface ProductProtocol extends Tart.Timestamps {
    name?: string;
}
export declare enum StockType {
    Unknown = "unknown",
    Finite = "finite",
    Infinite = "infinite",
}
export interface SKUProtocol extends Tart.Timestamps {
    price: number;
    stockType: StockType;
    stock: number;
    isPublished: boolean;
    isActive: boolean;
}
export declare enum OrderPaymentStatus {
    Unknown = 0,
    Created = 1,
    PaymentRequested = 2,
    WaitingForPayment = 3,
    Paid = 4,
}
export interface StripeProtocol {
    cardID?: string;
    customerID?: string;
    chargeID?: string;
}
export interface OrderProtocol extends Tart.Timestamps {
    user: FirebaseFirestore.DocumentReference;
    amount: number;
    paidDate?: Date;
    expirationDate?: Date;
    currency?: string;
    paymentStatus: OrderPaymentStatus;
    stripe?: StripeProtocol;
    completed?: {
        [id: string]: boolean;
    };
    orderPaymentRequestedResult?: EventResponse.IResult;
    retry?: Retrycf.IRetry;
}
export declare enum OrderShopPaymentStatus {
    Unknown = 0,
    Created = 1,
    Paid = 2,
}
export interface OrderShopProtocol extends Tart.Timestamps {
    paymentStatus: OrderShopPaymentStatus;
    user: FirebaseFirestore.DocumentReference;
    order: FirebaseFirestore.DocumentReference;
}
export interface OrderSKUProtocol extends Tart.Timestamps {
    snapshotSKU?: SKUProtocol;
    snapshotProduct?: ProductProtocol;
    quantity: number;
    sku: FirebaseFirestore.DocumentReference;
    shop: FirebaseFirestore.DocumentReference;
}
