import * as EventResponse from 'event-response';
import * as Retrycf from 'retrycf';
import * as Tart from './tart';
export interface UserProtocol extends Tart.Pring {
    stripeCustomerID?: string;
}
export interface ShopProtocol extends Tart.Pring {
    name?: string;
    isActive: boolean;
    freePostageMinimumPrice: number;
}
export interface ProductProtocol extends Tart.Pring {
    name?: string;
}
export declare enum StockType {
    Unknown = "unknown",
    Finite = "finite",
    Infinite = "infinite",
}
export interface SKUProtocol extends Tart.Pring {
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
export interface OrderProtocol extends Tart.Pring {
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
    result?: EventResponse.IResult;
    retry?: Retrycf.IRetry;
}
export declare enum OrderShopPaymentStatus {
    Unknown = 0,
    Created = 1,
    Paid = 2,
}
export interface OrderShopProtocol extends Tart.Pring {
    paymentStatus: OrderShopPaymentStatus;
    user: FirebaseFirestore.DocumentReference;
}
export interface OrderSKUProtocol<T extends SKUProtocol, P extends ProductProtocol> extends Tart.Pring {
    snapshotSKU?: T;
    snapshotProduct?: P;
    quantity: number;
    sku: FirebaseFirestore.DocumentReference;
    shop: FirebaseFirestore.DocumentReference;
}
