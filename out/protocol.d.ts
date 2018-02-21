import { Pring } from 'pring';
import * as EventResponse from 'event-response';
import * as Retrycf from 'retrycf';
export interface UserProtocol extends Pring.Base {
    stripeCustomerID?: string;
}
export interface ShopProtocol extends Pring.Base {
    name?: string;
    isActive: boolean;
    freePostageMinimumPrice: number;
}
export interface ProductProtocol extends Pring.Base {
    name?: string;
}
export declare enum StockType {
    Unknown = "unknown",
    Finite = "finite",
    Infinite = "infinite",
}
export interface SKUProtocol extends Pring.Base {
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
export interface StripeProtocol extends Pring.Base {
    cardID?: string;
    customerID?: string;
    chargeID?: string;
}
export interface OrderProtocol extends Pring.Base {
    user: FirebaseFirestore.DocumentReference;
    amount: number;
    paidDate: FirebaseFirestore.FieldValue;
    expirationDate?: Date;
    currency?: string;
    orderSKUs: Pring.ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>;
    paymentStatus: OrderPaymentStatus;
    stripe?: StripeProtocol;
    completed?: {
        [id: string]: boolean;
    };
    result?: EventResponse.IResult;
    retry?: Retrycf.IRetry;
}
export declare enum OrderShopPaymentStatus {
    Unknown = 0,
    Created = 1,
    Paid = 2,
}
export interface OrderShopProtocol extends Pring.Base {
    orderSKUs: Pring.ReferenceCollection<OrderSKUProtocol<SKUProtocol, ProductProtocol>>;
    paymentStatus: OrderShopPaymentStatus;
    user: FirebaseFirestore.DocumentReference;
}
export interface OrderSKUProtocol<T extends SKUProtocol, P extends ProductProtocol> extends Pring.Base {
    snapshotSKU?: T;
    snapshotProduct?: P;
    quantity: number;
    sku: FirebaseFirestore.DocumentReference;
    shop: FirebaseFirestore.DocumentReference;
}
