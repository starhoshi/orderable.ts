/// <reference types="stripe" />
import * as functions from 'firebase-functions';
import * as FirebaseFirestore from '@google-cloud/firestore';
import * as Stripe from 'stripe';
import { Pring } from 'pring';
import * as Retrycf from 'retrycf';
import * as Flow from '@1amageek/flow';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
export declare const initialize: (options: {
    adminOptions: any;
    stripeToken: string;
    slack?: SlackParams | undefined;
}) => void;
export interface SlackParams {
    url: string;
    channel: string;
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
    PaymentInfoNotFound = "PaymentInfoNotFound",
}
export declare class FlowError extends Error {
    task?: Retrycf.NeoTask;
    error: any;
    constructor(error: any, task?: Retrycf.NeoTask);
}
export declare class NeoTask extends Retrycf.NeoTask {
    static setFatalAndPostToSlackIfRetryCountIsMax<T extends Retrycf.HasNeoTask>(model: T): Promise<T>;
    static setFatalAndPostToSlack<T extends Retrycf.HasNeoTask>(model: T, step: string, error: any): Promise<T>;
}
export declare class PringUtil {
    static collectionPath<T extends Pring.Base>(model: T): string;
    static get<T extends Pring.Base>(klass: {
        new (): T;
    }, id: string): Promise<T>;
}
export declare namespace Model {
    interface User extends Pring.Base {
        stripeCustomerID?: string;
    }
    interface Shop extends Pring.Base {
        name?: string;
        isActive: boolean;
        freePostageMinimumPrice: number;
    }
    interface Product extends Pring.Base {
        name?: string;
    }
    enum StockType {
        Unknown = "unknown",
        Finite = "finite",
        Infinite = "infinite",
    }
    interface SKU extends Pring.Base {
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
    interface StripeCharge extends Pring.Base {
        cardID?: string;
        customerID?: string;
        chargeID?: string;
    }
    interface Order extends Pring.Base {
        user: FirebaseFirestore.DocumentReference;
        amount: number;
        paidDate: FirebaseFirestore.FieldValue;
        expirationDate: FirebaseFirestore.FieldValue;
        currency?: string;
        orderSKUs: Pring.ReferenceCollection<OrderSKU<SKU, Product>>;
        paymentStatus: OrderPaymentStatus;
        stripe?: StripeCharge;
    }
    enum OrderShopPaymentStatus {
        Unknown = 0,
        Created = 1,
        Paid = 2,
    }
    interface OrderShop extends Pring.Base {
        orderSKUs: Pring.ReferenceCollection<OrderSKU<SKU, Product>>;
        paymentStatus: OrderShopPaymentStatus;
        user: FirebaseFirestore.DocumentReference;
    }
    interface OrderSKU<T extends SKU, P extends Product> extends Pring.Base {
        snapshotSKU?: T;
        snapshotProduct?: P;
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
    setNeoTask<T extends Retrycf.HasNeoTask>(model: T, step: string): Promise<T>;
}
export declare namespace Functions {
    class OrderSKUObject<OrderSKU extends Model.OrderSKU<Model.SKU, Model.Product>, SKU extends Model.SKU> {
        orderSKU: OrderSKU;
        sku: SKU;
        static fetchFrom<OrderSKU extends Model.OrderSKU<Model.SKU, Model.Product>, SKU extends Model.SKU>(order: Model.Order, orderSKUType: {
            new (): OrderSKU;
        }, skuType: {
            new (): SKU;
        }): Promise<OrderSKUObject<Model.OrderSKU<Model.SKU, Model.Product>, Model.SKU>[]>;
    }
    interface InitializableClass<Order extends Model.Order & Retrycf.HasNeoTask, Shop extends Model.Shop, User extends Model.User, SKU extends Model.SKU, Product extends Model.Product, OrderShop extends Model.OrderShop, OrderSKU extends Model.OrderSKU<SKU, Product>> {
        order: {
            new (): Order;
        };
        shop: {
            new (): Shop;
        };
        user: {
            new (): User;
        };
        sku: {
            new (): SKU;
        };
        product: {
            new (): Product;
        };
        orderShop: {
            new (): OrderShop;
        };
        orderSKU: {
            new (): OrderSKU;
        };
    }
    enum PaymentAgencyType {
        Unknown = 0,
        Stripe = 1,
    }
    class OrderObject<Order extends Model.Order & Retrycf.HasNeoTask, Shop extends Model.Shop, User extends Model.User, SKU extends Model.SKU, Product extends Model.Product, OrderShop extends Model.OrderShop, OrderSKU extends Model.OrderSKU<SKU, Product>> implements Flow.Dependency {
        initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>;
        event: functions.Event<DeltaDocumentSnapshot>;
        orderID: string;
        order: Model.Order & Retrycf.HasNeoTask;
        previousOrder: Model.Order;
        shops?: Model.Shop[];
        user?: Model.User;
        orderSKUObjects?: OrderSKUObject<OrderSKU, SKU>[];
        stripeCharge?: Stripe.charges.ICharge;
        stripeCard?: Stripe.cards.ICard;
        getShops(): Promise<void>;
        constructor(event: functions.Event<DeltaDocumentSnapshot>, initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>);
        readonly isCharged: boolean;
        readonly paymentAgencyType: PaymentAgencyType;
        updateStock(operator: Operator, step?: string): Promise<any[]>;
    }
    enum Operator {
        plus = 1,
        minus = -1,
    }
    const orderPaymentRequested: (orderObject: OrderObject<Model.Order, Model.Shop, Model.User, Model.SKU, Model.Product, Model.OrderShop, Model.OrderSKU<Model.SKU, Model.Product>>) => Promise<void>;
}
