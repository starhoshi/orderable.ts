/// <reference types="stripe" />
import * as functions from 'firebase-functions';
import * as Stripe from 'stripe';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import * as EventResponse from 'event-response';
import { OrderProtocol, OrderSKUProtocol, ShopProtocol, SKUProtocol, UserProtocol } from './protocol';
import * as Tart from '@star__hoshi/tart';
export declare namespace Functions {
    class OrderSKUObject {
        orderSKU: Tart.Snapshot<OrderSKUProtocol>;
        sku: Tart.Snapshot<SKUProtocol>;
        static fetchFrom(order: Tart.Snapshot<OrderProtocol>): Promise<OrderSKUObject[]>;
    }
    enum PaymentAgencyType {
        Unknown = 0,
        Stripe = 1,
    }
    class OrderObject {
        event: functions.Event<DeltaDocumentSnapshot>;
        orderID: string;
        order: Tart.Snapshot<OrderProtocol>;
        previousOrder: Tart.Snapshot<OrderProtocol>;
        shops?: Tart.Snapshot<ShopProtocol>[];
        user?: Tart.Snapshot<UserProtocol>;
        orderSKUObjects?: OrderSKUObject[];
        stripeCharge?: Stripe.charges.ICharge;
        stripeCard?: Stripe.cards.ICard;
        getShops(): Promise<void>;
        constructor(event: functions.Event<DeltaDocumentSnapshot>);
        readonly result: EventResponse.Result;
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
    const orderPaymentRequested: (orderObject: OrderObject) => Promise<void>;
}
