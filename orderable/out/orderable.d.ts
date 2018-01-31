import * as functions from 'firebase-functions';
import { Event } from 'firebase-functions';
import * as FirebaseFirestore from '@google-cloud/firestore';
import { Pring } from 'pring';
import { Retrycf } from 'retrycf';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
export declare const initialize: (options: {
    adminOptions: any;
    stripeToken: string;
    slack: SlackParams;
}) => void;
export interface SlackParams {
    enabled: boolean;
    url?: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
}
export declare enum ValidationErrorType {
    ShopIsNotActive = "ShopIsNotActive",
    SKUIsNotActive = "SKUIsNotActive",
    OutOfStock = "OutOfStock",
    StripeCardError = "StripeCardError",
    StripeInvalidRequestError = "StripeInvalidRequestError",
    StripeCardExpired = "StripeCardExpired",
}
export declare class FlowError extends Error {
    task: Retrycf.INeoTask;
    error: any;
    constructor(task: Retrycf.INeoTask, error: any);
}
export declare class NeoTask extends Retrycf.NeoTask {
    static setFatalAndPostToSlackIfRetryCountIsMax(event: functions.Event<DeltaDocumentSnapshot>): Promise<void>;
    static setFatalAndPostToSlack(event: functions.Event<DeltaDocumentSnapshot>, step: string, error: any): Promise<Retrycf.NeoTask>;
}
export declare namespace Model {
    class HasNeoTask extends Pring.Base {
        neoTask?: HasNeoTask;
    }
    class User extends Pring.Base {
    }
    class Shop extends Pring.Base {
        name?: string;
        isActive: boolean;
        freePostageMinimumPrice: number;
    }
    class Product extends Pring.Base {
        name?: string;
    }
    enum StockType {
        Unknown = "unknown",
        Finite = "finite",
        Infinite = "infinite",
    }
    class SKU extends Pring.Base {
        price: number;
        stockType: StockType;
        stock: number;
        isPublished: boolean;
        isActive: boolean;
    }
    enum OrderPaymentStatus {
        Unknown = 0,
        Created = 1,
        PaymentRequested = 2,
        WaitingForPayment = 3,
        Paid = 4,
    }
    class StripeCharge extends Pring.Base {
        cardID?: string;
        customerID?: string;
        chargeID?: string;
    }
    class Order extends HasNeoTask {
        user: FirebaseFirestore.DocumentReference;
        amount: number;
        paidDate: FirebaseFirestore.FieldValue;
        expirationDate: FirebaseFirestore.FieldValue;
        currency?: string;
        orderSKUs: Pring.ReferenceCollection<OrderSKU>;
        paymentStatus: OrderPaymentStatus;
        stripe?: StripeCharge;
        isCharged(): boolean;
    }
    enum OrderShopPaymentStatus {
        Unknown = 0,
        Created = 1,
        Paid = 2,
    }
    class OrderShop extends Pring.Base {
        orderSKUs: Pring.ReferenceCollection<OrderSKU>;
        paymentStatus: OrderShopPaymentStatus;
        user: FirebaseFirestore.DocumentReference;
    }
    class OrderSKU extends Pring.Base {
        snapshotSKU?: SKU;
        snapshotProduct?: Product;
        quantity: number;
        sku: FirebaseFirestore.DocumentReference;
        shop: FirebaseFirestore.DocumentReference;
    }
}
export declare enum StripeErrorType {
    StripeCardError = "StripeCardError",
    RateLimitError = "RateLimitError",
    StripeInvalidRequestError = "StripeInvalidRequestError",
    StripeAPIError = "StripeAPIError",
    StripeConnectionError = "StripeConnectionError",
    StripeAuthenticationError = "StripeAuthenticationError",
    UnexpectedError = "UnexpectedError",
}
export declare class StripeError extends Error {
    type: StripeErrorType;
    message: string;
    statusCode: number;
    requestId: string;
    error: any;
    constructor(error: any);
    setNeoTask(event: functions.Event<DeltaDocumentSnapshot>, step: string): Promise<NeoTask>;
}
export declare namespace Functions {
    const orderPaymentRequested: (event: Event<DeltaDocumentSnapshot>) => Promise<void>;
}
