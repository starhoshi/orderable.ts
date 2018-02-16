/// <reference types="stripe" />
import * as functions from 'firebase-functions';
import * as Stripe from 'stripe';
import * as Flow from '@1amageek/flow';
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { OrderProtocol, OrderShopProtocol, OrderSKUProtocol, ProductProtocol, ShopProtocol, SKUProtocol, UserProtocol } from './protocol';
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
