/// <reference types="stripe" />
import * as functions from 'firebase-functions';
import * as FirebaseFirestore from '@google-cloud/firestore';
import * as Stripe from 'stripe';
import { Pring } from 'pring';
import * as Retrycf from 'retrycf';
import * as Flow from '@1amageek/flow';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import * as EventResponse from 'event-response';
export * from './util';
export * from './error';
export declare let firestore: FirebaseFirestore.Firestore;
export declare const initialize: (options: {
    adminOptions: any;
    stripeToken: string;
}) => void;
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
    expirationDate: FirebaseFirestore.FieldValue;
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
export declare namespace Functions {
    class OrderSKUObject<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol> {
        orderSKU: OrderSKU;
        sku: SKU;
        static fetchFrom<OrderSKU extends OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKU extends SKUProtocol>(order: OrderProtocol, orderSKUType: {
            new (): OrderSKU;
        }, skuType: {
            new (): SKU;
        }): Promise<OrderSKUObject<OrderSKUProtocol<SKUProtocol, ProductProtocol>, SKUProtocol>[]>;
    }
    interface InitializableClass<Order extends OrderProtocol, Shop extends ShopProtocol, User extends UserProtocol, SKU extends SKUProtocol, Product extends ProductProtocol, OrderShop extends OrderShopProtocol, OrderSKU extends OrderSKUProtocol<SKU, Product>> {
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
    class OrderObject<Order extends OrderProtocol, Shop extends ShopProtocol, User extends UserProtocol, SKU extends SKUProtocol, Product extends ProductProtocol, OrderShop extends OrderShopProtocol, OrderSKU extends OrderSKUProtocol<SKU, Product>> implements Flow.Dependency {
        initializableClass: InitializableClass<Order, Shop, User, SKU, Product, OrderShop, OrderSKU>;
        event: functions.Event<DeltaDocumentSnapshot>;
        orderID: string;
        order: Order;
        previousOrder: Order;
        shops?: Shop[];
        user?: User;
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
    /**
     * Start order processing.
     * @param orderObject
     */
    const orderPaymentRequested: (orderObject: OrderObject<OrderProtocol, ShopProtocol, UserProtocol, SKUProtocol, ProductProtocol, OrderShopProtocol, OrderSKUProtocol<SKUProtocol, ProductProtocol>>) => Promise<void>;
}
